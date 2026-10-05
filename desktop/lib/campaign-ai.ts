import Anthropic from "@anthropic-ai/sdk";
import { OpenAiChatResponse, openAiPost, resolveAnthropicKey } from "./ai";
import { jsonCompletion, RESEARCH_MODELS, webResearch } from "./ai-web";
import { findRepeat } from "./originality";
import { PLATFORMS } from "./platforms";
import { AiProvider, CampaignMediaKind, CampaignTarget, MediaItem } from "./types";

// Research + writing for Auto Campaigns, on the shared calls in lib/ai-web.ts:
//   1. research — live web search/fetch over the user's site, competitors and
//      the niche, returned as a written brief plus source URLs.
//   2. write    — N tweets on distinct angles, each with a media decision, as
//      schema-validated JSON.

const CLAUDE_MODEL = RESEARCH_MODELS.claude;
const OPENAI_MODEL = RESEARCH_MODELS.openai;

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
  /** Where the posts go. */
  targets: CampaignTarget[];
  /** Longest post, in the strictest of the targets' counts. */
  maxLength: number;
  library: MediaItem[];
  /** Posts already written or sent for these accounts, newest first: the new ones mustn't repeat them. */
  history?: string[];
  /** The user picked a bucket for this campaign, rather than leaving the whole library. */
  libraryChosen?: boolean;
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

const RESEARCH_SYSTEM = `You are the research lead on a small marketing team preparing a burst of social media posts for a product.

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

export async function researchCampaign(input: ResearchInput): Promise<ResearchResult> {
  const { text, sources } = await webResearch({
    system: RESEARCH_SYSTEM,
    prompt: researchPrompt(input),
    provider: input.provider,
    task: "research this brief",
    fetchPages: true,
  });
  if (!text.trim()) throw new Error("Research came back empty.");
  return { notes: text, sources, youtube: extractYoutube(text, sources) };
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

const WRITE_SYSTEM = `You are the copywriter on a small marketing team. Using the research brief, write a burst of social media posts promoting the product. Each post goes out as written on every platform you're told about, so it must read naturally on all of them.

Angles: give every post a DIFFERENT angle from this set — pain point, feature highlight, comparison with a competitor, practical tip / how-to, question to the audience, social proof, timely hook. Name the angle in "angle".

Writing rules:
- Keep each post within the length you're given (the prompt says how links count).
- Vary openings, sentence structure and length. Posts must not read like templates of each other.
- You're given posts already written or sent for these accounts. Every new post must read as new to someone who saw those: never reuse their hooks, openings, phrases, structure or examples. Find angles they haven't used, or say a used angle in a completely different way.
- Sound like a founder talking, not an ad. No em dashes. At most one hashtag per post, usually none. At most one emoji per post, usually none.
- Include the product URL in roughly half of the posts, not all of them.
- Competitor comparisons are allowed, at most one per burst. State only facts that appear in the research brief, keep it fair and factual, never mock or disparage. Put the supporting source URL(s) in "sources".
- Never invent statistics, pricing, customer names or quotes.

Media: decide per post; roughly half the posts should carry media, the rest none, unless the prompt says every post needs an image. Options:
- "library": an image or video the user uploaded — set libraryId to its id. Prefer these when one genuinely fits the post, and use a different one for each post where you can. A video only reaches the platforms that take videos; the others get the post without it.
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
      : input.library
          .map((m) => `- id=${m.id}${m.kind === "video" ? " (video)" : ""}: ${m.description || "(no description)"}`)
          .join("\n");
  const youtube = input.research.youtube.length ? input.research.youtube.join("\n") : "(none)";
  return (
    `Write exactly ${input.count} posts. They'll go out over the next ${formatWindow(input.windowMinutes)}, ` +
    `each on ${platformList(input.targets)}.\n` +
    `Each post must be ${input.maxLength - 10} characters or fewer. ${linkRule(input.targets)}\n` +
    `${imageRule(input.targets)}\n\n` +
    `Product URL: ${input.url || "(none)"}\n` +
    `Competitors: ${input.competitors || "(see research)"}\n\n` +
    `Founder's brief:\n"""\n${input.brief}\n"""\n\n` +
    `Research brief:\n"""\n${input.research.notes}\n"""\n\n` +
    `${input.library.length && input.libraryChosen ? "Media the user picked for this campaign (use these for most posts that carry media)" : "Uploaded images and videos you may use"}:\n${library}\n\n` +
    `YouTube videos found:\n${youtube}\n\n` +
    `AI-generated images allowed: ${input.allowAiImages ? "yes" : "no"}` +
    historyBlock(input.history)
  );
}

/** Earlier posts, each on one line, newest first: what the new ones must not repeat. */
function historyBlock(history: string[] = []): string {
  if (history.length === 0) return "";
  const lines = history.map((t) => `- ${t.replace(/\s+/g, " ").slice(0, 280)}`).join("\n");
  return `\n\nPosts already written or sent for these accounts (newest first). Don't repeat any of their hooks, openings, phrasing or examples:\n${lines}`;
}

function platformList(targets: CampaignTarget[]): string {
  const labels = [...new Set(targets.map((t) => PLATFORMS[t.platform].label))];
  return labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

/** X and Mastodon count every link as 23 characters; the others count it in full. */
function linkRule(targets: CampaignTarget[]): string {
  const full = targets.some((t) => t.platform !== "twitter" && t.platform !== "mastodon");
  return full ? "Links count at their full length, so keep them short." : "A link counts as 23 characters.";
}

/** Instagram only takes posts with an image: ask for one on every post. */
function imageRule(targets: CampaignTarget[]): string {
  const needs = [...new Set(targets.filter((t) => PLATFORMS[t.platform].requiresImage).map((t) => PLATFORMS[t.platform].label))];
  if (needs.length === 0) return "";
  return `${needs.join(" and ")} only takes posts with an image, so give EVERY post an image (library, og, screenshot or ai), never youtube or none.`;
}

function formatWindow(minutes: number): string {
  if (minutes < 120) return `${minutes} minutes`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} hours`;
  return `${Math.round(minutes / 1440)} days`;
}

export async function writeCampaignDrafts(input: WriteInput): Promise<WrittenDraft[]> {
  const raw = await jsonCompletion({
    system: WRITE_SYSTEM,
    prompt: writePrompt(input),
    schema: DRAFTS_SCHEMA,
    name: "campaign_drafts",
    provider: input.provider,
    task: "write these posts",
    temperature: 0.9,
  });
  let parsed: { drafts?: WrittenDraft[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The AI returned posts in an unreadable format. Try again.");
  }
  const drafts = (parsed.drafts ?? []).filter((d) => d.text?.trim()).slice(0, input.count);
  if (drafts.length === 0) throw new Error("The AI didn't return any posts.");
  return replaceRepeats(input, drafts);
}

/** The drafts that repeat the history or an earlier draft in the batch, by index. */
export function repeatedDrafts(drafts: WrittenDraft[], history: string[]): number[] {
  return drafts.flatMap((d, i) => (findRepeat(d.text, history, drafts.slice(0, i).map((x) => x.text)) ? [i] : []));
}

/**
 * AI writers fall back on the same hooks, so drafts that read like an
 * earlier post (or another draft) are sent back once for replacements on
 * fresh angles. Any that still repeat are dropped: fewer posts beat reruns.
 */
async function replaceRepeats(input: WriteInput, drafts: WrittenDraft[]): Promise<WrittenDraft[]> {
  const history = input.history ?? [];
  const repeats = repeatedDrafts(drafts, history);
  if (repeats.length === 0) return drafts;
  console.log(`[campaign] ${repeats.length} draft(s) repeat earlier posts; asking for replacements`);
  const kept = drafts.filter((_, i) => !repeats.includes(i));
  const raw = await jsonCompletion({
    system: WRITE_SYSTEM,
    prompt:
      writePrompt({ ...input, count: repeats.length }) +
      `\n\nThese drafts read too much like posts already written, so write ${repeats.length} replacement(s) instead, ` +
      `each on an angle and opening none of the history or the posts below use:\n` +
      [...kept, ...repeats.map((i) => drafts[i])].map((d) => `- ${d.text.replace(/\s+/g, " ")}`).join("\n"),
    schema: DRAFTS_SCHEMA,
    name: "campaign_drafts",
    provider: input.provider,
    task: "rewrite repeated posts",
    temperature: 1,
  }).catch(() => null);
  let replacements: WrittenDraft[] = [];
  try {
    replacements = raw ? ((JSON.parse(raw) as { drafts?: WrittenDraft[] }).drafts ?? []).filter((d) => d.text?.trim()) : [];
  } catch {
    // unreadable: the repeats are just dropped
  }
  const out = [...kept];
  for (const r of replacements.slice(0, repeats.length)) {
    if (!findRepeat(r.text, history, out.map((d) => d.text))) out.push(r);
  }
  if (out.length === 0) throw new Error("Every post the AI wrote repeated an earlier one. Try a different brief, or start again.");
  return out;
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
    const json = await openAiPost<OpenAiChatResponse>("chat/completions", {
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
    });
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
