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
  /** Largest video file Kyrelo can post here. 0: Kyrelo can't post videos there (yet). */
  maxVideoBytes: number;
  /**
   * Longest video the platform takes for most accounts, in seconds; 0: no
   * limit Kyrelo needs to keep to. Longer videos are cut to fit when posted
   * (lib/ffmpeg.ts).
   */
  maxVideoSeconds: number;
  /**
   * The longest post an auto campaign writes here: short enough to read as a
   * social post, even where the platform allows far more (Facebook).
   */
  campaignLimit: number;
  /** Every post needs an image (Instagram): text-only posts can't go there. */
  requiresImage: boolean;
  /** Every post needs a video (YouTube). */
  requiresVideo: boolean;
  /** The image files it takes, by extension, if not all of Kyrelo's (png, jpg, gif, webp). */
  imageTypes?: string[];
  /**
   * How an account is connected: logging in through Chrome, credentials the
   * user pastes, approving Kyrelo on the platform's own page (OAuth, as
   * Mastodon), or approving the user's own developer app there ("app": they
   * paste its client id and secret first; lib/accounts.ts startAppConnect).
   */
  connect: "browser" | "credentials" | "oauth" | "app";
  /** Where to log in (browser platforms) or create the credentials. */
  loginUrl: string;
  /** Where to make an account, for someone who doesn't have one yet. */
  signupUrl: string;
  /** The fields a credentials connect asks for, with where to get them. */
  credentials?: CredentialField[];
}

export interface CredentialField {
  key: "handle" | "appPassword" | "token" | "webhookUrl" | "clientId" | "clientSecret" | "site" | "community";
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
    // Kyrelo's own upload limit (lib/uploads.ts); X takes up to 512 MB, and
    // accounts without Premium up to 2 minutes 20 seconds.
    maxVideoBytes: 256 * 1024 * 1024,
    maxVideoSeconds: 140,
    campaignLimit: MAX_TWEET_LENGTH,
    requiresImage: false,
    requiresVideo: false,
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
    // Bluesky's video limit (also at most 3 minutes long).
    maxVideoBytes: 100 * 1024 * 1024,
    maxVideoSeconds: 180,
    campaignLimit: 300,
    requiresImage: false,
    requiresVideo: false,
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
    // Mastodon's default limit for videos; servers can set their own.
    maxVideoBytes: 40 * 1024 * 1024,
    maxVideoSeconds: 0,
    campaignLimit: 500,
    requiresImage: false,
    requiresVideo: false,
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
    maxVideoBytes: 0,
    maxVideoSeconds: 0,
    campaignLimit: 500,
    requiresImage: false,
    requiresVideo: false,
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
    maxVideoBytes: 0,
    maxVideoSeconds: 0,
    campaignLimit: 2200,
    requiresImage: true,
    requiresVideo: false,
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
    // Pages with an API token only (lib/meta.ts); see postMediaError.
    maxVideoBytes: 256 * 1024 * 1024,
    maxVideoSeconds: 0,
    campaignLimit: 500,
    requiresImage: false,
    requiresVideo: false,
    // Posted through facebook.com in the account's own Chrome profile, like
    // Instagram, to the user's own profile.
    connect: "browser",
    loginUrl: "https://www.facebook.com/login/",
    signupUrl: "https://www.facebook.com/r.php",
  },
  telegram: {
    id: "telegram",
    label: "Telegram",
    // A message's limit, counted in UTF-16 units as Telegram does. A photo's
    // caption is shorter (1024); longer text follows it as a message.
    maxLength: 4096,
    length: (text) => text.length,
    // Kyrelo's own upload limit (lib/uploads.ts); Telegram takes 10 MB.
    maxImageBytes: 5 * 1024 * 1024,
    // What a bot may upload.
    maxVideoBytes: 50 * 1024 * 1024,
    maxVideoSeconds: 0,
    campaignLimit: 500,
    requiresImage: false,
    requiresVideo: false,
    // A bot the user makes with @BotFather, admin of their channel.
    connect: "credentials",
    loginUrl: "https://t.me/BotFather",
    signupUrl: "https://telegram.org/",
    credentials: [
      { key: "token", label: "Bot token", placeholder: "123456:ABC-DEF… from @BotFather", secret: true },
      { key: "handle", label: "Channel", placeholder: "@yourchannel" },
    ],
  },
  discord: {
    id: "discord",
    label: "Discord",
    maxLength: 2000,
    length: (text) => Array.from(graphemes.segment(text)).length,
    // Kyrelo's own upload limit (lib/uploads.ts); Discord takes 10 MB.
    maxImageBytes: 5 * 1024 * 1024,
    // What a webhook may upload to a server without boosts.
    maxVideoBytes: 10 * 1024 * 1024,
    maxVideoSeconds: 0,
    campaignLimit: 500,
    requiresImage: false,
    requiresVideo: false,
    // A channel webhook: no bot or app needed.
    connect: "credentials",
    loginUrl: "https://support.discord.com/hc/en-us/articles/228383668",
    signupUrl: "https://discord.com/register",
    credentials: [{ key: "webhookUrl", label: "Webhook URL", placeholder: "https://discord.com/api/webhooks/…", secret: true }],
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    maxLength: 3000,
    length: (text) => Array.from(graphemes.segment(text)).length,
    // Kyrelo's own upload limit (lib/uploads.ts); LinkedIn takes bigger.
    maxImageBytes: 5 * 1024 * 1024,
    maxVideoBytes: 0,
    maxVideoSeconds: 0,
    // About what LinkedIn shows before "…see more".
    campaignLimit: 1300,
    requiresImage: false,
    requiresVideo: false,
    // A token from the user's own LinkedIn app (lib/linkedin.ts). Earlier
    // versions posted by driving Chrome, which LinkedIn's terms forbid.
    connect: "credentials",
    loginUrl: "https://www.linkedin.com/developers/tools/oauth/token-generator",
    signupUrl: "https://www.linkedin.com/signup",
    credentials: [{ key: "token", label: "Access token", placeholder: "Your LinkedIn access token", secret: true }],
  },
  youtube: {
    id: "youtube",
    label: "YouTube",
    // The description's limit. The first line becomes the title (lib/youtube.ts).
    maxLength: 5000,
    length: (text) => Array.from(graphemes.segment(text)).length,
    maxImageBytes: 0,
    // Kyrelo's own upload limit (lib/uploads.ts); YouTube takes far bigger.
    maxVideoBytes: 256 * 1024 * 1024,
    maxVideoSeconds: 0,
    campaignLimit: 500,
    requiresImage: false,
    requiresVideo: true,
    // The user's own Google Cloud OAuth client (Desktop app type).
    connect: "app",
    loginUrl: "https://console.cloud.google.com/apis/credentials",
    signupUrl: "https://www.youtube.com/create_channel",
    credentials: [
      { key: "clientId", label: "Client ID", placeholder: "….apps.googleusercontent.com" },
      { key: "clientSecret", label: "Client secret", placeholder: "GOCSPX-…", secret: true },
    ],
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    // The caption limit. Kyrelo sends the video to the TikTok inbox, where the
    // user adds the caption (lib/tiktok.ts), so the text is theirs to paste.
    maxLength: 2200,
    length: (text) => Array.from(graphemes.segment(text)).length,
    maxImageBytes: 0,
    // Kyrelo's own upload limit (lib/uploads.ts); TikTok takes up to 4 GB.
    maxVideoBytes: 256 * 1024 * 1024,
    maxVideoSeconds: 600,
    campaignLimit: 500,
    requiresImage: false,
    requiresVideo: true,
    // The user's own TikTok developer app (Login Kit for Desktop).
    connect: "app",
    loginUrl: "https://developers.tiktok.com/apps/",
    signupUrl: "https://www.tiktok.com/signup",
    credentials: [
      { key: "clientId", label: "Client key", placeholder: "Client key" },
      { key: "clientSecret", label: "Client secret", placeholder: "Client secret", secret: true },
    ],
  },
  slack: {
    id: "slack",
    label: "Slack",
    // Slack cuts messages over 40,000 characters; past a few thousand they
    // collapse behind "Show more" anyway.
    maxLength: 4000,
    length: (text) => Array.from(graphemes.segment(text)).length,
    // Incoming webhooks can't upload files.
    maxImageBytes: 0,
    maxVideoBytes: 0,
    maxVideoSeconds: 0,
    campaignLimit: 500,
    requiresImage: false,
    requiresVideo: false,
    // An incoming webhook from a Slack app the user makes.
    connect: "credentials",
    loginUrl: "https://api.slack.com/apps",
    signupUrl: "https://slack.com/get-started",
    credentials: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://hooks.slack.com/services/…", secret: true },
      { key: "handle", label: "Channel", placeholder: "#announcements (to tell webhooks apart)" },
    ],
  },
  devto: {
    id: "devto",
    label: "DEV",
    // Articles: the first line is the title, the rest Markdown (lib/title.ts).
    maxLength: 100_000,
    length: (text) => Array.from(graphemes.segment(text)).length,
    // DEV takes cover images only from a web address.
    maxImageBytes: 0,
    maxVideoBytes: 0,
    maxVideoSeconds: 0,
    campaignLimit: 1300,
    requiresImage: false,
    requiresVideo: false,
    connect: "credentials",
    loginUrl: "https://dev.to/settings/extensions",
    signupUrl: "https://dev.to/enter",
    credentials: [{ key: "token", label: "API key", placeholder: "Your DEV API key", secret: true }],
  },
  hashnode: {
    id: "hashnode",
    label: "Hashnode",
    // Articles: the first line is the title, the rest Markdown (lib/title.ts).
    maxLength: 100_000,
    length: (text) => Array.from(graphemes.segment(text)).length,
    // Hashnode takes cover images only from a web address.
    maxImageBytes: 0,
    maxVideoBytes: 0,
    maxVideoSeconds: 0,
    campaignLimit: 1300,
    requiresImage: false,
    requiresVideo: false,
    connect: "credentials",
    loginUrl: "https://hashnode.com/settings/developer",
    signupUrl: "https://hashnode.com/onboard",
    credentials: [
      { key: "token", label: "Personal access token", placeholder: "Your Hashnode token", secret: true },
      { key: "site", label: "Blog address", placeholder: "yourname.hashnode.dev" },
    ],
  },
  wordpress: {
    id: "wordpress",
    label: "WordPress",
    // Posts: the first line is the title, the rest the content (lib/title.ts).
    maxLength: 100_000,
    length: (text) => Array.from(graphemes.segment(text)).length,
    // Kyrelo's own upload limit (lib/uploads.ts); the image becomes the featured image.
    maxImageBytes: 5 * 1024 * 1024,
    maxVideoBytes: 0,
    maxVideoSeconds: 0,
    campaignLimit: 1300,
    requiresImage: false,
    requiresVideo: false,
    // A self-hosted site (or one with the REST API on), with an application password.
    connect: "credentials",
    loginUrl: "https://wordpress.org/documentation/article/application-passwords/",
    signupUrl: "https://wordpress.org/download/",
    credentials: [
      { key: "site", label: "Site address", placeholder: "example.com" },
      { key: "handle", label: "Username", placeholder: "Your WordPress username" },
      { key: "appPassword", label: "Application password", placeholder: "xxxx xxxx xxxx xxxx xxxx xxxx", secret: true },
    ],
  },
  lemmy: {
    id: "lemmy",
    label: "Lemmy",
    // Posts: the first line is the title (up to 200), the rest the body (lib/title.ts).
    maxLength: 10_000,
    length: (text) => Array.from(graphemes.segment(text)).length,
    // Kyrelo's own upload limit (lib/uploads.ts); instances often allow less.
    maxImageBytes: 5 * 1024 * 1024,
    maxVideoBytes: 0,
    maxVideoSeconds: 0,
    campaignLimit: 500,
    requiresImage: false,
    requiresVideo: false,
    // Username and password on the user's instance, and the community to post to.
    connect: "credentials",
    loginUrl: "https://join-lemmy.org/instances",
    signupUrl: "https://join-lemmy.org/instances",
    credentials: [
      { key: "handle", label: "Account", placeholder: "you@lemmy.world" },
      { key: "appPassword", label: "Password", placeholder: "Your Lemmy password", secret: true },
      { key: "community", label: "Community", placeholder: "technology or technology@lemmy.ml" },
    ],
  },
  nostr: {
    id: "nostr",
    label: "Nostr",
    // Notes have no protocol limit; clients show long ones collapsed.
    maxLength: 10_000,
    length: (text) => Array.from(graphemes.segment(text)).length,
    // Images on Nostr are links to files hosted elsewhere.
    maxImageBytes: 0,
    maxVideoBytes: 0,
    maxVideoSeconds: 0,
    campaignLimit: 500,
    requiresImage: false,
    requiresVideo: false,
    // The user's own key (nsec); notes go to public relays (lib/nostr.ts).
    connect: "credentials",
    loginUrl: "https://nostr.how/en/get-started",
    signupUrl: "https://nostr.how/en/get-started",
    credentials: [{ key: "token", label: "Secret key", placeholder: "nsec1…", secret: true }],
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
  if (spec.requiresVideo) return `${spec.label} posts need a video`;
  if (!imagePath) return spec.requiresImage ? `${spec.label} posts need a photo` : null;
  if (spec.maxImageBytes === 0) return `Kyrelo can't post images to ${spec.label}`;
  const ext = imagePath.split(".").pop()?.toLowerCase() ?? "";
  if (spec.imageTypes && !spec.imageTypes.includes(ext)) return `${spec.label} takes JPEG or PNG photos`;
  return null;
}

/**
 * Why a post with this video can't go to `platform`, or null if it can.
 * `bytes` is checked when known, unless `canShrink` (the desktop has ffmpeg
 * and makes a version that fits when it posts).
 */
export function postVideoError(platform: PlatformId, videoPath: string, bytes?: number, canShrink = false): string | null {
  const spec = PLATFORMS[platform];
  if (spec.maxVideoBytes === 0) return `Kyrelo can't post videos to ${spec.label} yet`;
  if (spec.requiresImage) return `${spec.label} posts need a photo`;
  if (!/\.(mp4|mov)$/i.test(videoPath)) return `${spec.label} takes MP4 or MOV videos`;
  if (!canShrink && bytes !== undefined && bytes > spec.maxVideoBytes) {
    return `the video is too big for ${spec.label} (max ${Math.round(spec.maxVideoBytes / 1024 / 1024)} MB)`;
  }
  return null;
}

/** Why `text` can't be posted on `platform`, or null if it can. */
export function postTextError(platform: PlatformId, text: string): string | null {
  const spec = PLATFORMS[platform];
  if (!text.trim()) return "text can't be empty";
  if (spec.length(text) > spec.maxLength) return `too long for ${spec.label} (max ${spec.maxLength} characters)`;
  return null;
}
