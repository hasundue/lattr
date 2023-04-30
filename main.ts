import { Nostr } from "./src/nostr.ts";

const nostr = new Nostr();

nostr.updateProfile();

nostr.subscribeAdmins();
