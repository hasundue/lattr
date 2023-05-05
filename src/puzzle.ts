import "https://deno.land/std@0.185.0/dotenv/load.ts";
import {
  ChatCompletionRequestMessage,
  Configuration,
  CreateChatCompletionRequest,
  CreateChatCompletionResponse,
  CreateChatCompletionResponseChoicesInner,
  OpenAIApi,
} from "npm:openai@3.2.1";
import { Brand } from "./utils.ts";

export type Puzzle = {
  problem: string;
  answer: string;
};

const config = new Configuration({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const openai = new OpenAIApi(config);

type CompletionRequest = Omit<CreateChatCompletionRequest, "model"> & {
  model?: string;
};

/**
 * A response from OpenAI's `createChatCompletion` API, but with
 * `usage` and `choices` properties that are not nullable.
 */
type CompletionResponseData =
  & Omit<CreateChatCompletionResponse, "usage" | "choices">
  & {
    usage: CompletionUsage;
  }
  & {
    choices: Omit<CreateChatCompletionResponseChoicesInner, "message"> & {
      message: ChatCompletionRequestMessage;
    }[];
  };

async function createChatCompletion(
  request: CompletionRequest,
) {
  for (const message of request.messages) {
    console.debug(">", message.content, "\n");
  }
  const { data } = await openai.createChatCompletion({
    model: request.model ?? "gpt-3.5-turbo",
    ...request,
  });
  if (!data.choices[0].message) {
    throw new Error("OpenAI did not return a message.", { cause: data });
  }
  console.debug(data.choices[0].message.content, "\n");

  data.usage = data.usage ?? CompletionUsage.zero;
  console.debug("Tokens:", data.usage.total_tokens, "\n");

  return data as CompletionResponseData;
}

type CompletionUsage = NonNullable<
  CreateChatCompletionResponse["usage"]
>;

const CompletionUsage = {
  zero: {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  } as CompletionUsage,
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
  usage: {
    gpt3: CompletionUsage;
    gpt4: CompletionUsage;
  };
};

export function printCompletionUsage(usage: CompletionResult["usage"]) {
  console.log(
    "Tokens:",
    usage.gpt3.total_tokens,
    "(GPT-3.5),",
    usage.gpt4.total_tokens,
    "(GPT-4)\n",
  );
}

export async function createPuzzle(): Promise<CompletionResult & Puzzle> {
  console.log("Asking GPT-4 for a puzzle...\n");

  const data = await createChatCompletion({
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
    temperature: 1,
  });

  const puzzle = JSON.parse(data.choices[0].message.content) as Puzzle;

  return { ...puzzle, usage: { gpt3: CompletionUsage.zero, gpt4: data.usage } };
}

export type ValidQuestion = Brand<string, "ValidQuestion">;

type ValidateQuestionConcreteResult<T extends boolean> =
  & {
    valid: T;
  }
  & (T extends true ? {
      question: ValidQuestion;
    }
    : {
      reason: "not-related" | "not-yesno";
      reply: string;
    })
  & CompletionResult;

export type ValidateQuestionResult =
  | ValidateQuestionConcreteResult<true>
  | ValidateQuestionConcreteResult<false>;

export async function validateQuestion(
  puzzle: Puzzle,
  question: string,
): Promise<ValidateQuestionResult> {
  console.log("Asking GPT-3.5 to validate the puzzle...\n");

  const system_init: ChatCompletionRequestMessage = {
    role: "system",
    content: "You are an assistant of an online puzzle session.",
  };

  const system_problem: ChatCompletionRequestMessage = {
    role: "system",
    content: `A puzzle has been presented: "${puzzle.problem}".`,
  };

  const system_question: ChatCompletionRequestMessage = {
    role: "system",
    content: `A participant has sent you a message: "${question}"`,
  };

  // Ask GPT-4 if the question is related to the puzzle.
  const completion_related = await createChatCompletion({
    model: "gpt-4",
    messages: [
      system_init,
      system_problem,
      system_question,
      {
        role: "user",
        content:
          "Is the message asking additional information about a scenario or situation described in the puzzle?",
      },
    ],
    temperature: 0,
  });

  // If not, create a reply saying that the question is not related to the puzzle.
  if (!completion_related.choices[0].message.content.startsWith("Yes")) {
    const completion_reply = await createChatCompletion({
      messages: [
        system_init,
        system_problem,
        system_question,
        {
          role: "user",
          content:
            "Create a very short reply to the message, telling that it is not related to the puzzle.",
        },
      ],
      temperature: 0.8,
    });
    const usage = {
      gpt3: completion_reply.usage,
      gpt4: completion_related.usage,
    };
    return {
      valid: false,
      reason: "not-related",
      reply: completion_reply.choices[0].message.content,
      usage,
    };
  }

  // Ask GPT-3.5 if the question is a Yes/No question.
  const completion_yesno = await createChatCompletion({
    messages: [
      system_question,
      {
        role: "user",
        content:
          "Does the question has a grammatical structure that allows answering it with Yes or No only?",
      },
    ],
    temperature: 0,
  });

  if (!completion_yesno.choices[0].message.content.startsWith("Yes")) {
    const completion_reply = await createChatCompletion({
      messages: [
        system_init,
        system_problem,
        system_question,
        {
          role: "user",
          content:
            "Create a very short reply to the message, telling that it is not a Yes/No question.",
        },
      ],
      temperature: 0.8,
    });
    const usage = {
      gpt3: reduceCompletionUsages([
        completion_yesno.usage,
        completion_reply.usage,
      ]),
      gpt4: completion_related.usage,
    };
    return {
      valid: false,
      reason: "not-yesno",
      reply: completion_reply.choices[0].message.content,
      usage,
    };
  }

  const usage = {
    gpt3: reduceCompletionUsages([
      completion_related.usage,
      completion_yesno.usage,
    ]),
    gpt4: completion_related.usage,
  };

  return { valid: true, question: question as ValidQuestion, usage };
}

export type ReplyToQuestion = Brand<string, "ReplyToQuestion">;

export type ReplyToQuestionResult = {
  yes: boolean;
  reply: ReplyToQuestion;
  solved: boolean;
} & CompletionResult;

export async function replyToQuestion(
  puzzle: Puzzle,
  question: ValidQuestion,
): Promise<ReplyToQuestionResult> {
  console.log("Asking ChatGPT to reply to the question...\n");

  const system_init: ChatCompletionRequestMessage = {
    role: "system",
    content: "You are an assistant of an online puzzle session.",
  };

  const system_problem: ChatCompletionRequestMessage = {
    role: "system",
    content: `A puzzle has been presented: "${puzzle.problem}".`,
  };

  const system_answer: ChatCompletionRequestMessage = {
    role: "system",
    content:
      `The answer of the puzzle is: "${puzzle.answer}", which is not revealed to the participants yet.`,
  };

  const system_question: ChatCompletionRequestMessage = {
    role: "system",
    content: `A participant has sent you a question: "${question}"`,
  };

  const completion_reply = await createChatCompletion({
    model: "gpt-4",
    messages: [
      system_init,
      system_problem,
      system_answer,
      system_question,
      {
        role: "user",
        content:
          "Create a Yes/No reply to the question. Answer in excitement if the question is critical.",
      },
    ],
    temperature: 0,
  });

  const reply = completion_reply.choices[0].message.content;
  const yes = reply.startsWith("Yes");

  if (!yes) {
    return {
      yes,
      reply: reply as ReplyToQuestion,
      solved: false,
      usage: {
        gpt3: CompletionUsage.zero,
        gpt4: completion_reply.usage,
      },
    };
  }

  const completion_solved = await createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      system_init,
      system_problem,
      system_answer,
      system_question,
      {
        role: "system",
        content: `You answered: "${reply}"`,
      },
      {
        role: "user",
        content: "Is the puzzle solved in the conversation?",
      },
    ],
    temperature: 0,
  });

  return {
    yes,
    reply: reply as ReplyToQuestion,
    solved: completion_solved.choices[0].message.content.startsWith("Yes"),
    usage: {
      gpt3: completion_solved.usage,
      gpt4: completion_reply.usage,
    },
  };
}
