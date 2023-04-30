import { distinct } from "https://deno.land/std@0.185.0/collections/distinct.ts";
import { Kind, SimplePool } from "https://esm.sh/nostr-tools@1.10.1";
import { createEvent, now } from "./utils.ts";
import { ensurePublicKey, PrivateKey } from "./keys.ts";

export function subscribe(opts: {
  privateKey: PrivateKey;
  pool: SimplePool;
  relays: string[];
  admins: string[];
}) {
  const publicKey = ensurePublicKey(opts.privateKey);

  const sub = opts.pool.sub(opts.relays, [
    {
      kinds: [Kind.Text],
      authors: opts.admins,
      "#p": [publicKey],
      since: now(),
    },
  ]);

  // Reply to admin messages
  sub.on("event", (event) => {
    console.log(event);

    const ps = distinct([
      ...event.tags.filter((tag) => tag[0] === "p"),
      ["p", event.pubkey],
    ]);

    const ref = ["e", event.id, opts.relays[0]];
    const root = event.tags.find((tag) => tag[3] === "root");
    const es = root ? [root, [...ref, "reply"]] : [[...ref, "root"]];

    const reply = createEvent({
      kind: Kind.Text,
      created_at: now(),
      tags: [...es, ...ps],
      content: "I'm listening!",
    }, opts.privateKey);

    const pubs = opts.pool.publish(opts.relays, reply);
    console.log("published a reply", reply);

    pubs.on("ok", () => {
      console.log("reply has been accepted");
    });
    pubs.on("failed", (reason: string) => {
      console.warn("failed to publish an event", reason);
    });
  });
}
