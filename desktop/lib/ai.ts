import Anthropic from "@anthropic-ai/sdk";
import { getApiKeys } from "./storage";
import { fitText, PLATFORMS } from "./platforms";
import { AiProvider, ApiKeys, AutopilotSettings, PlatformId, ReplyTone, SeenTweet } from "./types";
import { REPLY_MAX_LENGTH, tweetLength } from "./tweet";

const MODEL = "claude-sonnet-4-6";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

/** A provider's key: the env var wins over the one saved in Settings. */
async function findApiKey(provider: keyof ApiKeys): Promise<string | undefined> {
  const fromEnv = provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  return fromEnv || (await getApiKeys())[provider];
}

export async function hasApiKey(provider: keyof ApiKeys): Promise<boolean> {
  return Boolean(await findApiKey(provider));
}

export async function resolveAnthropicKey(): Promise<string> {
  const key = await findApiKey("anthropic");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set. Add it under Settings → API keys.");
  return key;
}

export async function resolveOpenAiKey(): Promise<string> {
  const key = await findApiKey("openai");
  if (!key) throw new Error("OPENAI_API_KEY is not set. Add it under Settings → API keys.");
  return key;
}

/**
 * POSTs JSON to the OpenAI API with the user's key and returns the parsed
 * response. Every OpenAI call goes through here so they share auth, error
 * reporting and a timeout (a hung request would otherwise stall a campaign
 * or a reply forever).
 */
export async function openAiPost<T>(endpoint: string, body: object, timeoutMs = 120_000): Promise<T> {
  const apiKey = await resolveOpenAiKey();
  const res = await fetch(`https://api.openai.com/v1/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new OpenAiError(res.status, `OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** An OpenAI API error, with its status for aiErrorMessage. */
export class OpenAiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * What went wrong, for the user. The providers' own messages are written for
 * developers: Anthropic's "503 credential validation failed" (a hiccup on
 * their side) reads like a bad key. Anything that isn't an AI error passes
 * through as it is.
 */
export function aiErrorMessage(err: unknown): string {
  const [name, status] =
    err instanceof Anthropic.APIError
      ? ["Claude", err.status]
      : err instanceof OpenAiError
        ? ["OpenAI", err.status]
        : [null, undefined];
  if (err instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach Claude. Check your internet connection and try again.";
  }
  if (name && status !== undefined) {
    if (status === 401 || status === 403) return `${name} rejected your API key. Check it under Settings → API keys.`;
    if (status === 429) return `You've hit ${name}'s rate limit. Wait a minute and try again.`;
    if (status >= 500) return `${name} is having a temporary problem (error ${status} from their servers). Try again in a minute.`;
  }
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return "The AI took too long to answer. Try again.";
  }
  return err instanceof Error ? err.message : String(err);
}

/** Response shape of chat/completions, as far as we read it. */
export interface OpenAiChatResponse {
  choices?: { message?: { content?: string } }[];
}

const TONE_GUIDE: Record<ReplyTone, string> = {
  curious: "genuinely curious: ask what others would want answered",
  contrarian: "a sharp devil's advocate: question an assumption or surface a downside, respectfully",
  supportive: "warm and constructive: build on the idea and add something useful",
  witty: "dry and clever, but still substantive; never mean",
  expert: "knowledgeable and precise: add a concrete insight, number or example",
};

const DRAFT_SYSTEM = `You help someone reply thoughtfully to tweets from accounts they follow on X. For one tweet you decide whether a reply is worth their time, then draft reply options. They read every draft and send the one they like themselves.

Score the tweet from 0 to 100 on:
- relevance to their topics,
- whether they can add something real (an insight, a sharp question, a useful counterpoint),
- whether a reply will be seen (fresh tweets are worth more; replies deep in someone else's thread are worth less).
Score low for: announcements or links with nothing to add, off-topic tweets, tragedies and sensitive personal news, engagement bait, and anything matching their avoid list.
Give a one-line reason naming the angle you'd take (or why to skip).

Reply rules:
- Up to 3 options, each a different angle. Best first.
- ${REPLY_MAX_LENGTH} characters or fewer each.
- Sound like a thoughtful person, not a brand. No hashtags, no em dashes, emoji rarely and never more than one.
- Don't open with filler ("Great point", "Interesting take", "This!", "Hot take"). Don't quote the tweet back.
- Never insult the author. Never invent facts, numbers or personal experiences.
Style "grok": every option starts with "@grok " and asks Grok one single, sharp question about the tweet.
Style "direct": reply to the author in the user's own voice, without mentioning @grok.
Style "mix": the first option is grok-style, the others direct.
If the score is below the threshold you're given, return an empty replies list.`;

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "reason", "replies"],
  properties: {
    score: { type: "integer" },
    reason: { type: "string" },
    replies: { type: "array", items: { type: "string" } },
  },
} as const;

export interface DraftRepliesInput {
  tweet: Pick<SeenTweet, "handle" | "text" | "isReply" | "postedAt">;
  autopilot: AutopilotSettings;
  /** The user's own voice notes (Settings → Reply tone). */
  voiceNotes: string;
  /** Skip below this score. 0 means always draft (a reply the user asked for). */
  threshold: number;
  provider: AiProvider;
}

export interface DraftRepliesResult {
  score: number;
  reason: string;
  options: string[];
}

function draftPrompt(input: DraftRepliesInput): string {
  const { tweet, autopilot } = input;
  const ageMin = tweet.postedAt ? Math.round((Date.now() - new Date(tweet.postedAt).getTime()) / 60_000) : null;
  const lines = [`Style: ${autopilot.style}`, `Tone: ${TONE_GUIDE[autopilot.tone]}`];
  if (input.voiceNotes) lines.push(`Their voice notes: ${input.voiceNotes}`);
  lines.push(
    `Their topics: ${autopilot.topics || "(not given)"}`,
    `Avoid: ${autopilot.avoid || "(nothing specific)"}`,
    `Threshold: ${input.threshold}`,
    "",
    `Tweet by @${tweet.handle}${tweet.isReply ? " (a reply in a thread)" : ""}${ageMin !== null ? `, posted ${ageMin} min ago` : ""}:`,
    `"""\n${tweet.text}\n"""`,
  );
  return lines.join("\n");
}

/** Runs a drafting prompt (DRAFT_SCHEMA output) on the chosen provider and returns the raw JSON text. */
async function draftJson(provider: AiProvider, system: string, prompt: string, temperature: number): Promise<string> {
  if (provider === "openai") {
    const json = await openAiPost<OpenAiChatResponse>("chat/completions", {
      model: OPENAI_MODEL,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "reply_drafts", strict: true, schema: DRAFT_SCHEMA },
      },
    });
    return json.choices?.[0]?.message?.content ?? "";
  }
  const anthropic = new Anthropic({ apiKey: await resolveAnthropicKey() });
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    temperature,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: DRAFT_SCHEMA } },
    messages: [{ role: "user", content: prompt }],
  });
  if (message.stop_reason === "refusal") throw new Error("Claude declined to draft a reply to this.");
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Reads draftJson's output: the score clamped to 0–100, and no options below the threshold. */
function parseDrafts(raw: string, threshold: number): { score: number; reason: string; replies: string[] } {
  let parsed: { score?: number; reason?: string; replies?: string[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The AI returned drafts in an unreadable format. Try again.");
  }
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  const replies =
    score < threshold ? [] : (parsed.replies ?? []).filter((r) => typeof r === "string" && r.trim()).slice(0, 3);
  return { score, reason: (parsed.reason ?? "").trim(), replies };
}

/** Makes a model's reply safe to send: no wrapping quotes, @grok where required, within the limit (X's by default). */
function cleanReply(text: string, forceGrok: boolean, max = REPLY_MAX_LENGTH, length = tweetLength): string {
  let out = text.trim().replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();
  // The prompt forbids em dashes but models still use them; they read as AI-written.
  out = out.replace(/\s*—\s*/g, ", ");
  if (forceGrok && !/^@grok\b/i.test(out)) out = `@grok ${out}`;
  return fitText(out, max, length);
}

/**
 * Judges whether a tweet is worth replying to and drafts reply options. Used
 * by the Monitor's autopilot for new tweets and by the reply window on demand.
 */
export async function draftReplies(input: DraftRepliesInput): Promise<DraftRepliesResult> {
  const raw = await draftJson(input.provider, DRAFT_SYSTEM, draftPrompt(input), input.autopilot.creativity);
  const { score, reason, replies } = parseDrafts(raw, input.threshold);
  const forceGrok = input.autopilot.style === "grok";
  const options = replies.map((r, i) => cleanReply(r, forceGrok || (input.autopilot.style === "mix" && i === 0)));
  return { score, reason, options };
}

/** Comment replies are kept short wherever the platform allows more. */
const COMMENT_REPLY_MAX = 280;

const COMMENT_SYSTEM = `You help someone answer comments people leave on their own social media posts. For one comment you decide whether it deserves an answer, then draft reply options. They read every draft and choose what gets sent.

Score the comment from 0 to 100 on whether answering it is worthwhile: real questions, thoughtful points, praise and honest criticism score high.
Score low for: spam, scams, bots, link drops, self-promotion, abuse or harassment, and anything matching their avoid notes. Never argue with a troll.
Give a one-line reason naming the angle you'd take (or why to skip).

Reply rules:
- Up to 3 options, each a different angle. Best first.
- ${COMMENT_REPLY_MAX} characters or fewer each.
- Answer as the author of the post, in their voice. Thank people only when it's natural, and never more than briefly.
- Answer questions directly. If you don't know the answer from the post, say they'll follow up rather than inventing one.
- No hashtags, no em dashes, emoji rarely and never more than one. Don't @mention the commenter (it's added where needed).
- Never invent facts, numbers, promises, prices or personal experiences.
If the score is below the threshold you're given, return an empty replies list.`;

export interface DraftCommentInput {
  platform: PlatformId;
  author: string;
  text: string;
  postText: string;
  postedAt: string;
  tone: ReplyTone;
  voiceNotes: string;
  /** Skip below this score. 0 means always draft (a reply the user asked for). */
  threshold: number;
  provider: AiProvider;
}

function commentPrompt(input: DraftCommentInput): string {
  const lines = [`Platform: ${PLATFORMS[input.platform].label}`, `Tone: ${TONE_GUIDE[input.tone]}`];
  if (input.voiceNotes) lines.push(`Their voice notes: ${input.voiceNotes}`);
  lines.push(
    `Threshold: ${input.threshold}`,
    "",
    "Their post:",
    `"""\n${input.postText}\n"""`,
    "",
    `Comment by @${input.author}:`,
    `"""\n${input.text}\n"""`,
  );
  return lines.join("\n");
}

/** Judges whether a comment on the user's post deserves an answer and drafts replies. */
export async function draftCommentReplies(input: DraftCommentInput): Promise<DraftRepliesResult> {
  const raw = await draftJson(input.provider, COMMENT_SYSTEM, commentPrompt(input), 0.7);
  const { score, reason, replies } = parseDrafts(raw, input.threshold);
  const spec = PLATFORMS[input.platform];
  const options = replies.map((r) => cleanReply(r, false, Math.min(spec.maxLength, COMMENT_REPLY_MAX), spec.length));
  return { score, reason, options };
}

const REWRITE_SYSTEM = `You rewrite social posts while preserving their core message.

Hard rules:
- Keep the same topic and core meaning. Do not change what's being said.
- Reword sentences, vary the structure, swap a couple of word choices.
- Stay within roughly 80–120% of the original length.
- Same tone (casual stays casual, formal stays formal).
- No em dashes. No emojis the original doesn't already use.
- Output ONLY the rewritten post — no preamble, no quotes, no labels.`;

export interface RewriteInput {
  text: string;
  provider: AiProvider;
  /** The rewrite must still fit this platform's limit. */
  platform: PlatformId;
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
  const json = await openAiPost<OpenAiChatResponse>("chat/completions", {
    model: OPENAI_MODEL,
    temperature: 0.9,
    max_tokens: 400,
    messages: [
      { role: "system", content: REWRITE_SYSTEM },
      { role: "user", content: `Rewrite this post:\n"""\n${text}\n"""` },
    ],
  });
  return json.choices?.[0]?.message?.content ?? "";
}

export async function rewritePost(input: RewriteInput): Promise<string> {
  const raw =
    input.provider === "openai"
      ? await rewriteViaOpenAI(input.text)
      : await rewriteViaClaude(input.text);
  const spec = PLATFORMS[input.platform];
  const cleaned = raw.trim().replace(/^["']|["']$/g, "").trim().replace(/[ \t]+/g, " ");
  return fitText(cleaned, spec.maxLength, spec.length);
}
