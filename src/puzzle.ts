import "https://deno.land/std@0.185.0/dotenv/load.ts";
import { ChatOpenAI } from "npm:langchain/chat_models/openai";
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate,
} from "npm:langchain/prompts";
import { ConversationChain, LLMChain } from "npm:langchain/chains";
import {
  ChatCompletionRequestMessage,
  Configuration,
  CreateChatCompletionRequest,
  CreateChatCompletionResponse,
  OpenAIApi,
} from "npm:openai@3.2.1";

export type Puzzle = {
  problem: string;
  answer: string;
};

type Input = Record<string, string> & {
  message: string;
};

const config = new Configuration({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const openai = new OpenAIApi(config);

type CompletionRequest = Omit<CreateChatCompletionRequest, "model"> & {
  model?: string;
};

function createChatCompletion(request: CompletionRequest) {
  return openai.createChatCompletion({
    model: request.model ?? "gpt-3.5-turbo",
    ...request,
  });
}

type CompletionUsage = NonNullable<
  CreateChatCompletionResponse["usage"]
>;

const CompletionUsage: {
  zero: { [key in keyof CompletionUsage]: 0 };
} = {
  zero: {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  },
};

function reduceCompletionUsages(usages: CompletionUsage[]): CompletionUsage {
  return usages.reduce(
    (acc, cur) => ({
      prompt_tokens: acc.prompt_tokens + cur.prompt_tokens,
      completion_tokens: acc.completion_tokens + cur.completion_tokens,
      total_tokens: acc.total_tokens + cur.total_tokens,
    }),
    CompletionUsage.zero,
  );
}

export type CompletionResult = {
  usage: CompletionUsage;
};

async function ask(chain: ConversationChain, input: Input) {
  if (input.request) {
    console.debug(`(${input.request})\n`);
  }
  console.debug(`> ${input.message}\n`);
  return await chain.call(input);
}

export async function createPuzzle(): Promise<CompletionResult & Puzzle> {
  console.debug("Asking GPT-4 for a puzzle...\n");

  const { data } = await createChatCompletion({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: "You are a talented puzzle creator.",
      },
      {
        role: "user",
        content:
          "Create an unique and interesting puzzle. The problem should present an unusual scenario or situation with a challenging mystery, asking you to find a story behind it which solves the mystery elegantly without any logical inconsistency. The last sentence of the problem must be a simple and brief question. Return a JSON object with 'problem' and 'answer' fields, preferably in 280 characters or less each.",
      },
    ],
    temperature: 1.0,
  });

  if (!data.choices[0].message) {
    throw new Error("OpenAI did not return a puzzle.");
  }

  const puzzle = JSON.parse(data.choices[0].message.content) as Puzzle;
  console.log("Q:", puzzle.problem, "\n");
  console.log("A:", puzzle.answer, "\n");

  const usage = data.usage ?? CompletionUsage.zero;
  console.log("Tokens:", usage.total_tokens, "\n");

  return { ...puzzle, usage };
}

export async function validateQuestion(
  puzzle: Puzzle,
  question: string,
): Promise<{ valid: boolean; reply?: string }> {
  const prompt = ChatPromptTemplate.fromPromptMessages([
    SystemMessagePromptTemplate.fromTemplate(`
Suppose you have presented the following puzzle to me:

{problem}

{request}.
`),
    HumanMessagePromptTemplate.fromTemplate("{message}"),
  ]);

  const chain = new LLMChain({
    prompt,
    llm: new ChatOpenAI({ temperature: 0, modelName: "gpt-3.5-turbo" }),
  });

  const { text: related } = await ask(chain, {
    ...puzzle,
    request:
      "Is the following message asking any additional information about a scenario described in the puzzle?",
    message: question,
  }) as { text: string };
  console.debug(related, "\n");

  if (!related.startsWith("Yes")) {
    const { text: reply } = await ask(chain, {
      ...puzzle,
      request:
        "Create a very short reply to the following message, telling that it is not related to the puzzle.",
      message: question,
    }) as { text: string };
    console.debug(reply, "\n");
    return { valid: false, reply };
  }

  const { text: yesno } = await ask(chain, {
    ...puzzle,
    request:
      "Does the following question have a grammatical structure that allows answering it with Yes or No only?",
    message: question,
  }) as { text: string };
  console.debug(yesno, "\n");

  if (!yesno.startsWith("Yes")) {
    const { text: reply } = await ask(chain, {
      ...puzzle,
      request:
        "Create a very short reply to the following message, telling that it does not have a grammatical structure that allows answering it with Yes or No only",
      message: question,
    }) as { text: string };
    console.debug(reply, "\n");
    return { valid: false, reply };
  }

  return { valid: true };
}

export async function replyToQuestion(
  puzzle: Puzzle,
  question: string,
): Promise<{ yes: boolean; reply: string }> {
  const prompt = ChatPromptTemplate.fromPromptMessages([
    SystemMessagePromptTemplate.fromTemplate(`
Suppose you have presented the following puzzle to me:

{problem}

The answer to the puzzle is:

{answer}

{request}
`),
    HumanMessagePromptTemplate.fromTemplate("{message}"),
  ]);

  const chain = new LLMChain({
    prompt,
    llm: new ChatOpenAI({ temperature: 0, modelName: "gpt-3.5-turbo" }),
  });

  const { text: yesno } = await ask(chain, {
    ...puzzle,
    request:
      "Reply to the following question witn Yes or No only, based on the information in the sentences of the puzzle.",
    message: question,
  }) as { text: string };
  console.debug(yesno, "\n");

  if (!yesno.startsWith("Yes")) {
    return { yes: false, reply: yesno };
  }

  return { yes: yesno.startsWith("Yes"), reply: yesno };
}
