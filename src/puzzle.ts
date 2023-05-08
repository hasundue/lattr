import { Event, Kind, nip10, nip19, Relay } from "npm:nostr-tools";
import { ensurePublicKey, PrivateKey } from "./keys.ts";
import { NostrProfile } from "./nostr.ts";
import {
  accumulateCompletionUsages,
  AccumulatedCompletionUsage,
  applyModeration,
  Chat,
  CompletionUsage,
  createPuzzle,
  createIntroduction,
  createReplyToQuestion,
  createResultAnnounce,
  validateMessage,
} from "./openai.ts";
import { createEvent, createReplyEvent, publishEvent } from "./event.ts";
import { Brand, now } from "./utils.ts";

export async function publishPuzzle(context: {
  relays: Relay[];
  privateKey: PrivateKey;
}) {
  const { relays, privateKey } = context;
  const public_key = ensurePublicKey(privateKey);
  const usages: CompletionUsage[] = [];

  /**
   * Publish a puzzle
   */
  const puzzle = await createPuzzle();
  usages.push(...puzzle.usages);

  const intro = await createIntroduction();
  usages.push(...intro.usages);

  const event_puzzle = createEvent(privateKey, {
    content: `${intro.preface}

Q: ${puzzle.problem}

${intro.request}`,
  });

  for (const relay of context.relays) {
    publishEvent(relay, event_puzzle);
  }

  /**
  /* Subscribe questions to the puzzle thread
  /*/
  const chat_history: Chat[] = [];
  const events_sub = [event_puzzle.id];

  const relay = relays[0];
  const sub = relay.sub([]);

  function updateSub(opts?: { newEvent?: string }) {
    if (opts?.newEvent) {
      events_sub.push(opts.newEvent);
    }
    const filter = {
      kinds: [Kind.Text],
      "#e": events_sub,
      "#p": [public_key],
      since: now(),
    };
    sub.sub([filter], {});
    console.log(
      `Updated the subscription to the puzzle thread ${event_puzzle.id}:`,
      filter,
    );
  }
  updateSub();

  const stream = new ReadableStream<Event>({
    start: (controller) => {
      sub.on("event", (event) => {
        controller.enqueue(event);
      });
    },
  });

  for await (const event_recieved of stream) {
    console.log("Checking if the event is targeted to me...");

    if (event_recieved.pubkey === public_key) {
      console.warn("This event is from me. Skip it...");
      continue;
    }

    if (event_recieved.created_at - event_puzzle.created_at < 10) {
      console.log("Skip the event because it's too quick...");
      continue;
    }

    const tags = nip10.parse(event_recieved);

    const tag_parent = tags.reply ?? tags.root;

    if (!tag_parent) {
      console.log("This event just mentions the thread. Skip it...");
      continue;
    }

    const event_parent = await relay.get({ ids: [tag_parent.id] });

    if (!event_parent) {
      console.warn("Parent event not found:", tag_parent);
      continue;
    }

    if (event_parent.pubkey !== public_key) {
      console.log("This event is not a direct mention to me. Skip it...");
      continue;
    }

    // Make sure the message is not harmful
    const result_moderation = await applyModeration(event_recieved.content);
    if (!result_moderation.approved) {
      console.warn("Message has been flagged as harmful. Skip it...");
      // TODO: Report and ignore the user
      continue;
    }

    // Check if the message is a valid question
    const result_validation = await validateMessage(
      puzzle,
      result_moderation.message,
    );
    usages.push(...result_validation.usages);

    // If not, reply with a validation message
    if (!result_validation.valid) {
      const reply = createReplyEvent({
        event: event_recieved,
        template: { content: result_validation.reply },
        relay,
        privateKey,
      });
      updateSub({ newEvent: reply.id });
      publishEvent(relay, reply);
      continue;
    }

    // Create a reply to the question
    const result_reply = await createReplyToQuestion({
      puzzle,
      question: result_validation.question,
      context: chat_history,
    });
    chat_history.push({
      question: result_validation.question,
      reply: result_reply.reply,
    });
    usages.push(...result_reply.usages);

    const reply = createReplyEvent({
      privateKey,
      event: event_recieved,
      relay,
      template: { content: result_reply.reply },
    });
    updateSub({ newEvent: reply.id });
    publishEvent(relay, reply);

    // If the puzzle has been solved, publish the answer and return.
    if (result_reply.solved) {
      // Unsubscribe from the puzzle thread as soon as possible
      // to avoid duplicated announcements
      sub.unsub();

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
        createReplyEvent({
          event: event_puzzle,
          relay,
          template: {
            content: `${result_announce.intro}

A: ${puzzle.answer}

${result_announce.remark} (total cost: ⚡${cost})`,
          },
          privateKey,
        }),
      );
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
