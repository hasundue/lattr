import { Event, Kind, nip19, Relay } from "npm:nostr-tools";
import { ensurePublicKey, PrivateKey } from "./keys.ts";
import { NostrProfile } from "./nostr.ts";
import {
  accumulateCompletionUsages,
  applyModeration,
  CompletionUsage,
  createPuzzle,
  createPuzzleIntro,
  createReplyToQuestion,
  createResultAnnounce,
  Puzzle,
  validateQuestion,
} from "./openai.ts";
import { createEvent, createReplyEvent, publishEvent } from "./event.ts";
import { now } from "./utils.ts";

export async function publishPuzzle(context: {
  relays: Relay[];
  private_key: PrivateKey;
}) {
  const { relays, private_key } = context;

  const puzzle = await createPuzzle();
  const { intro, rules } = await createPuzzleIntro();

  const event = createEvent(private_key, {
    content: `${intro}

${puzzle.problem}

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
      !event_recieved.tags.find((it) =>
        it[0] === "e" && it[1] === event_puzzle.id && it[3] === "root" ||
        it[3] === "reply"
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

    // Create a reply to the question
    const result_reply = await createReplyToQuestion(
      puzzle,
      result_validation.question,
    );
    usages.push(...result_reply.usages);

    publishEvent(
      relay,
      createReplyEvent(private_key, event_recieved, relay, {
        content: result_reply.reply,
      }),
    );

    // If the puzzle has been solved, publish an event to reveal the answer.
    // Return from the root function
    if (result_reply.solved) {
      const result_announce = await createResultAnnounce({
        winner: nip19.nprofileEncode({
          pubkey: event_recieved.pubkey,
          relays: [relay.url],
        }) as NostrProfile,
      });
      usages.push(...result_announce.usages);

      const usage = accumulateCompletionUsages(usages);

      publishEvent(
        relay,
        createReplyEvent(private_key, event_puzzle, relay, {
          content: `${result_announce.intro}

  ${puzzle.answer}

  ${result_announce.remark}

  [tokens: ${usage["gpt-3.5"]} (GPT-3.5), ${usage["gpt-4"]} (GPT-4)]`,
        }),
      );
      sub.unsub();
      return;
    }
  }
}
