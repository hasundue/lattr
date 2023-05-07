import { describe, it } from "https://deno.land/std@0.185.0/testing/bdd.ts";
import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.185.0/testing/asserts.ts";
import { NostrProfile } from "./nostr.ts";
import {
  ApprovedMessage,
  checkPuzzleSolved,
  createPuzzle,
  createPuzzleIntro,
  createReplyToQuestion,
  createResultAnnounce,
  ReplyToQuestion,
  validateQuestion,
  ValidQuestion,
} from "./openai.ts";

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

describe("createPuzzleIntroduction", () => {
  it("create a random introduction of a puzzle", async () => {
    const res = await createPuzzleIntro();
    assert(res.intro);
    assert(res.rules);
  });
});

describe("validateQuestion", () => {
  describe("should return true for a valid question", () => {
    it("Is he working there?", async (t) => {
      const res = await validateQuestion(puzzle, t.name as ApprovedMessage);
      assert(res.valid);
    });
  });
  describe("should return false for an invalid question", () => {
    it("I don't like you.", async (t) => {
      const res = await validateQuestion(puzzle, t.name as ApprovedMessage);
      assertFalse(res.valid);
      assertEquals(res.reason, "not related");
    });
    it("Is America greater than before?", async (t) => {
      const res = await validateQuestion(puzzle, t.name as ApprovedMessage);
      assertFalse(res.valid);
      assertEquals(res.reason, "not related");
    });
    it("What is the job of the man?", async (t) => {
      const res = await validateQuestion(puzzle, t.name as ApprovedMessage);
      assertFalse(res.valid);
      assertEquals(res.reason, "not a yes/no question");
    });
  });
});

describe("createReplyToQuestion", () => {
  describe("should not return Yes", () => {
    it("Is he a teacher?", async (t) => {
      const res = await createReplyToQuestion({
        puzzle,
        question: t.name as ValidQuestion,
      });
      assertFalse(res.yes);
    });
  });
  describe("should return Yes", () => {
    it("Does he stay there for his work?", async (t) => {
      const res = await createReplyToQuestion({
        puzzle,
        question: t.name as ValidQuestion,
      });
      assert(res.yes);
    });
    it("Are they bees?", async (t) => {
      const res = await createReplyToQuestion({
        puzzle,
        question: t.name as ValidQuestion,
        context: [
          {
            question: "Does he watch creatures?" as ValidQuestion,
            reply: "Yes!" as ReplyToQuestion,
          },
        ],
      });
      assert(res.yes);
    });
  });
});

describe("checkPuzzleSolved", () => {
  it("should return false", async () => {
    const res = await checkPuzzleSolved({
      puzzle,
      chats: [
        {
          question: "Does he stay there for his work?" as ValidQuestion,
          reply: "Yes!" as ReplyToQuestion,
        },
      ],
    });
    assertFalse(res);
  });
  it("should return true", async () => {
    const res = await checkPuzzleSolved({
      puzzle,
      chats: [
        {
          question: "Does he stay there for his work?" as ValidQuestion,
          reply: "Yes!" as ReplyToQuestion,
        },
        {
          question: "Is he a beekeeper?" as ValidQuestion,
          reply: "Yes!" as ReplyToQuestion,
        },
      ],
    });
    assert(res);
  });
});

describe("createResultAnnounce", () => {
  it("create announcement of a result", async () => {
    const res = await createResultAnnounce({
      winner: "nprofile1xxxxxxxxxxx" as NostrProfile,
    });
    assert(res);
  });
});
