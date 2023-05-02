import { Kind, parseReferences, Relay, Sub } from "npm:nostr-tools";
import { createEvent, createReplyEvent, publishEvent } from "./event.ts";
import { ensurePublicKey, PrivateKey, PublicKey } from "./keys.ts";
import { now } from "./utils.ts";

export function subscribeChatInvite(opts: {
  relay: Relay;
  privateKey: PrivateKey;
}): Sub {
  const { relay, privateKey } = opts;
  const publicKey = ensurePublicKey(privateKey);

  const sub = relay.sub([
    {
      kinds: [Kind.Text],
      authors: [
        // Only subscribe to events from Chiezo for now.
        // TODO: Subscribe to all authorized users with NIP-05.
        "c04330adadd9508c1ad1c6ede0aed5d922a3657021937e2055a80c1b2865ccf7",
      ],
      "#p": [publicKey],
      since: now(),
    },
  ]);
  console.log(`subscribed to ${relay.url} for chat invitations`);

  // Reply to the invitation, join the chat, and subscribe to the chat
  sub.on("event", (event) => {
    console.log(`recieved a mention from ${relay.url}:`, event);

    const eventRef = parseReferences(event).find((ref) => ref.event);
    if (!eventRef) return;
    const eventPointer = eventRef.event!;

    // Reply to the invitation
    publishEvent(
      relay,
      createReplyEvent(privateKey, event, relay, {
        content: "I'm joining!",
      }),
    );

    // Join the chat
    publishEvent(
      relay,
      createEvent(privateKey, {
        kind: Kind.ChannelMessage,
        tags: [["e", eventPointer.id, relay.url, "root"]],
        content: "Hello, thank you for the invitation!",
      }),
    );

    subscribeChat(relay, eventPointer.id);
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

  const events = await relay.list([
    {
      kinds: [Kind.ChannelMessage],
      authors: [publicKey],
      until: now(),
      limit: 1000,
    },
  ]);

  const chats = new Set<string>();

  events.forEach((event) => {
    const chatRef = event.tags.find((tag) =>
      tag[0] === "e" && tag[3] === "root"
    );
    if (!chatRef) {
      console.warn("chat message without a chat reference", event);
      return null;
    }
    chats.add(chatRef[1]);
  });

  chats.forEach((chat) => subscribeChat(relay, chat));
}
