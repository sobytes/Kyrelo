// The rules each platform imposes on a post, shared by the UI (character
// counters, which accounts can do what) and the server (validation). Keep this
// file free of Node imports so client components can use it.

import { MAX_TWEET_LENGTH, tweetLength } from "./tweet";
import { PlatformId } from "./types";

export interface PlatformSpec {
  id: PlatformId;
  /** Name shown in the UI. */
  label: string;
  /** Longest post the platform accepts, measured with `length`. */
  maxLength: number;
  /** Post length as this platform counts it. */
  length: (text: string) => number;
  /**
   * Largest image file the platform accepts on a post. 0: Kyrelo can't post
   * images there (Threads' API only takes images from a public web address).
   */
  maxImageBytes: number;
  /**
   * The longest post an auto campaign writes here: short enough to read as a
   * social post, even where the platform allows far more (Facebook).
   */
  campaignLimit: number;
  /** Every post needs an image (Instagram): text-only posts can't go there. */
  requiresImage: boolean;
  /** The image files it takes, by extension, if not all of Kyrelo's (png, jpg, gif, webp). */
  imageTypes?: string[];
  /**
   * How an account is connected: logging in through Chrome, credentials the
   * user pastes, or approving Kyrelo on the platform's own page (OAuth).
   */
  connect: "browser" | "credentials" | "oauth";
  /** Where to log in (browser platforms) or create the credentials. */
  loginUrl: string;
  /** Where to make an account, for someone who doesn't have one yet. */
  signupUrl: string;
  /** The fields a credentials connect asks for, with where to get them. */
  credentials?: CredentialField[];
}

export interface CredentialField {
  key: "handle" | "appPassword" | "token";
  label: string;
  placeholder: string;
  secret?: boolean;
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
    maxImageBytes: 5 * 1024 * 1024,
    campaignLimit: MAX_TWEET_LENGTH,
    requiresImage: false,
    connect: "browser",
    loginUrl: "https://x.com/login",
    signupUrl: "https://x.com/i/flow/signup",
  },
  bluesky: {
    id: "bluesky",
    label: "Bluesky",
    // Bluesky counts user-perceived characters, and links count in full.
    maxLength: 300,
    length: (text) => Array.from(graphemes.segment(text)).length,
    // Bluesky rejects image blobs over ~1 MB.
    maxImageBytes: 1_000_000,
    campaignLimit: 300,
    requiresImage: false,
    connect: "credentials",
    loginUrl: "https://bsky.app/settings/app-passwords",
    signupUrl: "https://bsky.app/",
    credentials: [
      { key: "handle", label: "Handle", placeholder: "yourname.bsky.social" },
      { key: "appPassword", label: "App password", placeholder: "xxxx-xxxx-xxxx-xxxx", secret: true },
    ],
  },
  mastodon: {
    id: "mastodon",
    label: "Mastodon",
    // Mastodon's default. Every link counts as 23 characters, like X, and a
    // mention of someone on another server counts only the @username.
    maxLength: 500,
    length: mastodonLength,
    // Kyrelo's own upload limit (lib/uploads.ts); every Mastodon server takes
    // at least 8 MB.
    maxImageBytes: 5 * 1024 * 1024,
    campaignLimit: 500,
    requiresImage: false,
    // Type the server, approve Kyrelo there (startMastodonConnect).
    connect: "oauth",
    loginUrl: "https://joinmastodon.org/servers",
    signupUrl: "https://joinmastodon.org/servers",
  },
  threads: {
    id: "threads",
    label: "Threads",
    maxLength: 500,
    length: (text) => Array.from(graphemes.segment(text)).length,
    maxImageBytes: 0,
    campaignLimit: 500,
    requiresImage: false,
    connect: "credentials",
    loginUrl: "https://developers.facebook.com/docs/threads/get-started",
    signupUrl: "https://www.threads.com/login",
    credentials: [{ key: "token", label: "Access token", placeholder: "Your Threads access token", secret: true }],
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    // The caption limit. Links count in full and aren't clickable in captions.
    maxLength: 2200,
    length: (text) => Array.from(graphemes.segment(text)).length,
    // Kyrelo's own upload limit (lib/uploads.ts); Instagram takes bigger.
    maxImageBytes: 5 * 1024 * 1024,
    campaignLimit: 2200,
    requiresImage: true,
    imageTypes: ["jpg", "jpeg", "png"],
    // Posted through instagram.com in the account's own Chrome profile, like X,
    // so images come straight from this computer (Meta's API only takes them
    // from a public web address).
    connect: "browser",
    loginUrl: "https://www.instagram.com/accounts/login/",
    signupUrl: "https://www.instagram.com/accounts/emailsignup/",
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    // Facebook's own limit; campaigns write far shorter (campaignLimit).
    maxLength: 63_206,
    length: (text) => Array.from(graphemes.segment(text)).length,
    // Kyrelo's own upload limit (lib/uploads.ts); Facebook takes bigger.
    maxImageBytes: 5 * 1024 * 1024,
    campaignLimit: 500,
    requiresImage: false,
    // Posted through facebook.com in the account's own Chrome profile, like
    // Instagram, to the user's own profile.
    connect: "browser",
    loginUrl: "https://www.facebook.com/login/",
    signupUrl: "https://www.facebook.com/r.php",
  },
};

/** The longest post a campaign writes for a platform (PlatformSpec.campaignLimit). */
export function campaignLimit(platform: PlatformId): number {
  return PLATFORMS[platform].campaignLimit;
}

/** Whether `text` fits every platform a campaign posts to, as each counts it. */
export function fitsCampaign(text: string, platforms: PlatformId[]): boolean {
  return platforms.every((p) => PLATFORMS[p].length(text) <= campaignLimit(p));
}

/** Shortens `text` until it fits every one of those platforms. */
export function fitForCampaign(text: string, platforms: PlatformId[]): string {
  return platforms.reduce((t, p) => fitText(t, campaignLimit(p), PLATFORMS[p].length), text);
}

const URL_RE = /https?:\/\/\S+/g;
const REMOTE_MENTION_RE = /(@[\w.]+)@[\w.-]+\w/g;

/** Mastodon's count: links as 23 characters, @user@server as @user, then characters as seen. */
export function mastodonLength(text: string): number {
  const counted = text.replace(URL_RE, "x".repeat(23)).replace(REMOTE_MENTION_RE, "$1");
  return Array.from(graphemes.segment(counted)).length;
}

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

/** Why a post with this image (or none) can't go to `platform`, or null if it can. */
export function postImageError(platform: PlatformId, imagePath: string | undefined): string | null {
  const spec = PLATFORMS[platform];
  if (!imagePath) return spec.requiresImage ? `${spec.label} posts need a photo` : null;
  if (spec.maxImageBytes === 0) return `Kyrelo can't post images to ${spec.label}`;
  const ext = imagePath.split(".").pop()?.toLowerCase() ?? "";
  if (spec.imageTypes && !spec.imageTypes.includes(ext)) return `${spec.label} takes JPEG or PNG photos`;
  return null;
}

/** Why `text` can't be posted on `platform`, or null if it can. */
export function postTextError(platform: PlatformId, text: string): string | null {
  const spec = PLATFORMS[platform];
  if (!text.trim()) return "text can't be empty";
  if (spec.length(text) > spec.maxLength) return `too long for ${spec.label} (max ${spec.maxLength} characters)`;
  return null;
}
