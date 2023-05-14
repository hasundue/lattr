import { Kind, parseReferences, Relay, Sub } from "npm:nostr-tools";
import { createEvent, createReplyEvent, publishEvent } from "./event.ts";
import { userIsVerified } from "./ident.ts";
import { ensurePublicKey, PrivateKey, PublicKey } from "./keys.ts";
import { now } from "./utils.ts";

export function subscribeChatInvite(opts: {
  relay_read: Relay;
  relays_write: Relay[];
  privateKey: PrivateKey;
}): Sub {
  const { relay_read, relays_write, privateKey } = opts;
  const pubkey = ensurePublicKey(privateKey);

  // A set of unique chat ids we're already in
  const chats = new Set<string>();

  const sub = relay_read.sub([
    {
      kinds: [Kind.Text],
      "#p": [pubkey],
      since: now(),
    },
  ]);
  console.log(`subscribed to ${relay_read.url} for chat invitations`);

  // Reply to the invitation, join the chat, and subscribe to the chat
  sub.on("event", async (event) => {
    console.log(`recieved a mention from ${relay_read.url}:`, event);

    const eventRef = parseReferences(event).find((ref) => ref.event);
    if (!eventRef) return;
    const chat = eventRef.event!.id;

    // Decline if the author is not verified with NIP-05
    const verified = await userIsVerified({
      pubkey: event.pubkey as PublicKey,
      relay: relay_read,
    });
    if (!verified) {
      publishEvent(
        relays_write,
        createReplyEvent({
          event_target: event,
          template: {
            content: "I could not find a NIP-05 verified profile for you. " +
              "I'm afraid that I can only join chats with verified users.",
          },
          relay_recommend: relay_read,
          privateKey,
        }),
      );
      return;
    }

    // Decline the invitation if we're already in the chat
    if (chats.has(chat)) {
      publishEvent(
        relays_write,
        createReplyEvent({
          event_target: event,
          template: {
            content: "I'm already in!",
          },
          relay_recommend: relay_read,
          privateKey,
        }),
      );
      return;
    }

    // Add the chat to the list of chats we're in
    chats.add(chat);

    // Reply to the invitation
    publishEvent(
      relays_write,
      createReplyEvent({
        event_target: event,
        template: {
          content: "I'm joining!",
        },
        relay_recommend: relay_read,
        privateKey,
      }),
    );

    // Join the chat
    publishEvent(
      relays_write,
      createEvent(privateKey, {
        kind: Kind.ChannelMessage,
        tags: [["e", chat, relay_read.url, "root"]],
        content: "Hello, thank you for the invitation!",
      }),
    );

    subscribeChat(relay_read, chat);
  });

  return sub;
}

/**
 * The event id of the chat creation
 *
 * @param {Relay} relay - the relay to publish the event to
 * @param {string} chat - the event id of the chat creation
 */
export function subscribeChat(
  relay: Relay,
  chat: string,
): Sub {
  const sub = relay.sub([
    {
      kinds: [Kind.ChannelMessage],
      "#e": [chat],
      since: now(),
    },
  ]);
  console.log("subscribed to a chat:", chat);

  sub.on("event", (event) => {
    console.log(`recieved a chat message from ${relay.url}:`, event);
  });

  return sub;
}

export async function resumeChats(opts: {
  publicKey: PublicKey;
  relay: Relay;
}) {
  console.log("reconnecting to previous chats...");

  const { relay, publicKey } = opts;

  // A readable stream of unique chat ids
  const stream = new ReadableStream<string>({
    start(controller) {
      const chats = new Set<string>();

      const sub = relay.sub([
        {
          kinds: [Kind.ChannelMessage],
          authors: [publicKey],
          until: now(),
        },
      ]);

      sub.on("event", (event) => {
        const chatRef = event.tags.find((tag) =>
          tag[0] === "e" && tag[3] === "root"
        );
        if (!chatRef) {
          console.warn("chat message without a chat reference", event);
          return;
        }
        const chat = chatRef[1];
        if (chats.has(chat)) {
          return;
        }
        chats.add(chat);
        controller.enqueue(chat);
      });
    },
  });

  for await (const chat of stream) {
    subscribeChat(relay, chat);
  }
}
