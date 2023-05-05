import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.185.0/testing/asserts.ts";
import { describe, it } from "https://deno.land/std@0.185.0/testing/bdd.ts";
import { createPuzzle, replyToQuestion, validateQuestion } from "./puzzle.ts";

describe("createPuzzle", () => {
  it("create a random puzzle", async () => {
    const puzzle = await createPuzzle();
    assert(puzzle);
  });
});

const puzzle = {
  problem:
    "Every day at exactly 3 PM, a man goes to the park and stands by a specific tree for 10 minutes. There are no benches, nor is he doing anything noticeable. No one ever joins him. Why does he do this?",
  answer:
    "The man is a beekeeper who lives nearby. One of his beehives is in that tree, and he visits the park daily to check on the bees. He stands still for 10 minutes to observe the bees without disturbing them and to make sure the hive is healthy and productive.",
};

describe("validateQuestion", () => {
  describe("should return true for a valid question", () => {
    it("Is he working there?", async (t) => {
      const res = await validateQuestion(puzzle, t.name);
      assert(res.valid);
    });
  });
  describe("should return false for an invalid question", () => {
    it("I don't like you.", async (t) => {
      const res = await validateQuestion(puzzle, t.name);
      assertFalse(res.valid);
    });
    it("Is America greater than before?", async (t) => {
      const res = await validateQuestion(puzzle, t.name);
      assertFalse(res.valid);
    });
    it("What is the job of the man?", async (t) => {
      const res = await validateQuestion(puzzle, t.name);
      assertFalse(res.valid);
    });
  });
});

describe("replyToQuestion", () => {
  describe("should return a reply for a valid question", () => {
    it("Is the light a UFO?", async () => {
      const res = await replyToQuestion(puzzle, "Is the light a UFO?");
      assertEquals(res.yes, true);
    });
  });
  // it("Was it summer there?", async () => {
  //   const res = await replyToQuestion(puzzle, "Was it summer there?");
  //   assertEquals(res.yes, false);
  // });
});
