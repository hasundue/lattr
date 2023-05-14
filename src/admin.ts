import { Kind, Relay } from "npm:nostr-tools";
import { ensurePublicKey, PrivateKey, PublicKey } from "./keys.ts";
import { handlePuzzle } from "./puzzle.ts";
import { now } from "./utils.ts";

export function subscribeAdmin(opts: {
  admin: PublicKey;
  relay_read: Relay;
  relay_recommend: Relay;
  relays_write: Relay[];
  privateKey: PrivateKey;
}) {
  const { admin, relay_read, relay_recommend, relays_write, privateKey } = opts;
  const publicKey = ensurePublicKey(privateKey);

  const sub = relay_read.sub([
    {
      kinds: [Kind.Text],
      authors: [admin],
      "#p": [publicKey],
      since: now(),
    },
  ]);
  console.log(`Subscribed to ${relay_read.url} for admin messages`);

  // Reply to admin messages
  sub.on("event", async (event) => {
    console.log(`recieved an admin message from ${relay_read.url}:`, event);

    if (
      event.tags.find((tag) => tag[0] === "e") &&
      event.tags.find((tag) => tag[0] === "p" && tag[1] !== publicKey)
    ) {
      console.log("This seems to be a participant in a puzzle thread");
      return;
    }

    if (new RegExp("next puzzle", "i").test(event.content)) {
      await handlePuzzle({
        relays_write,
        relay_recommend,
        relay_read,
        privateKey,
      });
    }
  });

  return sub;
}
