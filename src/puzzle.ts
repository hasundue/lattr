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
  ChatCompletionResponseMessage,
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
  console.debug("Asking OpenAI for a puzzle...\n");

  const messages: Record<string, ChatCompletionRequestMessage[]> = {};
  const completion: Record<string, ChatCompletionResponseMessage> = {};
  const usages: NonNullable<CreateChatCompletionResponse["usage"]>[] = [];

  // Ask OpenAI to create a puzzle problem
  messages.init = [
    {
      role: "system",
      content: "You are a talented puzzle creator.",
    },
    {
      role: "user",
      content:
        "Create an unusual and interesting scenario with a challenging mystery in 280 characters or less. The last sentence must be a short question for readers to find a story behind the scenario.",
    },
  ];
  const { data: problem } = await createChatCompletion({
    messages: messages.init,
    temperature: 0.9,
  });
  if (!problem.usage || !problem.choices[0].message) {
    throw new Error("OpenAI did not return a puzzle.");
  }
  completion.problem = problem.choices[0].message;
  usages.push(problem.usage);
  console.log("Q:", completion.problem.content, "\n");

  // Ask OpenAI to create an answer to the puzzle
  const { data: answer } = await createChatCompletion({
    messages: [
      ...messages.init,
      completion.problem,
      {
        role: "user",
        content:
          "Create an unexpected and interesting answer to the question in 140 characters or less.",
      },
    ],
    temperature: 0.1,
  });
  if (!answer.usage || !answer.choices[0].message) {
    throw new Error("OpenAI did not return an answer to a puzzle.");
  }
  completion.answer = answer.choices[0].message;
  usages.push(answer.usage);
  console.log("A:", completion.answer.content, "\n");

  return {
    usage: reduceCompletionUsages(usages),
    problem: completion.problem.content,
    answer: completion.answer.content,
  };
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