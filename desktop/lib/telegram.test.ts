import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeChat, postToTelegram, verifyTelegram } from "./telegram";

afterEach(() => vi.unstubAllGlobals());

/** A Bot API that answers each method from `results`, recording the calls. */
function mockBot(results: Record<string, unknown>) {
  const calls: { method: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const method = url.split("/").pop()!;
      calls.push({ method, body: init.body instanceof FormData ? Object.fromEntries(init.body) : JSON.parse(String(init.body)) });
      return method in results
        ? Response.json({ ok: true, result: results[method] })
        : Response.json({ ok: false, description: "Bad Request: chat not found" }, { status: 400 });
    }),
  );
  return calls;
}

describe("Telegram", () => {
  it("reads the channel however the user types it", () => {
    for (const input of ["@kyrelo", "kyrelo", "t.me/kyrelo", "https://t.me/kyrelo/12"]) expect(normalizeChat(input)).toBe("@kyrelo");
    expect(normalizeChat("-1001234")).toBe("-1001234");
    expect(normalizeChat("a b")).toBeNull();
  });

  it("connects when the bot can post in the channel", async () => {
    mockBot({
      getMe: { id: 7 },
      getChat: { id: -1001234, type: "channel", title: "Kyrelo news", username: "kyrelo" },
      getChatMember: { status: "administrator", can_post_messages: true },
    });
    expect(await verifyTelegram("tok", "@kyrelo")).toEqual({ chatId: "-1001234", handle: "kyrelo" });
  });

  it("refuses a bot that isn't an admin of the channel", async () => {
    mockBot({ getMe: { id: 7 }, getChat: { id: -1001234, type: "channel", title: "News" }, getChatMember: { status: "member" } });
    await expect(verifyTelegram("tok", "@news")).rejects.toThrow(/admin/);
  });

  it("posts text and links to the message, in a private channel too", async () => {
    mockBot({ sendMessage: { message_id: 42, chat: { id: -1009876, type: "channel" } } });
    expect(await postToTelegram("tok", "-1009876", "hi")).toEqual({ url: "https://t.me/c/9876/42" });
  });

  it("sends long text after the photo, since captions are limited", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kyrelo-tg-"));
    const image = path.join(dir, "0123456789ab.png");
    await writeFile(image, Buffer.alloc(10));
    const message = { message_id: 5, chat: { id: -1001, type: "channel", username: "kyrelo" } };
    const calls = mockBot({ sendPhoto: message, sendMessage: message });
    const long = "x".repeat(1500);
    expect(await postToTelegram("tok", "@kyrelo", long, image)).toEqual({ url: "https://t.me/kyrelo/5" });
    expect(calls.map((c) => c.method)).toEqual(["sendPhoto", "sendMessage"]);
    expect((calls[0].body as Record<string, unknown>).caption).toBeUndefined();
    expect((calls[1].body as { text: string }).text).toBe(long);
  });
});
