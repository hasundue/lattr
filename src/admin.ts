import { Kind, Relay } from "npm:nostr-tools";
import { createReplyEvent } from "./event.ts";
import { ensurePublicKey, PrivateKey, PublicKey } from "./keys.ts";
import { now } from "./utils.ts";

export function subscribeAdmin(opts: {
  admin: PublicKey;
  relay: Relay;
  privateKey: PrivateKey;
}) {
  const { admin, relay, privateKey } = opts;
  const publicKey = ensurePublicKey(privateKey);

  const sub = relay.sub([
    {
      kinds: [Kind.Text],
      authors: [admin],
      "#p": [publicKey],
      since: now(),
    },
  ]);
  console.log(`subscribed to ${relay.url} for admin messages`);

  // Reply to admin messages
  sub.on("event", (event) => {
    console.log(`recieved an admin message from ${relay.url}:`, event);

    const reply = createReplyEvent(privateKey, event, relay, {
      kind: Kind.Text,
      content: "I'm listening!",
    });
    const pubs = relay.publish(reply);
    console.log(`published a reply to ${relay.url}:`, reply);

    pubs.on("ok", () => {
      console.log(`${relay.url} has accepted a reply`);
    });

    pubs.on("failed", (reason: string) => {
      console.warn(`failed to publish a reply to ${relay.url}:`, reason);
    });
  });

  return sub;
}
