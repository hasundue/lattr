import { Event, Kind } from "npm:nostr-tools";
import { PublicKey } from "./keys.ts";
import { RelayPool } from "./pool.ts";

export async function userIsVerified(args: {
  pubkey: PublicKey;
  relayPool: RelayPool;
}): Promise<boolean> {
  const { pubkey, relayPool } = args;

  console.log(`Looking for a verified profile of ${pubkey}...`);

  const profile = await relayPool.getLatest({
    kinds: [Kind.Metadata],
    authors: [pubkey],
  });

  if (!profile) {
    console.log(`No profile found for ${pubkey}.`);
    return false;
  }

  if (await eventIsVerified(profile)) {
    console.log(`Found a verified profile for ${pubkey}.`);
    return true;
  }

  console.log(`Verified profile not found for ${pubkey}.`);
  return false;
}

export async function eventIsVerified(event: Event): Promise<boolean> {
  const pubkey = event.pubkey;

  const nip05 = JSON.parse(event.content).nip05 as string | undefined;

  if (!nip05) return false;

  console.debug(`Found a nip-05 address for ${pubkey}:`, nip05);

  const [name, domain] = nip05.split("@");

  const res = await fetch(
    `https://${domain}/.well-known/nostr.json?name=${name}`,
  );

  if (!res.ok) {
    console.warn(
      `Failed to fetch .well-known/nostr.json from ${domain}:`,
      `${res.status} ${res.statusText}`,
    );
    return false;
  }

  const json = await res.json();
  const value = json.names?.[name] as string | undefined;

  if (!value) {
    console.warn(
      `No value for ${name} in .well-known/nostr.json from ${domain}`,
    );
    return false;
  }

  if (json.names[name] !== pubkey) {
    console.warn(
      `Value for ${name} in .well-known/nostr.json from ${domain} does not match ${pubkey}`,
    );
    return false;
  }
  return true;
}
