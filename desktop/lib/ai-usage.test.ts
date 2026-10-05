import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let usage: typeof import("./ai-usage");

// storage.ts reads STORAGE_DIR at import time, so point it at a temp dir first.
beforeAll(async () => {
  process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), "kyrelo-ai-usage-"));
  usage = await import("./ai-usage");
});

describe("daily background draft limit", () => {
  it("counts drafts until the limit, then refuses without counting", async () => {
    await usage.setDailyDraftLimit(2);
    expect(await usage.takeBackgroundDraft()).toBe(true);
    expect(await usage.takeBackgroundDraft()).toBe(true);
    expect(await usage.takeBackgroundDraft()).toBe(false);
    expect(await usage.aiUsageToday()).toEqual({ drafts: 2, dailyDraftLimit: 2 });
  });

  it("starts again on a new day", async () => {
    const { modifyAiUsage } = await import("./storage");
    await modifyAiUsage((u) => ({ ...u, day: "2000-01-01" }));
    expect(await usage.aiUsageToday()).toEqual({ drafts: 0, dailyDraftLimit: 2 });
    expect(await usage.takeBackgroundDraft()).toBe(true);
  });
});
