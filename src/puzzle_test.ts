import { validateQuestion } from "./puzzle.ts";

const puzzle = {
  problem:
    "In a small town, every night, a mysterious light appears in the sky. The people are afraid and intrigued at the same time. The local authorities have been investigating for months, but still, no one can solve the mystery. What could this strange light be, and where does it come from?",
  answer:
    "The light turned out to be the product of a group of alien students conducting a science project on Earth. They've been observing the town's reaction, amazed at the fear and curiosity they have stirred.",
};

await validateQuestion(puzzle, "Is the light a UFO?");
// await validateQuestion(puzzle, "What is the name of the town?");
// await validateQuestion(puzzle, "I don't like you.");

// await handleQuestion(puzzle, "What is the answer?");
//
`
Is the following sentence a question to gather more information about the scenario described in the problem? Describe the reason of your answer as well.

"What color is the mysterious light?"
`;
