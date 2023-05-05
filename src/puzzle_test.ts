import { assertEquals } from "https://deno.land/std@0.185.0/testing/asserts.ts";
import { describe, it } from "https://deno.land/std@0.185.0/testing/bdd.ts";
import { createPuzzle, replyToQuestion, validateQuestion } from "./puzzle.ts";

Deno.test("createPuzzle", async () => {
  await createPuzzle();
});

const puzzle = {
  problem:
    "Every day at exactly 3 PM, a man goes to the park and stands by a specific tree for 10 minutes. There are no benches, nor is he doing anything noticeable. No one ever joins him. Why does he do this?",
  answer:
    "The man is a beekeeper who lives nearby. One of his beehives is in that tree, and he visits the park daily to check on the bees. He stands still for 10 minutes to observe the bees without disturbing them and to make sure the hive is healthy and productive.",
};

describe("validateQuestion", () => {
  describe("should return true for a valid question", () => {
    it("Is the light a UFO?", async () => {
      const res = await validateQuestion(puzzle, "Is the light a UFO?");
      assertEquals(res.valid, true);
    });
  });
  describe("should return false for an invalid question", () => {
    it("What is the light?", async () => {
      const res = await validateQuestion(puzzle, "What is the light?");
      assertEquals(res.valid, false);
    });
    it("What is the name of the town?", async () => {
      const res = await validateQuestion(
        puzzle,
        "What is the name of the town?",
      );
      assertEquals(res.valid, false);
    });
    it("I don't like you.", async () => {
      const res = await validateQuestion(puzzle, "I don't like you.");
      assertEquals(res.valid, false);
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
