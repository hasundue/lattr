import { Relay } from "npm:nostr-tools";
import { PrivateKey } from "./keys.ts";
import { createPuzzle } from "./openai.ts";
import { createEvent } from "./event.ts";

export async function publishPuzzle(opts: {
  relays: Relay[];
  private_key: PrivateKey;
}) {
  const puzzle = await createPuzzle();

  const event = createEvent(opts.private_key, {});
}
