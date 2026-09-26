import Anthropic from "@anthropic-ai/sdk";
import { resolveAnthropicKey, resolveOpenAiKey } from "./ai";
import { AiProvider, CampaignMediaKind, MediaItem } from "./types";

// Research + writing for Auto Campaigns. Two stages, each with a Claude and an
// OpenAI implementation, matching lib/ai.ts:
//   1. research — live web search/fetch over the user's site, competitors and
//      the niche, returned as a written brief plus source URLs.
//   2. write    — N tweets on distinct angles, each with a media decision, as
//      schema-validated JSON.

const CLAUDE_MODEL = "claude-opus-5";
const OPENAI_MODEL = process.env.OPENAI_CAMPAIGN_MODEL ?? "gpt-4.1";

export interface ResearchInput {
  brief: string;
  url: string;
  competitors: string;
  provider: AiProvider;
}

export interface ResearchResult {
  notes: string;
  sources: string[];
  youtube: string[];
}

export interface WriteInput {
  brief: string;
  url: string;
  competitors: string;
  research: ResearchResult;
  count: number;
  windowMinutes: number;
  library: MediaItem[];
  allowAiImages: boolean;
  provider: AiProvider;
}

export interface WrittenDraft {
  angle: string;
  text: string;
  media: {
    kind: CampaignMediaKind;
    libraryId: string;
    youtubeUrl: string;
    imagePrompt: string;
    screenshotUrl: string;
  };
  sources: string[];
}

const RESEARCH_SYSTEM = `You are the research lead on a small marketing team preparing a burst of posts on X (Twitter) for a product.

Work like a marketer would before writing anything:
1. Read the product's own site (fetch the URL you are given) — what it is, who it's for, key features, pricing, proof points.
2. Look up each named competitor — positioning, pricing, what users praise and complain about. If no competitors are named, find the 2–3 most obvious ones.
3. Search for what the target audience is currently talking about: pain points, recent news, trends, debates.
4. Find 1–3 relevant YouTube videos (demos, reviews, explainers) that could be linked from a post. Prefer the product's own videos.

Then write a concise research brief in Markdown with these sections:
## Product
## Audience & pain points
## Competitors (only facts you actually found, each with its source URL)
## Timely hooks
## YouTube (bare URLs, one per line, or "none")

Never invent facts, numbers, pricing or quotes. If something couldn't be verified, leave it out.`;

function researchPrompt(input: ResearchInput): string {
  return (
    `Product URL: ${input.url || "(none given)"}\n` +
    `Competitors: ${input.competitors || "(none given — find the obvious ones)"}\n\n` +
    `Brief from the founder:\n"""\n${input.brief}\n"""`
  );
}

const YOUTUBE_RE = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]{6,}|youtu\.be\/[\w-]{6,})/g;

function extractYoutube(text: string, urls: string[]): string[] {
  const found = [...text.matchAll(YOUTUBE_RE), ...urls.flatMap((u) => [...u.matchAll(YOUTUBE_RE)])];
  return Array.from(new Set(found.map((m) => m[0]))).slice(0, 5);
}

async function researchViaClaude(input: ResearchInput): Promise<ResearchResult> {
  const client = new Anthropic({ apiKey: await resolveAnthropicKey() });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: researchPrompt(input) },
  ];
  const sources = new Set<string>();
  let notes = "";

  // Server tools can pause a long turn (stop_reason "pause_turn"); re-send the
  // paused assistant turn to let Claude continue.
  for (let i = 0; i < 5; i++) {
    const msg = await client.beta.messages
      .stream({
        model: CLAUDE_MODEL,
        max_tokens: 32000,
        thinking: { type: "adaptive" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: RESEARCH_SYSTEM,
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 8 },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
        ],
        messages,
      })
      .finalMessage();

    if (msg.stop_reason === "refusal") {
      throw new Error("Claude declined to research this brief.");
    }
    for (const block of msg.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) sources.add(r.url);
      } else if (block.type === "text") {
        notes += block.text;
      }
    }
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }

  if (!notes.trim()) throw new Error("Research came back empty.");
  return { notes, sources: [...sources], youtube: extractYoutube(notes, [...sources]) };
}

async function researchViaOpenAI(input: ResearchInput): Promise<ResearchResult> {
  const apiKey = await resolveOpenAiKey();
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: RESEARCH_SYSTEM,
      input: researchPrompt(input),
      tools: [{ type: "web_search" }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    output?: {
      type: string;
      content?: { type: string; text?: string; annotations?: { type: string; url?: string }[] }[];
    }[];
  };
  let notes = "";
  const sources = new Set<string>();
  for (const item of json.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type !== "output_text") continue;
      notes += c.text ?? "";
      for (const a of c.annotations ?? []) if (a.url) sources.add(a.url);
    }
  }
  if (!notes.trim()) throw new Error("Research came back empty.");
  return { notes, sources: [...sources], youtube: extractYoutube(notes, [...sources]) };
}

export function researchCampaign(input: ResearchInput): Promise<ResearchResult> {
  return input.provider === "openai" ? researchViaOpenAI(input) : researchViaClaude(input);
}

const MEDIA_KINDS: CampaignMediaKind[] = ["none", "library", "og", "screenshot", "ai", "youtube"];

const DRAFTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["drafts"],
  properties: {
    drafts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["angle", "text", "media", "sources"],
        properties: {
          angle: { type: "string" },
          text: { type: "string" },
          media: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "libraryId", "youtubeUrl", "imagePrompt", "screenshotUrl"],
            properties: {
              kind: { type: "string", enum: MEDIA_KINDS },
              libraryId: { type: "string" },
              youtubeUrl: { type: "string" },
              imagePrompt: { type: "string" },
              screenshotUrl: { type: "string" },
            },
          },
          sources: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const WRITE_SYSTEM = `You are the copywriter on a small marketing team. Using the research brief, write a burst of posts for X (Twitter) promoting the product.

Angles: give every post a DIFFERENT angle from this set — pain point, feature highlight, comparison with a competitor, practical tip / how-to, question to the audience, social proof, timely hook. Name the angle in "angle".

Writing rules:
- Each post must be 270 characters or fewer (a URL counts as 23 characters).
- Vary openings, sentence structure and length. Posts must not read like templates of each other.
- Sound like a founder talking, not an ad. No em dashes. At most one hashtag per post, usually none. At most one emoji per post, usually none.
- Include the product URL in roughly half of the posts, not all of them.
- Competitor comparisons are allowed, at most one per burst. State only facts that appear in the research brief, keep it fair and factual, never mock or disparage. Put the supporting source URL(s) in "sources".
- Never invent statistics, pricing, customer names or quotes.

Media: decide per post; roughly half the posts should carry media, the rest none. Options:
- "library": an image the user uploaded — set libraryId to its id. Prefer these when one genuinely fits the post.
- "og": the product site's own social preview image.
- "screenshot": a screenshot of a page — set screenshotUrl (usually the product URL or one of its pages).
- "ai": an AI-generated illustration — set imagePrompt (describe a clean, on-brand image; no text in the image). Only when allowed.
- "youtube": link a video from the research — set youtubeUrl to one of the listed YouTube URLs. The link is appended to the post, so leave room for 23 characters.
- "none".
Leave unused media fields as empty strings.`;

function writePrompt(input: WriteInput): string {
  const library =
    input.library.length === 0
      ? "(none uploaded)"
      : input.library.map((m) => `- id=${m.id}: ${m.description || "(no description)"}`).join("\n");
  const youtube = input.research.youtube.length ? input.research.youtube.join("\n") : "(none)";
  return (
    `Write exactly ${input.count} posts. They'll go out over the next ${formatWindow(input.windowMinutes)}.\n\n` +
    `Product URL: ${input.url || "(none)"}\n` +
    `Competitors: ${input.competitors || "(see research)"}\n\n` +
    `Founder's brief:\n"""\n${input.brief}\n"""\n\n` +
    `Research brief:\n"""\n${input.research.notes}\n"""\n\n` +
    `Uploaded images you may use:\n${library}\n\n` +
    `YouTube videos found:\n${youtube}\n\n` +
    `AI-generated images allowed: ${input.allowAiImages ? "yes" : "no"}`
  );
}

function formatWindow(minutes: number): string {
  if (minutes < 120) return `${minutes} minutes`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} hours`;
  return `${Math.round(minutes / 1440)} days`;
}

async function writeViaClaude(input: WriteInput): Promise<string> {
  const client = new Anthropic({ apiKey: await resolveAnthropicKey() });
  const msg = await client.beta.messages
    .stream({
      model: CLAUDE_MODEL,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: WRITE_SYSTEM,
      output_config: { format: { type: "json_schema", schema: DRAFTS_SCHEMA } },
      messages: [{ role: "user", content: writePrompt(input) }],
    })
    .finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("Claude declined to write these posts.");
  if (msg.stop_reason === "max_tokens") throw new Error("Claude ran out of room writing the posts.");
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function writeViaOpenAI(input: WriteInput): Promise<string> {
  const apiKey = await resolveOpenAiKey();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.9,
      messages: [
        { role: "system", content: WRITE_SYSTEM },
        { role: "user", content: writePrompt(input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "campaign_drafts", strict: true, schema: DRAFTS_SCHEMA },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

export async function writeCampaignDrafts(input: WriteInput): Promise<WrittenDraft[]> {
  const raw = input.provider === "openai" ? await writeViaOpenAI(input) : await writeViaClaude(input);
  let parsed: { drafts?: WrittenDraft[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The AI returned posts in an unreadable format. Try again.");
  }
  const drafts = (parsed.drafts ?? []).filter((d) => d.text?.trim());
  if (drafts.length === 0) throw new Error("The AI didn't return any posts.");
  return drafts.slice(0, input.count);
}

// ---- Media library auto-captions ------------------------------------------

const DESCRIBE_PROMPT =
  "Describe this image in one sentence for a marketer choosing which social post it fits: what it shows, the mood, and any visible product or text. Output only the sentence.";

export async function describeImage(
  data: Buffer,
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp",
  provider: AiProvider,
): Promise<string> {
  const b64 = data.toString("base64");
  if (provider === "openai") {
    const apiKey = await resolveOpenAiKey();
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mediaType};base64,${b64}` } },
              { type: "text", text: DESCRIBE_PROMPT },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return (json.choices?.[0]?.message?.content ?? "").trim();
  }
  const client = new Anthropic({ apiKey: await resolveAnthropicKey() });
  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
          { type: "text", text: DESCRIBE_PROMPT },
        ],
      },
    ],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
