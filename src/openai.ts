import "https://deno.land/std@0.185.0/dotenv/load.ts";
import {
  ChatCompletionRequestMessage,
  Configuration,
  CreateChatCompletionRequest,
  CreateChatCompletionResponse,
  CreateChatCompletionResponseChoicesInner,
  CreateModerationResponseResultsInnerCategories,
  OpenAIApi,
} from "npm:openai@3.2.1";
import { Brand, Replace, Require } from "./utils.ts";

const config = new Configuration({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const openai = new OpenAIApi(config);

export type ApprovedMessage = Brand<string, "ApprovedMessage">;

type ModerationConcreteResult<T extends boolean> =
  & {
    approved: T;
  }
  & (T extends true ? {
      message: ApprovedMessage;
    }
    : {
      categories: ModerationCategory[];
    });

export type ModerationResult =
  | ModerationConcreteResult<true>
  | ModerationConcreteResult<false>;

export type ModerationCategory =
  keyof CreateModerationResponseResultsInnerCategories;

export async function applyModeration(
  message: string,
): Promise<ModerationResult> {
  const { data } = await openai.createModeration({
    input: message,
    model: "text-moderation-latest",
  });
  console.debug(data);

  if (data.results.length > 1) {
    console.warn("OpenAI returned more than one result.");
  }
  const result = data.results[0];

  if (!result.flagged) {
    return {
      approved: true,
      message: message as ApprovedMessage,
    };
  }

  const categories: ModerationCategory[] = [];

  for (const key in result.categories) {
    const category = key as ModerationCategory;
    if (result.categories[category]) {
      categories.push(category);
    }
  }

  return { approved: false, categories };
}

type CompletionRequest = Replace<
  CreateChatCompletionRequest,
  "model",
  "gpt-3.5" | "gpt-4"
>;

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
    choices: Require<CreateChatCompletionResponseChoicesInner, "message">[];
  };

async function createChatCompletion(
  request: CompletionRequest,
): Promise<CompletionResponseData> {
  for (const message of request.messages) {
    console.debug(">", message.content, "\n");
  }
  const { data } = await openai.createChatCompletion({
    ...request,
    model: request.model === "gpt-4" ? "gpt-4-0314" : "gpt-3.5-turbo-0301",
  });

  for (const choice of data.choices) {
    if (!choice.message) {
      throw new Error("OpenAI did not return a message.", { cause: data });
    }
    console.debug(choice.message.content, "\n");
  }
  const choices = data.choices as Require<
    CreateChatCompletionResponseChoicesInner,
    "message"
  >[];

  const usage: CompletionUsage = {
    ...(data.usage ?? ChatCompletionUsage.zero),
    model: request.model,
  };
  console.debug("Tokens:", usage.total_tokens, "\n");

  return { ...data, usage, choices };
}

type ChatCompletionUsage = NonNullable<
  CreateChatCompletionResponse["usage"]
>;

const ChatCompletionUsage: {
  zero: ChatCompletionUsage;
} = {
  zero: {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  },
};

export type CompletionUsage = ChatCompletionUsage & {
  model: CompletionRequest["model"];
};

export const CompletionUsage = {
  zero: (model: CompletionRequest["model"]): CompletionUsage => ({
    ...ChatCompletionUsage.zero,
    model,
  }),
};

function accumulateChatCompletionUsages(
  usages: ChatCompletionUsage[],
) {
  return usages.reduce(
    (acc, cur) => ({
      prompt_tokens: acc.prompt_tokens + cur.prompt_tokens,
      completion_tokens: acc.completion_tokens + cur.completion_tokens,
      total_tokens: acc.total_tokens + cur.total_tokens,
    }),
    ChatCompletionUsage.zero,
  );
}

export type AccumulatedCompletionUsage = {
  "gpt-3.5": CompletionUsage;
  "gpt-4": CompletionUsage;
};

export function accumulateCompletionUsages(
  usages: CompletionUsage[],
): AccumulatedCompletionUsage {
  return {
    "gpt-3.5": {
      ...accumulateChatCompletionUsages(
        usages.filter((usage) => usage.model === "gpt-3.5"),
      ),
      model: "gpt-3.5",
    },
    "gpt-4": {
      ...accumulateChatCompletionUsages(
        usages.filter((usage) => usage.model === "gpt-4"),
      ),
      model: "gpt-4",
    },
  };
}

export type CompletionResult = {
  usages: CompletionUsage[];
};

export type Puzzle = {
  problem: string;
  answer: string;
};

export async function createPuzzle(): Promise<Puzzle & CompletionResult> {
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

  return { ...puzzle, usages: [data.usage] };
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

  const usages: CompletionUsage[] = [];

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
    content: `A participant sent you a message: "${question}"`,
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
  usages.push(completion_related.usage);

  // If not, create a reply saying that the question is not related to the puzzle.
  if (!completion_related.choices[0].message.content.startsWith("Yes")) {
    const completion_reply = await createChatCompletion({
      model: "gpt-3.5",
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
    usages.push(completion_reply.usage);
    return {
      valid: false,
      reason: "not-related",
      reply: completion_reply.choices[0].message.content,
      usages,
    };
  }

  // Ask GPT-3.5 if the question is a Yes/No question.
  const completion_yesno = await createChatCompletion({
    model: "gpt-3.5",
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
  usages.push(completion_yesno.usage);

  if (!completion_yesno.choices[0].message.content.startsWith("Yes")) {
    const completion_reply = await createChatCompletion({
      model: "gpt-3.5",
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
    usages.push(completion_reply.usage);
    return {
      valid: false,
      reason: "not-yesno",
      reply: completion_reply.choices[0].message.content,
      usages,
    };
  }

  return { valid: true, question: question as ValidQuestion, usages };
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

  const usages: CompletionUsage[] = [];

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
    content: `A participant sent you a question: "${question}"`,
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
  usages.push(completion_reply.usage);

  const reply = completion_reply.choices[0].message.content;
  const yes = reply.startsWith("Yes");

  if (!yes) {
    return {
      yes,
      reply: reply as ReplyToQuestion,
      solved: false,
      usages,
    };
  }

  const completion_solved = await createChatCompletion({
    model: "gpt-3.5",
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
  usages.push(completion_solved.usage);

  return {
    yes,
    reply: reply as ReplyToQuestion,
    solved: completion_solved.choices[0].message.content.startsWith("Yes"),
    usages,
  };
}
