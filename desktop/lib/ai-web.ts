import Anthropic from "@anthropic-ai/sdk";
import { OpenAiChatResponse, openAiPost, resolveAnthropicKey } from "./ai";
import { AiProvider } from "./types";

// The two AI calls behind the features that research before they write (auto
// campaigns, the handle finder), each with a Claude and an OpenAI version like
// lib/ai.ts:
//   webResearch     live web search (and page fetches) → written notes + sources
//   jsonCompletion  notes → JSON matching a schema
// They're separate calls because web search answers come with citations,
// which structured JSON output doesn't allow.

// Bigger than lib/ai.ts's model for one-line replies: these do multi-step
// research and write several items.
const CLAUDE_MODEL = "claude-opus-5";
const OPENAI_MODEL = process.env.OPENAI_CAMPAIGN_MODEL ?? "gpt-4.1";

export interface WebResearchInput {
  system: string;
  prompt: string;
  provider: AiProvider;
  /** For error messages: "Claude declined to <task>." */
  task: string;
  maxSearches?: number;
  /** Also let Claude fetch whole pages (the OpenAI version only searches). */
  fetchPages?: boolean;
}

export interface WebResearchResult {
  text: string;
  sources: string[];
}

async function researchViaClaude(input: WebResearchInput): Promise<WebResearchResult> {
  const client = new Anthropic({ apiKey: await resolveAnthropicKey() });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: input.prompt }];
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: input.maxSearches ?? 8 },
  ];
  if (input.fetchPages) tools.push({ type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 });
  const sources = new Set<string>();
  let text = "";

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
        system: input.system,
        tools,
        messages,
      })
      .finalMessage();

    if (msg.stop_reason === "refusal") throw new Error(`Claude declined to ${input.task}.`);
    for (const block of msg.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) sources.add(r.url);
      } else if (block.type === "text") {
        text += block.text;
      }
    }
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }
  return { text, sources: [...sources] };
}

async function researchViaOpenAI(input: WebResearchInput): Promise<WebResearchResult> {
  // Web search runs several searches server-side, so allow longer than usual.
  const json = await openAiPost<{
    output?: {
      type: string;
      content?: { type: string; text?: string; annotations?: { type: string; url?: string }[] }[];
    }[];
  }>(
    "responses",
    { model: OPENAI_MODEL, instructions: input.system, input: input.prompt, tools: [{ type: "web_search" }] },
    5 * 60_000,
  );
  let text = "";
  const sources = new Set<string>();
  for (const item of json.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type !== "output_text") continue;
      text += c.text ?? "";
      for (const a of c.annotations ?? []) if (a.url) sources.add(a.url);
    }
  }
  return { text, sources: [...sources] };
}

export function webResearch(input: WebResearchInput): Promise<WebResearchResult> {
  return input.provider === "openai" ? researchViaOpenAI(input) : researchViaClaude(input);
}

export interface JsonCompletionInput {
  system: string;
  prompt: string;
  /** A JSON schema; strict, so every property is required and extras are banned. */
  schema: object;
  /** The schema's name for OpenAI. */
  name: string;
  provider: AiProvider;
  task: string;
  /** OpenAI only; Claude uses its default with adaptive thinking. */
  temperature?: number;
}

/** The raw JSON text; the caller parses and checks it. */
export async function jsonCompletion(input: JsonCompletionInput): Promise<string> {
  if (input.provider === "openai") {
    const json = await openAiPost<OpenAiChatResponse>("chat/completions", {
      model: OPENAI_MODEL,
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
      response_format: { type: "json_schema", json_schema: { name: input.name, strict: true, schema: input.schema } },
    });
    return json.choices?.[0]?.message?.content ?? "";
  }
  const client = new Anthropic({ apiKey: await resolveAnthropicKey() });
  const msg = await client.beta.messages
    .stream({
      model: CLAUDE_MODEL,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: input.system,
      output_config: { format: { type: "json_schema", schema: input.schema as Record<string, unknown> } },
      messages: [{ role: "user", content: input.prompt }],
    })
    .finalMessage();
  if (msg.stop_reason === "refusal") throw new Error(`Claude declined to ${input.task}.`);
  if (msg.stop_reason === "max_tokens") throw new Error(`Claude ran out of room to ${input.task}.`);
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** The shared model names, for other calls that should match (image captions). */
export const RESEARCH_MODELS = { claude: CLAUDE_MODEL, openai: OPENAI_MODEL };
