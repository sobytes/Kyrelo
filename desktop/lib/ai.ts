import Anthropic from "@anthropic-ai/sdk";
import { getApiKeys } from "./storage";
import { AiProvider } from "./types";

const MODEL = "claude-sonnet-4-6";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

async function resolveAnthropicKey(): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const stored = await getApiKeys();
  if (stored.anthropic) return stored.anthropic;
  throw new Error("ANTHROPIC_API_KEY is not set. Add it under Settings → API keys.");
}

async function resolveOpenAiKey(): Promise<string> {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const stored = await getApiKeys();
  if (stored.openai) return stored.openai;
  throw new Error("OPENAI_API_KEY is not set. Add it under Settings → API keys.");
}

const GROK_SYSTEM = `You write short, provocative reply tweets that tag @grok and ask it a single sharp question about the user's own tweet.

Goal: surface a substantive contrarian angle so Grok writes a thoughtful response and the thread gets engagement.

Hard rules:
- Start the reply with "@grok ".
- One single question. No multi-part questions.
- Total length 220 characters or less, including "@grok ".
- No emojis. No hashtags. No quotation marks around the question.
- Don't insult the original poster, and don't fabricate facts.
- Don't quote the original tweet back.
- Don't begin with filler like "Interesting take" or "Hot take".
- Output ONLY the reply text, no preamble.`;

function clampGrokReply(text: string): string {
  let out = text.trim().replace(/^["']|["']$/g, "").trim();
  if (!/^@grok\b/i.test(out)) out = `@grok ${out}`;
  out = out.replace(/\s+/g, " ").trim();
  if (out.length > 270) out = out.slice(0, 267).trimEnd() + "...";
  return out;
}

export interface GrokQuestionInput {
  tweetText: string;
  styleHint?: string;
  provider: AiProvider;
}

async function generateGrokViaClaude(input: GrokQuestionInput): Promise<string> {
  const apiKey = await resolveAnthropicKey();
  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: [
      { type: "text", text: GROK_SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              (input.styleHint ? `Style guidance: ${input.styleHint}\n\n` : "") +
              `The user's tweet:\n"""\n${input.tweetText}\n"""\n\nWrite the @grok reply.`,
          },
        ],
      },
    ],
  });

  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function generateGrokViaOpenAI(input: GrokQuestionInput): Promise<string> {
  const apiKey = await resolveOpenAiKey();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.9,
      max_tokens: 200,
      messages: [
        { role: "system", content: GROK_SYSTEM },
        {
          role: "user",
          content:
            (input.styleHint ? `Style guidance: ${input.styleHint}\n\n` : "") +
            `The user's tweet:\n"""\n${input.tweetText}\n"""\n\nWrite the @grok reply.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
}

export async function generateGrokQuestion(input: GrokQuestionInput): Promise<string> {
  const raw =
    input.provider === "openai"
      ? await generateGrokViaOpenAI(input)
      : await generateGrokViaClaude(input);
  return clampGrokReply(raw);
}

const REWRITE_SYSTEM = `You rewrite social posts while preserving their core message.

Hard rules:
- Keep the same topic and core meaning. Do not change what's being said.
- Reword sentences, vary the structure, swap a couple of word choices.
- Stay within roughly 80–120% of the original length.
- Same tone (casual stays casual, formal stays formal).
- No em dashes. No emojis the original doesn't already use.
- Output ONLY the rewritten post — no preamble, no quotes, no labels.`;

function clampPostLength(text: string, max = 280): string {
  let out = text.trim().replace(/^["']|["']$/g, "").trim();
  out = out.replace(/[ \t]+/g, " ");
  if (out.length > max) out = out.slice(0, max - 1).trimEnd() + "…";
  return out;
}

export interface RewriteInput {
  text: string;
  provider: AiProvider;
}

async function rewriteViaClaude(text: string): Promise<string> {
  const apiKey = await resolveAnthropicKey();
  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: [{ type: "text", text: REWRITE_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Rewrite this post:\n"""\n${text}\n"""`,
          },
        ],
      },
    ],
  });
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function rewriteViaOpenAI(text: string): Promise<string> {
  const apiKey = await resolveOpenAiKey();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.9,
      max_tokens: 400,
      messages: [
        { role: "system", content: REWRITE_SYSTEM },
        { role: "user", content: `Rewrite this post:\n"""\n${text}\n"""` },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
}

export async function rewritePost(input: RewriteInput): Promise<string> {
  const raw =
    input.provider === "openai"
      ? await rewriteViaOpenAI(input.text)
      : await rewriteViaClaude(input.text);
  return clampPostLength(raw);
}
