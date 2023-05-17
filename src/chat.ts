import { Kind, parseReferences } from "nostr-tools";
import { RelayUrl } from "./nostr.ts";
import { RelayPool } from "./pool.ts";
import { createEvent, createReplyEvent } from "./event.ts";
import { userIsVerified } from "./ident.ts";
import { ensurePublicKey, PrivateKey, PublicKey } from "./keys.ts";
import { now } from "./utils.ts";

export async function handleChatInvite(opts: {
  relayPool: RelayPool;
  relay_recommend: RelayUrl;
  privateKey: PrivateKey;
}) {
  const { relayPool, relay_recommend, privateKey } = opts;
  const pubkey = ensurePublicKey(privateKey);

  // A set of unique chat ids we're already in
  const chats = new Set<string>();

  const sub = relayPool.subscribe({
    kinds: [Kind.Text],
    "#p": [pubkey],
    since: now(),
  });

  // Reply to the invitation, join the chat, and subscribe to the chat
  for await (const event of sub.stream) {
    const eventRef = parseReferences(event).find((ref) => ref.event);
    if (!eventRef) continue;
    const chat = eventRef.event!.id;

    // Decline if the author is not verified with NIP-05
    const verified = await userIsVerified({
      pubkey: event.pubkey as PublicKey,
      relayPool,
    });
    if (!verified) {
      relayPool.publish(
        createReplyEvent({
          event_target: event,
          template: {
            content: "I could not find a NIP-05 verified profile for you. " +
              "I'm afraid that I can only join chats with verified users.",
          },
          relay_recommend,
          privateKey,
        }),
      );
      continue;
    }

    // Decline the invitation if we're already in the chat
    if (chats.has(chat)) {
      relayPool.publish(
        createReplyEvent({
          event_target: event,
          template: {
            content: "I'm already in!",
          },
          relay_recommend,
          privateKey,
        }),
      );
      continue;
    }

    // Add the chat to the list of chats we're in
    chats.add(chat);

    // Reply to the invitation
    relayPool.publish(
      createReplyEvent({
        event_target: event,
        template: {
          content: "I'm joining!",
        },
        relay_recommend,
        privateKey,
      }),
    );

    // Join the chat
    relayPool.publish(
      createEvent(privateKey, {
        kind: Kind.ChannelMessage,
        tags: [["e", chat, relay_recommend, "root"]],
        content: "Hello, thank you for the invitation!",
      }),
    );

    handleChat({ relayPool, chat });
  }

  return sub;
}

/**
 * The event id of the chat creation
 *
 * @param {Relay} args.relay - the relay to publish the event to
 * @param {string} args.chat - the event id of the chat creation
 */
export async function handleChat(args: {
  relayPool: RelayPool;
  chat: string;
}) {
  const { relayPool, chat } = args;

  const sub = relayPool.subscribe({
    kinds: [Kind.ChannelMessage],
    "#e": [chat],
    since: now(),
  });
  console.log("subscribed to a chat:", chat);

  for await (const event of sub.stream) {
    console.log("chat message:", event.content);
  }
}

export async function resumeChats(opts: {
  relayPool: RelayPool;
  publicKey: PublicKey;
}) {
  console.log("reconnecting to previous chats...");

  const { relayPool, publicKey } = opts;
  const chats = new Set<string>();

  const sub = relayPool.subscribe({
    kinds: [Kind.ChannelMessage],
    authors: [publicKey],
    until: now(),
  });

  for await (const event of sub.stream) {
    const chatRef = event.tags.find((tag) =>
      tag[0] === "e" && tag[3] === "root"
    );
    if (!chatRef) {
      console.warn("Chat message does not an event reference.");
      return;
    }
    const chat = chatRef[1];
    if (chats.has(chat)) {
      return;
    }
    chats.add(chat);
    handleChat({ relayPool, chat });
  }
}
