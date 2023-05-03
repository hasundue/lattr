import "https://deno.land/std@0.185.0/dotenv/load.ts";
import { ChatOpenAI } from "npm:langchain/chat_models/openai";
import { BufferMemory } from "npm:langchain/memory";
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  MessagesPlaceholder,
  SystemMessagePromptTemplate,
} from "npm:langchain/prompts";
import { ConversationChain } from "npm:langchain/chains";

export interface Puzzle {
  problem: string;
  answer: string;
}

export async function createPuzzle(): Promise<Puzzle> {
  const prompt = ChatPromptTemplate.fromPromptMessages([
    SystemMessagePromptTemplate.fromTemplate(
      "You should always refer the following our conversation history:",
    ),
    new MessagesPlaceholder("history"),
    HumanMessagePromptTemplate.fromTemplate("{input}"),
  ]);

  const questioner = new ConversationChain({
    memory: new BufferMemory({ returnMessages: true, memoryKey: "history" }),
    prompt,
    llm: new ChatOpenAI({ temperature: 1, modelName: "gpt-3.5-turbo" }),
  });

  async function ask(message: string) {
    console.log(">", message, "\n");
    const { response } = await questioner.call({ input: message });
    console.log(response, "\n");
    return response as string;
  }

  const problem = await ask(
    "Create an unusual and interesting scenario with a challenging mystery in 280 characters or less. The last sentence must be a short question for readers to find a story behind the scenario.",
  );

  const answer = await ask(
    "Create an unexpected and interesting answer to the question in 140 characters or less.",
  );

  return { problem, answer };
}
