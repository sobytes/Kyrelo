import { afterEach, describe, expect, it, vi } from "vitest";
import { isWebhookUrl, postToDiscord, verifyDiscordWebhook } from "./discord";

afterEach(() => vi.unstubAllGlobals());

const HOOK = "https://discord.com/api/webhooks/123/abc-DEF_9";

describe("Discord", () => {
  it("only accepts Discord webhook links", async () => {
    expect(isWebhookUrl(HOOK)).toBe(true);
    expect(isWebhookUrl("https://canary.discord.com/api/webhooks/123/abc")).toBe(true);
    expect(isWebhookUrl("https://evil.example/api/webhooks/123/abc")).toBe(false);
    await expect(verifyDiscordWebhook("https://example.com")).rejects.toThrow(/webhook link/);
  });

  it("posts without pings and links to the message", async () => {
    const seen: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        seen.push({ url, body: JSON.parse(String(init.body)) });
        return Response.json({ id: "m1", channel_id: "c1" });
      }),
    );
    expect(await postToDiscord(HOOK, "g1", "hello @everyone")).toEqual({ url: "https://discord.com/channels/g1/c1/m1" });
    expect(seen[0].url).toBe(`${HOOK}?wait=true`);
    expect(seen[0].body).toEqual({ content: "hello @everyone", allowed_mentions: { parse: [] } });
  });
});
