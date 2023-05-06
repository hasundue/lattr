import { Kind, Relay } from "npm:nostr-tools";
import { PrivateKey } from "./keys.ts";
import { createEvent } from "./event.ts";

export type ProfileInit = {
  name: string;
  about: string;
  picture: string;
  nip05: string;
  lud16: string;
};

export function publishProfile(opts: {
  profile: ProfileInit;
  relays: Relay[];
  privateKey: PrivateKey;
}) {
  const { relays, profile, privateKey } = opts;

  const event = createEvent(privateKey, {
    kind: Kind.Metadata,
    content: JSON.stringify(profile),
  });

  for (const relay of relays) {
    const pub = relay.publish(event);
    console.log(`published a profile update to ${relay.url}:`, event);

    pub.on("ok", () => {
      console.log(`${relay.url} accepted the profile update`);
    });

    pub.on("failed", (reason: string) => {
      console.error(
        `failed to publish a profile update to ${relay.url}: ${reason}`,
      );
    });
  }
}
