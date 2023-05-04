import { assertEquals } from "https://deno.land/std@0.185.0/testing/asserts.ts";
import { describe, it } from "https://deno.land/std@0.185.0/testing/bdd.ts";
import { replyToQuestion, validateQuestion } from "./puzzle.ts";

const puzzle = {
  problem:
    "In a small town, every night, a mysterious light appears in the sky. The people are afraid and intrigued at the same time. The local authorities have been investigating for months, but still, no one can solve the mystery. What could this strange light be, and where does it come from?",
  answer:
    "The light turned out to be the product of a group of alien students conducting a science project on Earth. They've been observing the town's reaction, amazed at the fear and curiosity they have stirred.",
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
