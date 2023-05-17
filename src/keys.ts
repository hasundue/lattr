import "dotenv";
import { generatePrivateKey, getPublicKey } from "nostr-tools";
import { Brand } from "./utils.ts";

export type PrivateKey = Brand<string, "PrivateKey">;
export type PublicKey = Brand<string, "PublicKey">;

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
