import { signal } from "https://deno.land/std@0.185.0/signal/mod.ts";
import { Kind, nip19, relayInit } from "npm:nostr-tools";
import {
  closeUnsolvedPuzzles,
  createEvent,
  ensurePrivateKey,
  PublicKey,
  publishEvent,
  subscribeAdmin,
  // subscribeChatInvite,
  // resumeChats,
} from "./src/nostr.ts";

// We send all events to all relays, but we only subscribe to the first one.
const RELAYS = [
  "nos.lol",
] as const;

const relays = RELAYS.map((name) => relayInit(`wss://${name}`));
const relay_main = relays[0];

const privateKey = ensurePrivateKey();

const public_key_owner = // Chiezo
  "c04330adadd9508c1ad1c6ede0aed5d922a3657021937e2055a80c1b2865ccf7" as PublicKey;

const nprofile_owner = nip19.nprofileEncode({
  pubkey: public_key_owner,
  relays: relays.map((relay) => relay.url),
});

const PROFILE = {
  name: "Lattr",
  about:
    `An AI-powered cat who creates lateral thinking puzzles and wants to play them with you. Still in training with my owner ${nprofile_owner}.`,
  picture: "https://chiezo.dev/images/lattr.jpg",
  nip05: "lattr@chiezo.dev",
  lud16: "patchedisrael58@walletofsatoshi.com",
} as const;

// Connect to all relays
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

  // Publish the profile
  publishEvent(
    relay,
    createEvent(privateKey, {
      kind: Kind.Metadata,
      content: JSON.stringify(PROFILE),
    }),
  );

  // Publish the contact list (NIP-02)
  publishEvent(
    relay,
    createEvent(privateKey, {
      kind: Kind.Contacts,
      tags: [
        ["p", public_key_owner, relay_main.url, "chiezo"],
      ],
      content: "",
    }),
  );

  // Publish a relay list (NIP-65)
  publishEvent(
    relay,
    createEvent(privateKey, {
      kind: Kind.RelayList,
      tags: [
        ["r", relay_main.url, "read", "write"],
      ],
      content: "",
    }),
  );
}

// Publish closing announcements for all terminated and unsolved puzzles
closeUnsolvedPuzzles({ relay: relay_main, privateKey });

// resumeChats({
//   relay: relays[0],
//   publicKey: public_key,
// });

// subscribeChatInvite({
//   relay: relays[0],
//   privateKey,
// });

subscribeAdmin({
  admin: public_key_owner,
  relays,
  privateKey: privateKey,
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
