import {
  Event,
  EventTemplate,
  getEventHash,
  getPublicKey,
  signEvent,
  validateEvent,
  verifySignature,
} from "nostr-tools";
import { PrivateKey } from "./keys.ts";

export const now = () => Math.floor(Date.now() / 1000);

export function createEvent(
  template: EventTemplate,
  privateKey: PrivateKey,
): Event {
  const init = { ...template, pubkey: getPublicKey(privateKey) };

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
