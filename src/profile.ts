import {
  getEventHash,
  Kind,
  signEvent,
  SimplePool,
} from "https://esm.sh/nostr-tools@1.10.1";
import { ensurePublicKey, PrivateKey } from "./keys.ts";

export function update(opts: {
  privateKey: PrivateKey;
  pool: SimplePool;
  relays: string[];
  profile: Record<string, unknown>;
}) {
  const publicKey = ensurePublicKey(opts.privateKey);

  const eventInit = {
    kind: Kind.Metadata,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(opts.profile),
    pubkey: publicKey,
  };

  const event = {
    ...eventInit,
    id: getEventHash(eventInit),
    sig: signEvent(eventInit, opts.privateKey),
  };

  const pub = opts.pool.publish(opts.relays, event);
  console.log("published a profile update", event);

  pub.on("ok", () => {
    console.log(`profile update has been accepted`);
    return;
  });

  pub.on("failed", (reason: string) => {
    console.error(`failed to update the profile: ${reason}`);
    return;
  });
}
