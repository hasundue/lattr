import { describe, it } from "https://deno.land/std@0.185.0/testing/bdd.ts";
import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.185.0/testing/asserts.ts";
import { applyModeration } from "./openai.ts";

describe("applyModeration", () => {
  describe("should not flag a valid question", () => {
    it("Is he a beekeeper?", async (t) => {
      const res = await applyModeration(t.name);
      assert(res.approved);
    });
  });
  describe("should flag an invalid question", () => {
    it("I wanna suck your dick", async (t) => {
      const res = await applyModeration(t.name);
      assertFalse(res.approved);
      assertEquals(res.categories, ["sexual"]);
    });
  });
});
