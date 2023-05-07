import { Event, Kind, nip19, Relay } from "npm:nostr-tools";
import { ensurePublicKey, PrivateKey } from "./keys.ts";
import { NostrProfile } from "./nostr.ts";
import {
  accumulateCompletionUsages,
  AccumulatedCompletionUsage,
  applyModeration,
  Chat,
  checkPuzzleSolved,
  CompletionUsage,
  createPuzzle,
  createPuzzleIntro,
  createReplyToQuestion,
  createResultAnnounce,
  Puzzle,
  ReplyToQuestion,
  validateQuestion,
  ValidQuestion,
} from "./openai.ts";
import { createEvent, createReplyEvent, publishEvent } from "./event.ts";
import { Brand, now } from "./utils.ts";

export async function publishPuzzle(context: {
  relays: Relay[];
  private_key: PrivateKey;
}) {
  const { relays, private_key } = context;

  const puzzle = await createPuzzle();
  const { intro, rules } = await createPuzzleIntro();

  const event = createEvent(private_key, {
    content: `${intro}

Q: ${puzzle.problem}

${rules}`,
  });

  for (const relay of context.relays) {
    publishEvent(relay, event);
  }

  await subscribePuzzleThread({ puzzle, event, relay: relays[0], private_key });
}

export async function subscribePuzzleThread(args: {
  puzzle: Puzzle;
  event: Event;
  relay: Relay;
  private_key: PrivateKey;
}) {
  const { puzzle, relay, private_key } = args;
  const event_puzzle = args.event;
  const public_key = ensurePublicKey(private_key);

  const usages: CompletionUsage[] = [];
  const chats_yes: Chat[] = [];

  const sub = relay.sub([
    {
      kinds: [Kind.Text],
      "#e": [event_puzzle.id],
      "#p": [public_key],
      since: now(),
    },
  ]);
  console.log(`Subscribed replies to a puzzle thread ${event_puzzle.id}`);

  const stream = new ReadableStream<Event>({
    start: (controller) => {
      sub.on("event", (event) => {
        controller.enqueue(event);
      });
    },
  });

  for await (const event_recieved of stream) {
    // Check if we are handling a targeted event
    if (
      event_recieved.pubkey !== public_key &&
      !event_recieved.tags.find((it) =>
        it[0] === "e" && it[1] === event_puzzle.id
      )
    ) {
      // If not, just ignore the event
      console.warn(
        "Recieved an event that is not targeted to the puzzle:",
        event_recieved,
      );
      continue;
    }

    // Check if the message is harmful
    const result_moderation = await applyModeration(
      event_recieved.content,
    );
    if (!result_moderation.approved) {
      // If so, just ignore the event (TODO: Reply and report the user)
      console.warn(
        "Message has been flagged as harmful:",
        event_recieved.content,
      );
      continue;
    }

    // Check if the message is a valid question
    const result_validation = await validateQuestion(
      puzzle,
      result_moderation.message,
    );
    usages.push(...result_validation.usages);

    if (!result_validation.valid) {
      // If not, reply with a validation message
      publishEvent(
        relay,
        createReplyEvent(private_key, event_recieved, relay, {
          content: result_validation.reply,
        }),
      );
      continue;
    }

    // Retrieve the context if any
    const context: Chat[] = [];

    const parent_tag = event_recieved.tags.find((it) =>
      it[0] === "e" && it[1] !== event_puzzle.id && it[3] === "reply"
    );
    const parent = parent_tag
      ? await relay.get({ ids: [parent_tag[1]] })
      : null;

    const grandparent_tag = parent?.tags.find((it) =>
      it[0] === "e" && it[1] !== event_puzzle.id && it[3] === "reply"
    );
    const grandparent = grandparent_tag
      ? await relay.get({
        ids: [grandparent_tag[1]],
      })
      : null;

    if (parent && grandparent) {
      context.push({
        question: grandparent.content as ValidQuestion,
        reply: parent.content as ReplyToQuestion,
      });
    }

    // Create a reply to the question
    const result_reply = await createReplyToQuestion({
      puzzle,
      question: result_validation.question,
      context,
    });
    if (result_reply.yes) {
      chats_yes.push({
        question: result_validation.question,
        reply: result_reply.reply,
      });
    }
    usages.push(...result_reply.usages);

    publishEvent(
      relay,
      createReplyEvent(private_key, event_recieved, relay, {
        content: result_reply.reply,
      }),
    );

    // If the puzzle has been solved, publish the answer and return.
    if (await checkPuzzleSolved({ puzzle, chats: chats_yes })) {
      const result_announce = await createResultAnnounce({
        winner: nip19.nprofileEncode({
          pubkey: event_recieved.pubkey,
          relays: [relay.url],
        }) as NostrProfile,
      });
      usages.push(...result_announce.usages);

      const usage = accumulateCompletionUsages(usages);
      console.log(usage);

      const cost = await calculateCost(usage);

      publishEvent(
        relay,
        createReplyEvent(private_key, event_puzzle, relay, {
          content: `${result_announce.intro}

A: ${puzzle.answer}

${result_announce.remark}
(total cost: ⚡${cost})`,
        }),
      );
      sub.unsub();
      return;
    }
  }
}

const COST_GPT_3_5 = 0.002 as const; // USD / 1K tokens
const COST_GPT_4_PROMPT = 0.03 as const; // USD / 1K tokens
const COST_GPT_4_COMPL = 0.06 as const; // USD / 1K tokens

const RATE_BTC_SATS = 100_000_000 as const; // BTC

type SATS = Brand<number, "SATS">;

async function calculateCost(usage: AccumulatedCompletionUsage): Promise<SATS> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
  );

  if (!res.ok) {
    console.error("Failed to fetch BTC price");
    return 0 as SATS;
  }

  const data = await res.json() as { bitcoin: { usd: number } };
  const rate_btc_usd = data.bitcoin.usd;

  const rate_usd_sats = RATE_BTC_SATS / rate_btc_usd;

  const usd_gpt_3_5 = usage.GPT_3_5.total_tokens / 1000 * COST_GPT_3_5;
  const usd_gpt_4 = usage.GPT_4.prompt_tokens / 1000 * COST_GPT_4_PROMPT +
    usage.GPT_4.completion_tokens / 1000 * COST_GPT_4_COMPL;

  return Math.round((usd_gpt_3_5 + usd_gpt_4) * rate_usd_sats) as SATS;
}
