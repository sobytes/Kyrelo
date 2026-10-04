import { promises as fs } from "node:fs";
import path from "node:path";
import { imageTypeForFilename } from "./uploads";

// Telegram through the Bot API: the user makes a bot with @BotFather, adds it
// to their channel (or group) as an admin that can post, and gives Kyrelo the
// bot's token and the channel. Free, official, and no app review.

const API = "https://api.telegram.org";
const TIMEOUT_MS = 30_000;
/** A photo's caption is limited to this; longer text goes in its own message after the photo. */
const CAPTION_MAX = 1024;

interface Chat {
  id: number;
  type: "channel" | "group" | "supergroup" | "private";
  title?: string;
  username?: string;
}

async function call<T>(token: string, method: string, body: object | FormData): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Telegram: ${json.description ?? `HTTP ${res.status}`}`);
  return json.result as T;
}

/** "@kyrelo", "kyrelo", "t.me/kyrelo" or "https://t.me/kyrelo" → "@kyrelo"; a numeric chat id stays as it is. */
export function normalizeChat(input: string): string | null {
  const s = input.trim().replace(/^https?:\/\//i, "").replace(/^t\.me\//i, "").replace(/^@/, "").replace(/\/.*$/, "");
  if (/^-?\d+$/.test(s)) return s;
  return /^[A-Za-z]\w{3,}$/.test(s) ? `@${s}` : null;
}

/**
 * Checks the bot token and that the bot can post in the chat. Returns the
 * chat's id and how to show it.
 */
export async function verifyTelegram(token: string, chatInput: string): Promise<{ chatId: string; handle: string }> {
  const chat = normalizeChat(chatInput);
  if (!chat) throw new Error("Enter your channel as @name, or its numeric id.");
  const me = await call<{ id: number }>(token, "getMe", {});
  const info = await call<Chat>(token, "getChat", { chat_id: chat });
  const member = await call<{ status: string; can_post_messages?: boolean }>(token, "getChatMember", { chat_id: chat, user_id: me.id });
  const canPost =
    info.type === "channel"
      ? member.status === "creator" || (member.status === "administrator" && member.can_post_messages !== false)
      : member.status !== "left" && member.status !== "kicked";
  if (!canPost) throw new Error("Telegram: make the bot an admin of the channel that can post messages, then try again.");
  return { chatId: String(info.id), handle: info.username ?? info.title ?? String(info.id) };
}

function messageUrl(chat: Chat, messageId: number): string {
  // Private channels have no @name; their links use the id without -100.
  return chat.username ? `https://t.me/${chat.username}/${messageId}` : `https://t.me/c/${String(chat.id).replace(/^-100/, "")}/${messageId}`;
}

/** Posts `text` (and an optional photo) and returns the message's link. */
export async function postToTelegram(token: string, chatId: string, text: string, imagePath?: string): Promise<{ url: string }> {
  if (!imagePath) {
    const sent = await call<{ message_id: number; chat: Chat }>(token, "sendMessage", { chat_id: chatId, text });
    return { url: messageUrl(sent.chat, sent.message_id) };
  }
  const data = await fs.readFile(imagePath);
  const form = new FormData();
  form.append("chat_id", chatId);
  const fitsCaption = text.length <= CAPTION_MAX;
  if (fitsCaption) form.append("caption", text);
  const type = imageTypeForFilename(path.basename(imagePath)) ?? "image/png";
  form.append("photo", new Blob([new Uint8Array(data)], { type }), path.basename(imagePath));
  const photo = await call<{ message_id: number; chat: Chat }>(token, "sendPhoto", form);
  if (!fitsCaption) await call(token, "sendMessage", { chat_id: chatId, text });
  return { url: messageUrl(photo.chat, photo.message_id) };
}
