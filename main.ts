import { signal } from "https://deno.land/std@0.185.0/signal/mod.ts";
import { relayInit } from "npm:nostr-tools";
import {
  ensurePrivateKey,
  PublicKey,
  publishProfile,
  subscribeAdmin,
} from "./src/nostr.ts";

const PROFILE = {
  name: "Lattr",
  about: "A game master of lateral thinking puzzles (WIP) " +
    "github.com/hasundue/lattr",
  nip05: "lattr@chiezo.dev",
} as const;

const RELAYS = [
  "nos.lol",
] as const;

const privateKey = ensurePrivateKey();
const relays = RELAYS.map((name) => relayInit(`wss://${name}`));

for (const relay of relays) {
  relay.on("connect", () => {
    console.log(`connected to ${relay.url}`);
  });
  relay.on("disconnect", () => {
    console.log(`disconnected from ${relay.url}`);
  });
  relay.on("error", () => {
    console.log(`failed to connect to ${relay.url}`);
  });
  await relay.connect();
}

publishProfile({
  profile: PROFILE,
  relays,
  privateKey,
});

subscribeAdmin({
  admin:
    "c04330adadd9508c1ad1c6ede0aed5d922a3657021937e2055a80c1b2865ccf7" as PublicKey, // Chiezo
  relay: relays[0],
  privateKey,
});

const signals = signal("SIGINT");

for await (const _ of signals) {
  console.log("recieved SIGINT, shutting down...");
  for (const relay of relays) {
    relay.close();
  }
  signals.dispose();
  Deno.exit(0);
}
