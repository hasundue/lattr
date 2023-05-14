import { Event, Kind, nip10, nip19, Relay } from "npm:nostr-tools";
import { ensurePublicKey, PrivateKey } from "./keys.ts";
import { createSubReadableStream, NostrProfile } from "./nostr.ts";
import {
  accumulateCompletionUsages,
  AccumulatedCompletionUsage,
  applyModeration,
  Chat,
  CompletionUsage,
  createCloseAnnounce,
  createIntroduction,
  createPuzzle,
  createReplyToQuestion,
  createResultAnnounce,
  Puzzle,
  validateMessage,
} from "./openai.ts";
import { createEvent, createReplyEvent, publishEvent } from "./event.ts";
import { Brand, now } from "./utils.ts";

export async function handlePuzzle(context: {
  relay_read: Relay;
  relays_write: Relay[];
  relay_recommend: Relay;
  privateKey: PrivateKey;
}) {
  const { relay_read, relay_recommend, relays_write, privateKey } = context;
  const usages_puzzle: CompletionUsage[] = [];

  /**
   * Publish a puzzle
   */
  const puzzle = await createPuzzle();
  usages_puzzle.push(...puzzle.usages);

  const intro = await createIntroduction({ puzzle });
  usages_puzzle.push(...intro.usages);

  const event = createEvent(privateKey, {
    content: `${intro.preface}

Q: ${puzzle.problem}

${intro.request}`,
  });

  publishEvent(context.relays_write, event);

  // Subscribe questions to the puzzle thread
  await handleQuestions({
    puzzle,
    event,
    usages_puzzle,
    relays_write,
    relay_read,
    relay_recommend,
    privateKey,
  });
}

/**
/* Subscribe questions to the puzzle thread
/*/
export async function handleQuestions(context: {
  relay_read: Relay;
  relays_write: Relay[];
  relay_recommend: Relay;
  event: Event;
  puzzle: Puzzle;
  usages_puzzle: CompletionUsage[];
  privateKey: PrivateKey;
}) {
  const { puzzle, relays_write, relay_read, relay_recommend, privateKey } =
    context;
  const event_puzzle = context.event;
  const publicKey = ensurePublicKey(privateKey);

  const usages = context.usages_puzzle;
  const chat_history: Chat[] = [];
  const events_sub = [event_puzzle.id];

  const sub = relay_read.sub([]);

  function updateSub(opts?: { newEvent?: string }) {
    if (opts?.newEvent) {
      events_sub.push(opts.newEvent);
    }
    const filter = {
      kinds: [Kind.Text],
      "#e": events_sub,
      "#p": [publicKey],
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

    if (event_recieved.pubkey === publicKey) {
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

    const event_parent = await relay_read.get({ ids: [tag_parent.id] });

    if (!event_parent) {
      console.warn("Parent event not found:", tag_parent);
      continue;
    }

    if (event_parent.pubkey !== publicKey) {
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
        event_target: event_recieved,
        template: { content: result_validation.reply },
        relay_recommend,
        privateKey,
      });
      updateSub({ newEvent: reply.id });
      publishEvent(relays_write, reply);
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
      replyType: result_reply.replyType,
    });
    usages.push(...result_reply.usages);

    const reply = createReplyEvent({
      privateKey,
      event_target: event_recieved,
      relay_recommend,
      template: { content: result_reply.reply },
    });
    updateSub({ newEvent: reply.id });
    publishEvent(relays_write, reply);

    // If the puzzle has been solved, publish the answer and return.
    if (result_reply.solved) {
      // Unsubscribe from the puzzle thread as soon as possible
      // to avoid duplicated announcements
      sub.unsub();

      const result_announce = await createResultAnnounce({
        winner: nip19.nprofileEncode({
          pubkey: event_recieved.pubkey,
          relays: [relay_read.url],
        }) as NostrProfile,
      });
      usages.push(...result_announce.usages);

      const usage = accumulateCompletionUsages(usages);
      console.log(usage);

      const cost = await calculateCost(usage);

      publishEvent(
        relays_write,
        createReplyEvent({
          event_target: event_puzzle,
          relay_recommend,
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

export async function closeUnsolvedPuzzles(context: {
  relay_read: Relay;
  relay_recommend: Relay;
  relays_write: Relay[];
  privateKey: PrivateKey;
}): Promise<void> {
  console.log("Looking for unsolved puzzles...");

  const { relay_read, relay_recommend, relays_write, privateKey } = context;
  const publicKey = ensurePublicKey(privateKey);

  // Retrieve all kinds of our notes since no better way
  const sub = relay_read.sub([{
    kinds: [Kind.Text],
    authors: [publicKey],
    until: now(),
    limit: 1000,
  }]);

  const puzzles_unsolved: Event[] = [];

  // A readable stream of events
  const stream = createSubReadableStream(sub, { realtime: false });

  for await (const event of stream) {
    const tags = nip10.parse(event);

    // Skip if the event is a reply to a participant
    if (tags.root || tags.reply) continue;

    // TODO: Check if the event is a puzzle (we have to do nothing for now)

    // Retrieve all our replies to the puzzle
    const replies = await relay_read.list([{
      authors: [publicKey],
      "#e": [event.id],
    }]);

    // Check if we have already solved the puzzle. Kinda adhoc but should be fine.
    const solved = replies.some((reply) =>
      reply.content.includes("nprofile1") &&
      reply.content.includes("A: ") &&
      reply.content.includes("⚡")
    );

    // Puzzle solved. We should leave it as is...
    if (solved) {
      console.debug("Puzzle already solved:", event.id);
      continue;
    }

    // Our direct reply to the root event should be the close announcement
    const closed = replies.some((reply) => {
      const tags = nip10.parse(reply);
      return tags.root && !tags.reply;
    });

    // Puzzle is already closed
    if (closed) {
      console.debug("Puzzle already closed:", event.id);
      continue;
    }

    console.log("Unsolved puzzle found:", event);
    puzzles_unsolved.push(event);

    console.log(event.tags);

    console.log("Publishing a reply to announce that it is closed..");
    publishEvent(
      relays_write,
      createReplyEvent({
        event_target: event,
        template: { content: await createCloseAnnounce() },
        relay_recommend,
        privateKey,
      }),
    );
  }

  console.log(
    puzzles_unsolved.length > 0
      ? `Published close announcements for ${puzzles_unsolved.length} puzzles.`
      : "No unsolved puzzles found.",
  );
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
