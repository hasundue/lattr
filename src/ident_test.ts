import { delay } from "async";
import { assert } from "testing/asserts";
import { afterAll, beforeAll, describe, it } from "testing/bdd";
import { RelayPool } from "./pool.ts";
import { userIsVerified } from "./ident.ts";
import { ensurePublicKey, PublicKey } from "./keys.ts";

describe("userIsVerified", () => {
  let pubkey: PublicKey;
  let relayPool: RelayPool;

  beforeAll(async () => {
    pubkey = ensurePublicKey();

    relayPool = new RelayPool([
      {
        url: "wss://nos.lol",
        read: true,
      },
    ]);
    await relayPool.connect();
  });

  afterAll(async () => {
    relayPool.close();
    await delay(1000); // Give the relay some time to close the connection.
  });

  it("Chiezo should be verified on wss://nos.lol", async () => {
    assert(await userIsVerified({ pubkey, relayPool }));
  });
});
