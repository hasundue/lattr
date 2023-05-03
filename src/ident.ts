import { Event, Kind, Relay } from "npm:nostr-tools";
import { PublicKey } from "./keys.ts";

export async function userIsVerified(args: {
  pubkey: PublicKey;
  relay: Relay;
}): Promise<boolean> {
  const { pubkey, relay } = args;

  console.log(`Looking for a verified profile of ${pubkey} on ${relay.url}...`);

  const sub = relay.sub([
    {
      kinds: [Kind.Metadata],
      authors: [pubkey],
    },
  ]);

  const stream = new ReadableStream<Event>({
    start(controller) {
      sub.on("event", (event) => {
        controller.enqueue(event);
      });
      sub.on("eose", () => {
        controller.close();
      });
    },
  });

  for await (const event of stream) {
    if (await eventIsVerified({ event, relay })) {
      sub.unsub();
      return true;
    }
  }

  console.log(`No verified profile found for ${pubkey} on ${relay.url}.`);
  return false;
}

export async function eventIsVerified(args: {
  event: Event;
  relay: Relay;
}): Promise<boolean> {
  const { event, relay } = args;
  const pubkey = event.pubkey;

  const nip05 = JSON.parse(event.content).nip05 as string | undefined;

  if (!nip05) return false;

  console.log(`Found a nip-05 address for ${pubkey} on ${relay.url}:`, nip05);

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

  console.log(`Verified profile found for ${pubkey} on ${relay.url}:`, nip05);
  return true;
}
