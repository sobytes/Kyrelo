import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let web: typeof import("./ai-web");

// storage.ts reads STORAGE_DIR at import time, so point it at a temp dir first.
beforeAll(async () => {
  process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), "kyrelo-ai-web-"));
  process.env.OPENAI_API_KEY = "test-key";
  web = await import("./ai-web");
});

afterEach(() => vi.unstubAllGlobals());

describe("webResearch", () => {
  it("reuses research for the same question instead of searching again", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        output: [{ type: "message", content: [{ type: "output_text", text: "Notes", annotations: [{ type: "url_citation", url: "https://a.com" }] }] }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const input = { system: "s", prompt: "Research Kyrelo", provider: "openai" as const, task: "research" };
    expect(await web.webResearch(input)).toEqual({ text: "Notes", sources: ["https://a.com"] });
    expect(await web.webResearch(input)).toEqual({ text: "Notes", sources: ["https://a.com"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A different question searches.
    await web.webResearch({ ...input, prompt: "Research something else" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
