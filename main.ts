import { signal } from "signal";
import { Kind, nip19 } from "nostr-tools";
import {
  closeUnsolvedPuzzles,
  createEvent,
  ensurePrivateKey,
  ensurePublicKey,
  handleAdminMessages,
  PublicKey,
  RelayPool,
  // subscribeChatInvite,
  // resumeChats,
} from "./src/nostr.ts";

const privateKey = ensurePrivateKey();
const npub = nip19.npubEncode(ensurePublicKey(privateKey));

const relay_recommend = "wss://nos_lol";

const publicKey_owner = // Chiezo
  "c04330adadd9508c1ad1c6ede0aed5d922a3657021937e2055a80c1b2865ccf7" as PublicKey;

const nprofile_owner = nip19.nprofileEncode({
  pubkey: publicKey_owner,
  relays: [relay_recommend],
});

const PROFILE = {
  name: "Lattr",
  about:
    `An AI-powered cat who creates lateral thinking puzzles and wants to play them with you. Still in training with my owner nostr:${nprofile_owner}.`,
  picture: "https://chiezo.dev/images/lattr.jpg",
  nip05: "lattr@chiezo.dev",
  lud16: "patchedisrael58@walletofsatoshi.com",
} as const;

const relayPool = new RelayPool([
  {
    url: "wss://nostr.wine",
    read: true,
    write: true,
  },
  {
    url: `wss://filter.nostr.wine/${npub}?broadcast=true`,
    read: true,
    write: true,
  },
]);

await relayPool.connect();

// Publish the profile (metadata)
console.log("Publishing profile...");
await relayPool.publish(
  createEvent(privateKey, {
    kind: Kind.Metadata,
    content: JSON.stringify(PROFILE),
  }),
);

// Publish the contact list (NIP-02)
console.log("Publishing contact list...");
await relayPool.publish(
  createEvent(privateKey, {
    kind: Kind.Contacts,
    tags: [
      ["p", publicKey_owner, relay_recommend, "chiezo"],
    ],
    content: "",
  }),
);

// Publish a relay list (NIP-65)
console.log("Publishing relay list...");
await relayPool.publish(
  createEvent(privateKey, {
    kind: Kind.RelayList,
    tags: [
      ["r", "wss://nos.lol", "read", "write"],
      ["r", "wss://nostr.wine", "read", "write"],
    ],
    content: "",
  }),
);

// Publish closing announcements for all terminated and unsolved puzzles
closeUnsolvedPuzzles({ relayPool, relay_recommend, privateKey });

// resumeChats({
//   relay: relays[0],
//   publicKey: public_key,
// });

// subscribeChatInvite({
//   relay: relays[0],
//   privateKey,
// });

handleAdminMessages({
  admin: publicKey_owner,
  relayPool,
  relay_recommend,
  privateKey,
});

const signals = signal("SIGINT");

for await (const _ of signals) {
  console.log("recieved SIGINT, shutting down...");
  signals.dispose();
  relayPool.close();
  Deno.exit(0);
}
