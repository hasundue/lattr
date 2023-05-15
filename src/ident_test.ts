import { delay } from "https://deno.land/std@0.185.0/async/delay.ts";
import { assert } from "https://deno.land/std@0.185.0/testing/asserts.ts";
import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.185.0/testing/bdd.ts";
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
