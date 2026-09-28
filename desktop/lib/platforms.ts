// The rules each platform imposes on a post, shared by the UI (character
// counters, which accounts can do what) and the server (validation). Keep this
// file free of Node imports so client components can use it.

import { tweetLength } from "./tweet";
import { PlatformId } from "./types";

export interface PlatformSpec {
  id: PlatformId;
  /** Name shown in the UI. */
  label: string;
  /** Longest post the platform accepts, measured with `length`. */
  maxLength: number;
  /** Post length as this platform counts it. */
  length: (text: string) => number;
  /** How an account is connected: logging in through Chrome, or an app password. */
  connect: "browser" | "app-password";
  /** Where to log in (browser platforms) or create an app password. */
  loginUrl: string;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export const PLATFORMS: Record<PlatformId, PlatformSpec> = {
  twitter: {
    id: "twitter",
    label: "X",
    // X Premium allows long posts; other accounts are rejected by X at send
    // time. Auto campaigns write to the standard 280 (lib/tweet.ts).
    maxLength: 4000,
    length: tweetLength,
    connect: "browser",
    loginUrl: "https://x.com/login",
  },
  bluesky: {
    id: "bluesky",
    label: "Bluesky",
    // Bluesky counts user-perceived characters, and links count in full.
    maxLength: 300,
    length: (text) => Array.from(graphemes.segment(text)).length,
    connect: "app-password",
    loginUrl: "https://bsky.app/settings/app-passwords",
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    maxLength: 3000,
    length: (text) => text.length,
    connect: "browser",
    loginUrl: "https://www.linkedin.com/login",
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[];

export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === "string" && value in PLATFORMS;
}

/**
 * Shortens `text` until `length(text)` fits `max`, dropping whole words from
 * the end (never URLs) and marking the cut with "…".
 */
export function fitText(text: string, max: number, length: (t: string) => number): string {
  if (length(text) <= max) return text;
  const words = text.split(/(\s+)/);
  for (let i = words.length - 1; i >= 0 && length(words.join("") + "…") > max; i--) {
    if (!/^https?:\/\//.test(words[i])) words.splice(i, 1);
  }
  return words.join("").trimEnd() + "…";
}

/** Why `text` can't be posted on `platform`, or null if it can. */
export function postTextError(platform: PlatformId, text: string): string | null {
  const spec = PLATFORMS[platform];
  if (!text.trim()) return "text can't be empty";
  if (spec.length(text) > spec.maxLength) return `too long for ${spec.label} (max ${spec.maxLength} characters)`;
  return null;
}
