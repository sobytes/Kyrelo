import { promises as fs } from "node:fs";
import path from "node:path";
import { imageTypeForFilename, videoTypeForFilename } from "./uploads";

// Discord through a channel webhook (Channel settings → Integrations →
// Webhooks → New webhook → Copy URL). No bot or app needed. The webhook URL
// is a secret: anyone with it can post to the channel.

const TIMEOUT_MS = 30_000;
const WEBHOOK_RE = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/(\d+)\/[\w-]+$/;

export function isWebhookUrl(url: string): boolean {
  return WEBHOOK_RE.test(url.trim());
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(`Discord: ${json.message ?? `HTTP ${res.status}`}`);
  return json;
}

/** The webhook's name, and the server it posts to (for message links). */
export async function verifyDiscordWebhook(url: string): Promise<{ id: string; name: string; guild_id?: string; channel_id: string }> {
  if (!isWebhookUrl(url)) throw new Error("That isn't a Discord webhook link. Copy it from the channel's Integrations → Webhooks.");
  return api(url.trim());
}

/**
 * Posts `text` (and an optional image or video file) and returns the message's link.
 * Mentions are switched off, so a post can't ping @everyone by accident.
 */
export async function postToDiscord(webhookUrl: string, guildId: string | undefined, text: string, filePath?: string): Promise<{ url: string }> {
  const payload = { content: text, allowed_mentions: { parse: [] } };
  let init: RequestInit;
  if (filePath) {
    const data = await fs.readFile(filePath);
    const form = new FormData();
    form.append("payload_json", JSON.stringify(payload));
    const name = path.basename(filePath);
    const type = imageTypeForFilename(name) ?? videoTypeForFilename(name) ?? "application/octet-stream";
    form.append("files[0]", new Blob([new Uint8Array(data)], { type }), name);
    init = { method: "POST", body: form };
  } else {
    init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
  }
  // wait=true makes Discord return the message, for its link.
  const message = await api<{ id: string; channel_id: string }>(`${webhookUrl}?wait=true`, init);
  return { url: guildId ? `https://discord.com/channels/${guildId}/${message.channel_id}/${message.id}` : "https://discord.com/app" };
}
