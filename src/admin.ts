import { Kind, Relay } from "npm:nostr-tools";
import { ensurePublicKey, PrivateKey, PublicKey } from "./keys.ts";
import { publishPuzzle } from "./puzzle.ts";
import { now } from "./utils.ts";

export function subscribeAdmin(opts: {
  admin: PublicKey;
  relays: Relay[];
  private_key: PrivateKey;
}) {
  const { admin, relays, private_key } = opts;
  const relay = relays[0];
  const publicKey = ensurePublicKey(private_key);

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
  sub.on("event", async (event) => {
    console.log(`recieved an admin message from ${relay.url}:`, event);

    if (new RegExp("next puzzle", "i").test(event.content)) {
      await publishPuzzle({ relays, private_key });
    }
  });

  return sub;
}
