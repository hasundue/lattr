import { Event, Kind, Relay } from "npm:nostr-tools";
import { ensurePublicKey, PrivateKey } from "./keys.ts";
import {
  applyModeration,
  createPuzzle,
  createPuzzleIntro,
  Puzzle,
  replyToQuestion,
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

  subscribePuzzleThread({ puzzle, event, relay: relays[0], private_key });
}

export async function subscribePuzzleThread(args: {
  puzzle: Puzzle;
  event: Event;
  relay: Relay;
  private_key: PrivateKey;
}) {
  const { puzzle, event, relay, private_key } = args;
  const public_key = ensurePublicKey(private_key);

  const sub = relay.sub([
    {
      kinds: [Kind.Text],
      "#e": [event.id],
      "#p": [public_key],
      since: now(),
    },
  ]);
  console.log(`Subscribed replies to a puzzle thread ${event.id}`);

  const stream = new ReadableStream<Event>({
    start(controller) {
      sub.on("event", (event) => {
        controller.enqueue(event);
      });
    },
  });

  for await (const event_reply of stream) {
    // Check if we are handling a targeted event
    if (
      !event_reply.tags.find((it) =>
        it[0] === "e" && it[1] === event.id && it[3] === "root"
      )
    ) {
      // If not, just ignore the event
      console.warn(
        "A puzzle event is reffered as a non-root event:",
        event_reply,
      );
      continue;
    }

    // Check if the message is harmful
    const result_moderation = await applyModeration(
      event_reply.content,
    );
    if (!result_moderation.approved) {
      // If so, just ignore the event (TODO: Reply and report the user)
      console.warn("Message has been flagged as harmful:", event_reply.content);
      continue;
    }

    // Check if the message is a valid question
    const result_validation = await validateQuestion(
      puzzle,
      result_moderation.message,
    );
    if (!result_validation.valid) {
      // If not, reply with a validation message
      publishEvent(
        relay,
        createReplyEvent(private_key, event, relay, {
          content: result_validation.reply,
        }),
      );
      continue;
    }

    // Create a reply to the question
    const result_reply = await replyToQuestion(
      puzzle,
      result_validation.question,
    );
    if (!result_reply.solved) {
      // If the puzzle is not solved, just reply and continue;
      publishEvent(
        relay,
        createReplyEvent(private_key, event, relay, {
          content: result_reply.reply,
        }),
      );
    }
  }
}
