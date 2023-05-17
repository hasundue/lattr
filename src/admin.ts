import { Kind } from "nostr-tools";
import { RelayUrl } from "./nostr.ts";
import { RelayPool } from "./pool.ts";
import { ensurePublicKey, PrivateKey, PublicKey } from "./keys.ts";
import { handlePuzzle } from "./puzzle.ts";

export async function handleAdminMessages(opts: {
  admin: PublicKey;
  relayPool: RelayPool;
  relay_recommend: RelayUrl;
  privateKey: PrivateKey;
}) {
  const { admin, relayPool, relay_recommend, privateKey } = opts;
  const publicKey = ensurePublicKey(privateKey);

  const sub = relayPool.subscribe({
    kinds: [Kind.Text],
    authors: [admin],
    "#p": [publicKey],
  });

  console.log("Subscribed to admin messages.");

  for await (const event of sub.stream) {
    if (
      event.tags.find((tag) => tag[0] === "e") &&
      event.tags.find((tag) => tag[0] === "p" && tag[1] !== publicKey)
    ) {
      console.log("This seems to be a participant in a puzzle thread");
      continue;
    }

    if (new RegExp("next puzzle", "i").test(event.content)) {
      console.log("Recieved a request for a new puzzle:", event);
      handlePuzzle({
        relayPool,
        relay_recommend,
        privateKey,
      });
    }
  }
}
