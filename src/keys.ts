import "https://deno.land/std@0.185.0/dotenv/load.ts";
import {
  generatePrivateKey,
  getPublicKey,
} from "https://esm.sh/nostr-tools@1.10.1";

export type PrivateKey = string & { __type: "PrivateKey" };
export type PublicKey = string & { __type: "PublicKey" };

export function ensurePrivateKey(): PrivateKey {
  let privateKey = Deno.env.get("PRIVATE_KEY");

  if (!privateKey) {
    if (Deno.env.get("DENO_DEPLOYMENT_ID")) {
      throw new Error("No private key found in environment");
    }
    privateKey = generatePrivateKey();
    Deno.writeTextFileSync(".env", `PRIVATE_KEY=${privateKey}\n`, {
      append: true,
    });
  }

  return privateKey as PrivateKey;
}

export function ensurePublicKey(privateKey?: PrivateKey): PublicKey {
  return getPublicKey(privateKey ?? ensurePrivateKey()) as PublicKey;
}
