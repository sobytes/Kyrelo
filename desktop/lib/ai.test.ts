import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { draftReplies, DraftRepliesInput } from "./ai";
import { tweetLength } from "./tweet";

// The OpenAI path, with the API mocked to return a fixed model answer.
function modelReturns(answer: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }), { status: 200 }),
    ),
  );
}

const base: DraftRepliesInput = {
  tweet: { handle: "sama", text: "We just shipped a new model.", isReply: false, postedAt: new Date().toISOString() },
  autopilot: {
    enabled: true,
    tone: "curious",
    style: "direct",
    minScore: 60,
    creativity: 0.7,
    topics: "AI",
    avoid: "",
  },
  voiceNotes: "",
  threshold: 60,
  provider: "openai",
};

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
});
afterEach(() => vi.unstubAllGlobals());

describe("draftReplies", () => {
  it("returns the score, reason and cleaned-up options", async () => {
    modelReturns({ score: 82, reason: "Ask about evals", replies: ['"What eval surprised you most?"', "Two"] });
    expect(await draftReplies(base)).toEqual({
      score: 82,
      reason: "Ask about evals",
      options: ["What eval surprised you most?", "Two"],
    });
  });

  it("drops the replies when the score is under the threshold", async () => {
    modelReturns({ score: 40, reason: "Announcement, nothing to add", replies: ["meh"] });
    const r = await draftReplies(base);
    expect(r.options).toEqual([]);
    expect(r.reason).toMatch(/nothing to add/);
  });

  it("threshold 0 always drafts (the user asked)", async () => {
    modelReturns({ score: 10, reason: "low", replies: ["still one"] });
    expect((await draftReplies({ ...base, threshold: 0 })).options).toEqual(["still one"]);
  });

  it('makes every option tag @grok in "grok" style, and only the first in "mix"', async () => {
    modelReturns({ score: 90, reason: "r", replies: ["why now?", "@grok how?", "nice"] });
    expect((await draftReplies({ ...base, autopilot: { ...base.autopilot, style: "grok" } })).options).toEqual([
      "@grok why now?",
      "@grok how?",
      "@grok nice",
    ]);
    modelReturns({ score: 90, reason: "r", replies: ["why now?", "direct one"] });
    expect((await draftReplies({ ...base, autopilot: { ...base.autopilot, style: "mix" } })).options).toEqual([
      "@grok why now?",
      "direct one",
    ]);
  });

  it("replaces em dashes, which the model uses despite the prompt", async () => {
    modelReturns({ score: 90, reason: "r", replies: ["a blunder — or smart?"] });
    expect((await draftReplies(base)).options).toEqual(["a blunder, or smart?"]);
  });

  it("keeps options within the reply limit and at most three", async () => {
    modelReturns({ score: 90, reason: "r", replies: ["word ".repeat(100), "b", "c", "d"] });
    const { options } = await draftReplies(base);
    expect(options).toHaveLength(3);
    expect(tweetLength(options[0])).toBeLessThanOrEqual(270);
  });

  it("sends the creativity setting as the temperature", async () => {
    modelReturns({ score: 90, reason: "r", replies: ["x"] });
    await draftReplies({ ...base, autopilot: { ...base.autopilot, creativity: 0.2 } });
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.temperature).toBe(0.2);
  });
});
