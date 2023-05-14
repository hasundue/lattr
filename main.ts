import { mapValues } from "https://deno.land/std@0.185.0/collections/map_values.ts";
import { signal } from "https://deno.land/std@0.185.0/signal/mod.ts";
import { Kind, nip19, relayInit } from "npm:nostr-tools";
import {
  closeUnsolvedPuzzles,
  createEvent,
  ensurePrivateKey,
  ensurePublicKey,
  PublicKey,
  publishEvent,
  subscribeAdmin,
  // subscribeChatInvite,
  // resumeChats,
} from "./src/nostr.ts";

const privateKey = ensurePrivateKey();
const npub = nip19.npubEncode(ensurePublicKey(privateKey));

const relays = mapValues({
  nos_lol: "wss://nos.lol",
  wine: "wss://nostr.wine",
  wine_filter: `wss://filter.nostr.wine/${npub}?broadcast=true`,
}, relayInit);

const relay_read = relays.wine_filter;
const relay_recommend = relays.nos_lol;
const relays_write = [relays.wine, relays.wine_filter];

const public_key_owner = // Chiezo
  "c04330adadd9508c1ad1c6ede0aed5d922a3657021937e2055a80c1b2865ccf7" as PublicKey;

const nprofile_owner = nip19.nprofileEncode({
  pubkey: public_key_owner,
  relays: [
    relays.wine.url,
    relays.nos_lol.url,
  ],
});

const PROFILE = {
  name: "Lattr",
  about:
    `An AI-powered cat who creates lateral thinking puzzles and wants to play them with you. Still in training with my owner nostr:${nprofile_owner}.`,
  picture: "https://chiezo.dev/images/lattr.jpg",
  nip05: "lattr@chiezo.dev",
  lud16: "patchedisrael58@walletofsatoshi.com",
} as const;

// Connect to all relays
for (const name in relays) {
  const relay = relays[name];

  relay.on("connect", () => {
    console.log(`Connected to ${relay.url}`);
  });

  relay.on("disconnect", () => {
    console.log(`Disconnected from ${relay.url}`);
  });

  relay.on("error", () => {
    console.log(`Failed to connect to ${relay.url}`);
  });

  await relay.connect();
}

// Publish the profile (metadata)
console.log("Publishing profile...");
publishEvent(
  relays_write,
  createEvent(privateKey, {
    kind: Kind.Metadata,
    content: JSON.stringify(PROFILE),
  }),
);

// Publish the contact list (NIP-02)
console.log("Publishing contact list...");
publishEvent(
  relays_write,
  createEvent(privateKey, {
    kind: Kind.Contacts,
    tags: [
      ["p", public_key_owner, relay_recommend.url, "chiezo"],
    ],
    content: "",
  }),
);

// Publish a relay list (NIP-65)
console.log("Publishing relay list...");
publishEvent(
  relays_write,
  createEvent(privateKey, {
    kind: Kind.RelayList,
    tags: [
      ["r", relays.wine.url, "read", "write"],
      ["r", relays.nos_lol.url, "read", "write"],
    ],
    content: "",
  }),
);

// Publish closing announcements for all terminated and unsolved puzzles
closeUnsolvedPuzzles({ relay_read, relay_recommend, relays_write, privateKey });

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
  relays_write,
  relay_read,
  relay_recommend,
  privateKey: privateKey,
});

const signals = signal("SIGINT");

for await (const _ of signals) {
  console.log("recieved SIGINT, shutting down...");
  Object.values(relays).forEach(
    (relay) => relay.close(),
  );
  signals.dispose();
  Deno.exit(0);
}
