import { signal } from "https://deno.land/std@0.185.0/signal/mod.ts";
import { relayInit } from "npm:nostr-tools";
import {
  ensurePrivateKey,
  ensurePublicKey,
  publishProfile,
  resumeChats,
  subscribeAdmin,
  subscribeChatInvite,
} from "./src/nostr.ts";

const PROFILE = {
  name: "Lattr",
  about: "A game master of lateral thinking puzzles (WIP) " +
    "github.com/hasundue/lattr",
  nip05: "lattr@chiezo.dev",
} as const;

// We send all events to all relays, but we only subscribe to the first one.
const RELAYS = [
  "nos.lol",
] as const;

const privateKey = ensurePrivateKey();
const public_key = ensurePublicKey(privateKey);

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

resumeChats({
  relay: relays[0],
  publicKey: public_key,
});

subscribeChatInvite({
  relay: relays[0],
  privateKey,
});

subscribeAdmin({
  admin: public_key,
  relays,
  private_key: privateKey,
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
