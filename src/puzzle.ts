import "https://deno.land/std@0.185.0/dotenv/load.ts";
import { ChatOpenAI } from "npm:langchain/chat_models/openai";
import { BufferMemory } from "npm:langchain/memory";
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  MessagesPlaceholder,
  SystemMessagePromptTemplate,
} from "npm:langchain/prompts";
import { ConversationChain, LLMChain } from "npm:langchain/chains";

export type Puzzle = {
  problem: string;
  answer: string;
};

type Input = Record<string, string> & {
  message: string;
};

async function ask(chain: ConversationChain, input: Input) {
  if (input.request) {
    console.log(`(${input.request})`);
  }
  console.log(`> ${input.message}\n`);
  return await chain.call(input);
}

export async function createPuzzle(): Promise<Puzzle> {
  console.log("Asking OpenAI for a puzzle...\n");

  const prompt = ChatPromptTemplate.fromPromptMessages([
    SystemMessagePromptTemplate.fromTemplate(
      "You should always refer the following our conversation history:",
    ),
    new MessagesPlaceholder("history"),
    HumanMessagePromptTemplate.fromTemplate("{message}"),
  ]);

  const chain = new ConversationChain({
    memory: new BufferMemory({ returnMessages: true, memoryKey: "history" }),
    prompt,
    llm: new ChatOpenAI({ temperature: 1, modelName: "gpt-3.5-turbo" }),
  });

  const { response: problem } = await ask(chain, {
    message:
      "Create an unusual and interesting scenario with a challenging mystery in 280 characters or less. The last sentence must be a short question for readers to find a story behind the scenario.",
  });
  console.log(problem);

  const { response: answer } = await ask(chain, {
    message:
      "Create an unexpected and interesting answer to the question in 140 characters or less.",
  });
  console.log(answer);

  return { problem, answer };
}

export async function validateQuestion(puzzle: Puzzle, question: string) {
  const prompt = ChatPromptTemplate.fromPromptMessages([
    SystemMessagePromptTemplate.fromTemplate(`
Suppose you have presented the following puzzle to me:

{problem}

{request} Explain your reasoning in detail as well.
`),
    HumanMessagePromptTemplate.fromTemplate("{message}"),
  ]);

  const chain = new LLMChain({
    prompt,
    llm: new ChatOpenAI({ temperature: 0, modelName: "gpt-3.5-turbo" }),
  });

  const { text: valid } = await ask(chain, {
    ...puzzle,
    request:
      "Is the following message asking any additional information about a scenario described in the puzzle?",
    message: question,
  });
  console.log(valid, "\n");

//   const response = await ask(chain, {
//     ...puzzle,
//     request:
//       "I am now asking you questions about the puzzle. Discuss if you could answer my question with Yes or No only based on the information found in the problem and answer sentences of the puzzle, showing your thoughts in detail.",
//     message: question,
//   });
//   console.log(response.text, "\n");
}
