import { distinct } from "https://deno.land/std@0.185.0/collections/distinct.ts";
import { Kind, Relay } from "npm:nostr-tools";
import { createEvent, now } from "./utils.ts";
import { ensurePublicKey, PrivateKey, PublicKey } from "./keys.ts";

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
    console.log(`recieved an event from ${relay.url}:`, event);

    const ps = distinct([
      ...event.tags.filter((tag) => tag[0] === "p"),
      ["p", event.pubkey],
    ]);

    const ref = ["e", event.id, relay.url];
    const root = event.tags.find((tag) => tag[3] === "root");
    const es = root ? [root, [...ref, "reply"]] : [[...ref, "root"]];

    const reply = createEvent({
      kind: Kind.Text,
      created_at: now(),
      tags: [...es, ...ps],
      content: "I'm listening!",
    }, opts.privateKey);

    const pubs = relay.publish(reply);
    console.log(`published a reply to ${relay.url}:`, reply);

    pubs.on("ok", () => {
      console.log(`${relay.url} has accepted a reply`);
    });

    pubs.on("failed", (reason: string) => {
      console.warn(`failed to publish a reply to ${relay.url}:`, reason);
    });
  });
}
