import { distinct } from "https://deno.land/std@0.185.0/collections/distinct.ts";
import {
  Event,
  EventTemplate,
  getEventHash,
  getPublicKey,
  Kind,
  nip10,
  Relay,
  signEvent,
  validateEvent,
  verifySignature,
} from "npm:nostr-tools";
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

  return event;
}

/**
 * Create a reply event.
 *
 * @param args.event - The event that we're replying to.
 * @param args.relay - The relay that we're publishing to.
 * @param args.template - The template for the event that we're publishing.
 * @param args.privateKey - The private key to sign the event with.
 * @returns The event that we're publishing.
 */
export function createReplyEvent(args: {
  event: Event,
  relay: Relay,
  template: EventTemplateInit,
  privateKey: PrivateKey,
}): Event {
  const { event, relay, template, privateKey } = args;
  const publicKey = ensurePublicKey(privateKey);

  // Create "p" tags
  const ps = distinct([
    // All the "p" tags with the event that we're replying to, except mine
    ...event.tags.filter((tag) => tag[0] === "p" && tag[1] !== publicKey),
    // The event that we're replying to
    ["p", event.pubkey],
  ]);

  const tags = nip10.parse(event);

  // The marker for the event we're publishing
  const marker = !tags.root && !tags.reply ? "root" : "reply";

  // The event we're publishing
  const ref = ["e", event.id, relay.url, marker];

  // The root event, if any
  const root = tags.root
    ? event.tags.find((tag) => tag[1] === tags.root?.id)
    : undefined;

  // Create "e" tags
  const es = root ? [root, ref] : [ref];

  return createEvent(privateKey, {
    kind: template.kind,
    tags: [...es, ...ps, ...(template.tags ?? [])],
    created_at: template.created_at,
    content: template.content,
  });
}

/**
 * Publish a reply to an event and listen for the result.
 */
export function publishEvent(
  relay: Relay,
  event: Event,
): void {
  const pub = relay.publish(event);
  console.log(`Published an event to ${relay.url}:`, event);

  pub.on("ok", () => {
    console.log(`${relay.url} has accepted the event.`);
  });

  pub.on("failed", (reason: string) => {
    console.warn(`Failed to publish a reply to ${relay.url}:`, reason);
  });
}
