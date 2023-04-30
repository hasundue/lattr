import { SimplePool } from "nostr-tools";
import { ensurePrivateKey } from "./keys.ts";
import * as admin from "./admin.ts";
import * as profile from "./profile.ts";

const ADMINS = [
  "c04330adadd9508c1ad1c6ede0aed5d922a3657021937e2055a80c1b2865ccf7", // Chiezo
];

const RELAYS = [
  "wss://nos.lol",
];

const PROFILE = {
  name: "Lattr",
  about: `
A game master of lateral thinking puzzles (WIP)
dev: nostr:nprofile${ADMINS[0]}
source: https://github.com/hasundue/lattr`,
  nip05: "lattr@chiezo.dev",
} as const;

export class Nostr {
  private privateKey = ensurePrivateKey();
  private relayPool = new SimplePool();

  public updateProfile() {
    return profile.update({
      privateKey: this.privateKey,
      pool: this.relayPool,
      relays: RELAYS,
      profile: PROFILE,
    });
  }

  public subscribeAdmins() {
    return admin.subscribe({
      privateKey: this.privateKey,
      pool: this.relayPool,
      relays: RELAYS,
      admins: ADMINS,
    });
  }
}
