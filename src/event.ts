import { distinct } from "https://deno.land/std@0.185.0/collections/distinct.ts";
import {
  Event,
  EventTemplate,
  getEventHash,
  getPublicKey,
  Kind,
  Relay,
  signEvent,
  validateEvent,
  verifySignature,
} from "npm:nostr-tools";
import { PrivateKey } from "./keys.ts";
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
    throw new Error("invalid event", { cause: event });
  }
  if (!verifySignature(event)) {
    throw new Error("invalid signature", { cause: event });
  }

  return event;
}

export function createReplyEvent(
  privateKey: PrivateKey,
  event: Event,
  relay: Relay,
  template: EventTemplateInit,
): Event {
  const ps = distinct([
    ...event.tags.filter((tag) => tag[0] === "p"),
    ["p", event.pubkey],
  ]);

  const ref = ["e", event.id, relay.url];
  const root = event.tags.find((tag) => tag[3] === "root");
  const es = root ? [root, [...ref, "reply"]] : [[...ref, "root"]];

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
  const pubs = relay.publish(event);
  console.log(`published an event to ${relay.url}:`, event);

  pubs.on("ok", () => {
    console.log(`${relay.url} has accepted a reply`);
  });

  pubs.on("failed", (reason: string) => {
    console.warn(`failed to publish a reply to ${relay.url}:`, reason);
  });
}
