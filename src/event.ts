import { distinct } from "https://deno.land/std@0.185.0/collections/distinct.ts";
import {
  Event,
  EventTemplate,
  getEventHash,
  getPublicKey,
  Kind,
  nip10,
  signEvent,
  validateEvent,
  verifySignature,
} from "npm:nostr-tools";
import { RelayUrl } from "./nostr.ts";
import { ensurePublicKey, PrivateKey } from "./keys.ts";
import { Expand, now } from "./utils.ts";

export type EventTemplateInit = Expand<
  & Partial<Omit<EventTemplate, "content">>
  & Pick<EventTemplate, "content">
>;

export function createEvent(
  privateKey: PrivateKey,
  template: EventTemplateInit,
): Event {
  const init = {
    kind: template.kind ?? Kind.Text,
    tags: template.tags ?? [],
    created_at: template.created_at ?? now(),
    content: template.content ?? "",
    pubkey: getPublicKey(privateKey),
  };

  const event = {
    ...init,
    id: getEventHash(init),
    sig: signEvent(init, privateKey),
  };

  if (!validateEvent(event)) {
    throw new Error("Invalid event", { cause: template });
  }
  if (!verifySignature(event)) {
    throw new Error("Invalid signature", { cause: template });
  }

  console.log("Created an event", event);
  return event;
}

/**
 * Create a reply event.
 *
 * @param args.event_target - The event that we're replying to.
 * @param args.relay_recommend - The relay that we're recommending.
 * @param args.template - The template for the event that we're publishing.
 * @param args.privateKey - The private key to sign the event with.
 * @returns The event that we're publishing.
 */
export function createReplyEvent(args: {
  event_target: Event;
  template: EventTemplateInit;
  relay_recommend: RelayUrl;
  privateKey: PrivateKey;
}): Event {
  const { event_target, relay_recommend, template, privateKey } = args;
  const publicKey = ensurePublicKey(privateKey);

  // Create "p" tags
  const ps = distinct([
    // All the "p" tags with the event that we're replying to, except mine
    ...event_target.tags.filter((tag) =>
      tag[0] === "p" && tag[1] !== publicKey
    ),
    // The event that we're replying to
    ["p", event_target.pubkey],
  ]);

  const tags = nip10.parse(event_target);

  // A marker for the event we're publishing
  const marker = (tags.root || tags.reply) ? "reply" : "root";

  // A tag for the event we're publishing
  const tag_reply = ["e", event_target.id, relay_recommend, marker];

  // A tag for the root event
  const tag_root = tags.root
    ? [
      "e",
      tags.root.id,
      tags.root.relays?.length ? tags.root.relays[0] : "",
      "root",
    ]
    : undefined;

  // Create "e" tags
  const es = tag_root ? [tag_root, tag_reply] : [tag_reply];

  return createEvent(privateKey, {
    kind: template.kind,
    tags: [...es, ...ps, ...(template.tags ?? [])],
    created_at: template.created_at,
    content: template.content,
  });
}
