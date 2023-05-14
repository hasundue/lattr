import "https://deno.land/std@0.185.0/dotenv/load.ts";
import { retry } from "https://deno.land/std@0.185.0/async/mod.ts";
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
import { NostrProfile } from "./nostr.ts";

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
  console.log("Applying moderation by OpenAI...");

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
  const { data } = await retry(() =>
    openai.createChatCompletion({
      ...request,
      model: request.model === "gpt-4" ? "gpt-4-0314" : "gpt-3.5-turbo-0301",
    }), { maxAttempts: 2 });

  for (const choice of data.choices) {
    if (!choice.message) {
      throw new Error("OpenAI did not return a message.", { cause: data });
    }
  }
  const choices = data.choices as Require<
    CreateChatCompletionResponseChoicesInner,
    "message"
  >[];
  // Strip '"' from the content of the message
  for (let i = 0; i < choices.length; i++) {
    const content = choices[i].message.content;
    if (content[0] === '"') {
      choices[i].message.content = content.slice(1, -1);
    }
    console.debug(choices[i].message.content, "\n");
  }

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
  GPT_3_5: CompletionUsage;
  GPT_4: CompletionUsage;
};

export function accumulateCompletionUsages(
  usages: CompletionUsage[],
): AccumulatedCompletionUsage {
  return {
    GPT_3_5: {
      ...accumulateChatCompletionUsages(
        usages.filter((usage) => usage.model === "gpt-3.5"),
      ),
      model: "gpt-3.5",
    },
    GPT_4: {
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
  console.log("Asking ChatGPT for a puzzle...\n");

  const data = await createChatCompletion({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: "You are a talented puzzle creator.",
      },
      {
        role: "user",
        content: `Create an unique and interesting puzzle.

Requirements:
- The problem should present an unusual scenario or situation with a challenging mystery.
- Readers must find an unexpected story behind it, which elegantly solves the mystery without significant inconsistency.
- The last sentence of the problem must be a simple and brief question.

Desired format: 
{ 
  "problem": <problem in 280 characters or less>,
  "answer": <answer in 280 characters or less>
}`,
      },
    ],
    temperature: 1,
  });

  const puzzle = JSON.parse(data.choices[0].message.content) as Puzzle;

  return { ...puzzle, usages: [data.usage] };
}

export async function createIntroduction(args: {
  puzzle: Puzzle;
}): Promise<
  { preface: string; request: string } & CompletionResult
> {
  console.log("Asking ChatGPT to create an introduction...\n");

  const usages: CompletionUsage[] = [];

  const system_init: ChatCompletionRequestMessage = {
    role: "system",
    content:
      `You are sharing the following puzzle you created with your friends: ${args.puzzle.problem}`,
  };

  const user_preface: ChatCompletionRequestMessage = {
    role: "user",
    content:
      `Create a short preface to introduce your puzzle to your friends. Do not include the content of the puzzle.
Desired format: <greeting in 10 words or less> <an introductory phrase in 10 words or less>`,
  };

  const completion_intro = await createChatCompletion({
    model: "gpt-3.5",
    messages: [
      system_init,
      user_preface,
    ],
    temperature: 1,
  });
  usages.push(completion_intro.usage);
  const assistant_intro = completion_intro.choices[0].message;

  const completion_request = await createChatCompletion({
    model: "gpt-3.5",
    messages: [
      system_init,
      user_preface,
      assistant_intro,
      {
        role: "user",
        content:
          `Create a sentence that request your friends to ask you Yes/No questions to solve the puzzle in 10 words or less.`,
      },
    ],
    temperature: 1,
  });
  usages.push(completion_request.usage);

  return {
    preface: assistant_intro.content,
    request: completion_request.choices[0].message.content,
    usages,
  };
}

export type ValidQuestion = Brand<string, "ApprovedMessage" | "ValidQuestion">;

type ValidateQuestionConcreteResult<T extends boolean> =
  & {
    valid: T;
  }
  & (T extends true ? {
      question: ValidQuestion;
    }
    : {
      reason: "not related" | "not a yes/no question";
      reply: string;
    })
  & CompletionResult;

export type ValidateQuestionResult =
  | ValidateQuestionConcreteResult<true>
  | ValidateQuestionConcreteResult<false>;

export async function validateMessage(
  puzzle: Puzzle,
  question: ApprovedMessage,
): Promise<ValidateQuestionResult> {
  console.log("Asking ChatGPT to validate the message...\n");

  const usages: CompletionUsage[] = [];

  const system_init: ChatCompletionRequestMessage = {
    role: "system",
    content: "You are an assistant of an online puzzle session.",
  };

  const system_problem: ChatCompletionRequestMessage = {
    role: "system",
    content: `The ongoing puzzle: "${puzzle.problem}".`,
  };

  const system_rules: ChatCompletionRequestMessage = {
    role: "system",
    content:
      `Participants may submit you their answers or ask you Yes/No questions to gather additional information about the puzzle.`,
  };

  const system_question: ChatCompletionRequestMessage = {
    role: "system",
    content: `Someone has sent you a message: "${question}"`,
  };

  // Ask ChatGPT if the question is related to the puzzle.
  const completion_related = await createChatCompletion({
    model: "gpt-3.5",
    messages: [
      system_init,
      system_problem,
      system_rules,
      system_question,
      {
        role: "user",
        content:
          `Do you think the message is from a participant who is trying to solve the puzzle?
Desired format: <Yes/No>.`,
      },
    ],
    temperature: 0,
    stop: [",", "."],
  });
  usages.push(completion_related.usage);

  // If not, create a reply saying that the question is not related to the puzzle.
  if (completion_related.choices[0].message.content.startsWith("No")) {
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
      reason: "not related",
      reply: completion_reply.choices[0].message.content,
      usages,
    };
  }

  // Ask ChatGPT if the question is a Yes/No question.
  const completion_yesno = await createChatCompletion({
    model: "gpt-3.5",
    messages: [
      system_question,
      {
        role: "user",
        content:
          `Does the message allow you to answer it with affirmation or negation, technically?
Desired format: <Yes/No>.`,
      },
    ],
    temperature: 0,
    stop: [",", "."],
  });
  usages.push(completion_yesno.usage);

  if (completion_yesno.choices[0].message.content.startsWith("No")) {
    const completion_reply = await createChatCompletion({
      model: "gpt-3.5",
      messages: [
        system_init,
        system_problem,
        system_question,
        {
          role: "user",
          content:
            "Reply to the message in 70 characters, asking them to make a Yes/No question.",
        },
      ],
      temperature: 0.8,
    });
    usages.push(completion_reply.usage);
    return {
      valid: false,
      reason: "not a yes/no question",
      reply: completion_reply.choices[0].message.content,
      usages,
    };
  }

  return { valid: true, question: question as ValidQuestion, usages };
}

export type Chat = {
  question: ValidQuestion;
  reply: ReplyToQuestion;
  replyType: ReplyType;
};

export type ReplyToQuestion = Brand<string, "ReplyToQuestion">;

export type ReplyType = "affirmation" | "negation" | "neither";

export type CreateReplyToQuestionResult = {
  reply: ReplyToQuestion;
  replyType: ReplyType;
  solved: boolean;
} & CompletionResult;

export async function createReplyToQuestion(args: {
  puzzle: Puzzle;
  question: ValidQuestion;
  context?: Chat[];
}): Promise<CreateReplyToQuestionResult> {
  console.log("Asking ChatGPT to reply to the question...\n");

  const { puzzle, question, context } = args;
  const usages: CompletionUsage[] = [];

  const system_init: ChatCompletionRequestMessage = {
    role: "system",
    content: "You are an assistant of an online puzzle session.",
  };

  const system_problem: ChatCompletionRequestMessage = {
    role: "system",
    content: `The ongoing puzzle: "${puzzle.problem}".`,
  };

  const system_answer: ChatCompletionRequestMessage = {
    role: "system",
    content: `The answer: "${puzzle.answer}" (not revealed to participants).`,
  };

  const system_rules: ChatCompletionRequestMessage = {
    role: "system",
    content: `Participants ask you Yes/No questions to find the answer.`,
  };

  const chat_context = context?.map((chat): ChatCompletionRequestMessage[] => [
    {
      role: "user",
      content: chat.question,
    },
    {
      role: "assistant",
      content: chat.reply,
    },
  ]).flat() ?? [];

  const user_question: ChatCompletionRequestMessage = {
    role: "user",
    content: question,
  };

  const completion_yesno = await createChatCompletion({
    model: "gpt-3.5",
    messages: [
      system_init,
      system_problem,
      system_answer,
      system_rules,
      {
        role: "system",
        content: `Reply to the following messages about the puzzle.

Desired format: <Yes/No><./!>`,
      },
      ...chat_context,
      user_question,
    ],
    temperature: 0,
  });
  usages.push(completion_yesno.usage);

  const assistant_yesno = completion_yesno.choices[0].message;
  const yesno = assistant_yesno.content;

  const completion_classify = await createChatCompletion({
    model: "gpt-3.5",
    messages: [
      user_question,
      assistant_yesno,
      {
        role: "user",
        content: `Classify the reply.

Desired format: <affirmation/negation/neither>`,
      },
    ],
    temperature: 0,
    stop: [",", "."],
  });
  usages.push(completion_classify.usage);

  const replyType = completion_classify.choices[0].message.content
    .toLowerCase() as ReplyType;

  const solved = replyType === "affirmation"
    ? await createChatCompletion({
      model: "gpt-4",
      messages: [
        system_init,
        system_problem,
        system_answer,
        ...chat_context,
        user_question,
        assistant_yesno,
        {
          role: "user",
          content:
            `Does the conversation above suggest that the participants solved the puzzle?

Desired format: <Yes/No>.`,
        },
      ],
      stop: [".", ","],
      temperature: 0,
    }).then((completion_solved) => {
      usages.push(completion_solved.usage);
      return completion_solved.choices[0].message.content.startsWith("Yes");
    })
    : false;

  // Create an additional comment to the reply if it is just a Yes/No.
  // If the puzzle is solved, add a sentence to praise them in the reply.
  // If not, add a sentence to encourage them to ask another question.
  const user_comment: ChatCompletionRequestMessage = solved
    ? {
      role: "user",
      content:
        `Add a brief sentence that tells them the puzzle is solved and praises them, in 10 words or less.

  ${yesno} `,
    }
    : {
      role: "user",
      content:
        `Add an encouraging phrase that evaluates the question, in 5 words or less.

  ${yesno} `,
    };

  const comment = solved || yesno.length < 5
    ? await createChatCompletion({
      model: "gpt-3.5",
      messages: [
        system_init,
        system_problem,
        ...chat_context,
        user_question,
        assistant_yesno,
        user_comment,
      ],
      temperature: 1,
    }).then((completion_comment) => {
      usages.push(completion_comment.usage);
      return ` ${completion_comment.choices[0].message.content}`;
    })
    : "";

  const reply = yesno + comment as ReplyToQuestion;

  return { reply, replyType, solved, usages };
}

export type ResultAnnounce = {
  intro: string;
  remark: string;
};

export async function createResultAnnounce(args: {
  winner: NostrProfile;
}): Promise<ResultAnnounce & CompletionResult> {
  const { winner } = args;

  const usages: CompletionUsage[] = [];

  const system_init: ChatCompletionRequestMessage = {
    role: "system",
    content: "You are an assistant of an online puzzle session.",
  };

  const system_solver: ChatCompletionRequestMessage = {
    role: "system",
    content: `A participant ${winner} solved a puzzle.`,
  };

  const completion_intro = await createChatCompletion({
    model: "gpt-3.5",
    messages: [
      system_init,
      system_solver,
      {
        role: "user",
        content:
          "Create a brief sentence to announce who solved the puzzle, followed by an introduction for the answer, in 70 characters or less. Example: Congraturation to xxxxxx for solving the puzzle! Here is the answer:",
      },
    ],
    temperature: 1,
  });
  usages.push(completion_intro.usage);

  const completion_remark = await createChatCompletion({
    model: "gpt-3.5",
    messages: [
      system_init,
      {
        role: "user",
        content:
          "Create a message saying thank-you to participants and asking them to wait you charging yourself for the next puzzle, in 70 characters",
      },
    ],
    temperature: 1,
  });
  usages.push(completion_remark.usage);

  return {
    intro: completion_intro.choices[0].message.content,
    remark: completion_remark.choices[0].message.content,
    usages,
  };
}

export async function createCloseAnnounce(): Promise<string> {
  console.log(
    "Asking ChagGPT to create an announce for closing the session...\n",
  );

  const system_init: ChatCompletionRequestMessage = {
    role: "system",
    content: "You are an assistant of an online puzzle session.",
  };

  const user_close: ChatCompletionRequestMessage = {
    role: "user",
    content:
      `Create a message to announce the session is closed due to an unexpected trouble, in 140 characters or less.

Example: This puzzle has been closed due to an unexpected trouble. Sorry for the inconvenience.`,
  };

  const completion_close = await createChatCompletion({
    model: "gpt-3.5",
    messages: [
      system_init,
      user_close,
    ],
    temperature: 1,
  });

  return completion_close.choices[0].message.content;
}
