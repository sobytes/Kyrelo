import type { FollowedAccount } from "./unfollow-rules";

export type AiProvider = "claude" | "openai";

export interface ApiKeys {
  anthropic?: string;
  openai?: string;
}

export const REPLY_TONES = ["curious", "contrarian", "supportive", "witty", "expert"] as const;
export type ReplyTone = (typeof REPLY_TONES)[number];

/** "grok": ask @grok a question. "direct": reply in your own voice. "mix": some of each. */
export const REPLY_STYLES = ["grok", "direct", "mix"] as const;
export type ReplyStyle = (typeof REPLY_STYLES)[number];

/**
 * Monitor autopilot: drafts replies for new tweets automatically. It never
 * sends anything; the user picks a draft and sends it from X.
 */
export interface AutopilotSettings {
  enabled: boolean;
  tone: ReplyTone;
  style: ReplyStyle;
  /** 0–100. Tweets scoring below this are skipped, with the reason shown. */
  minScore: number;
  /** 0–1. Higher gives more varied, riskier wording. */
  creativity: number;
  /** Topics you want to engage with (free text). */
  topics: string;
  /** Topics or kinds of tweet to stay away from (free text). */
  avoid: string;
}

export interface GrokSettings {
  enabled: boolean;
  handles: string[];
  /** Words or phrases to search X for on each check (lib/keywords.ts). */
  keywords: string[];
  includeReplies: boolean;
  aiProvider: AiProvider;
  styleHint: string;
  notifyDesktop: boolean;
  /** When true, scheduled posts run with the browser hidden. Default: false (visible). */
  headlessPosting?: boolean;
  autopilot: AutopilotSettings;
}

/** What the AI decided about replying to a tweet, and its draft replies. */
export interface ReplyDraft {
  /** 0–100: how worthwhile a reply is (relevance, something to add, freshness). */
  score: number;
  /** One line on why it scored that way / what angle the replies take. */
  reason: string;
  /** Reply options, best first. Empty when the tweet was skipped. */
  options: string[];
  generatedAt: string;
}

export interface SeenTweet {
  id: string;
  /** Who posted it: a watched handle, or anyone for a keyword match. */
  handle: string;
  /** Set when a keyword search found it (not a watched handle): the keyword it matched. */
  keyword?: string;
  text: string;
  url: string;
  isReply: boolean;
  seenAt: string;
  /** ISO timestamp pulled from the tweet's <time datetime> element. */
  postedAt?: string;
  repliedAt?: string;
  replyText?: string;
  replyError?: string;
  /** Autopilot's decision and draft replies. Set once, when first drafted. */
  draft?: ReplyDraft;
  /** Marked when this tweet was already too old when we first saw it. */
  skipped?: "too-old";
}

export interface GrokState {
  bootstrapped: boolean;
  lastCheckedAt?: string;
  tweets: SeenTweet[];
}

/** Every social network Kyrelo can post to. Rules per platform: lib/platforms.ts. */
export type PlatformId = "twitter" | "bluesky" | "linkedin";
export type ScheduledStatus = "pending" | "posting" | "posted" | "failed";

export interface ScheduledPost {
  id: string;
  platform: PlatformId;
  /** Account ID this post is sent from (Account.id on `platform`). Optional for legacy X posts. */
  accountId?: string;
  text: string;
  /** Filename inside .data/uploads/ — set when the user attached an image. */
  imagePath?: string;
  scheduledFor: string;
  createdAt: string;
  status: ScheduledStatus;
  /**
   * Set when the browser is open and the post is actually being sent. A
   * "posting" post without it is still waiting for the account's browser.
   */
  sendingStartedAt?: string;
  postedAt?: string;
  postedUrl?: string;
  error?: string;
  /** Set when this post was created by an Auto Campaign. */
  campaignId?: string;
}

/**
 * A connected social account. Identified by (platform, id): the same handle
 * can be connected on several platforms. Credentials never live here (this
 * list is sent to the UI); browser platforms keep their session in a Chrome
 * profile, Bluesky keeps its app password in account-secrets (storage.ts).
 */
export interface Account {
  platform: PlatformId;
  /** Lowercased handle. For browser platforms, also the Chrome profile dir name. */
  id: string;
  /** Handle as shown by the platform, preserving case. */
  handle: string;
  addedAt: string;
}

/** Saved once, reused by every Auto Campaign so the user only types count + duration. */
export interface BrandProfile {
  brief: string;
  url: string;
  competitors: string;
}

/** An image the user uploaded for the campaign automator to pick from. */
export interface MediaItem {
  id: string;
  /** Filename inside .data/uploads/. */
  filename: string;
  /** User-written or AI-written description, used to match images to tweets. */
  description: string;
  addedAt: string;
}

export type CampaignMediaKind = "none" | "library" | "og" | "screenshot" | "ai" | "youtube";

export interface CampaignDraft {
  id: string;
  angle: string;
  text: string;
  media: {
    kind: CampaignMediaKind;
    /** Filename inside .data/uploads/ once the media step resolved an image. */
    imagePath?: string;
    /** Why the automator chose this media, or what it tried and failed. */
    note?: string;
  };
  sources: string[];
  scheduledFor: string;
}

export type CampaignStatus =
  | "researching"
  | "writing"
  | "media"
  | "review"
  | "scheduled"
  | "discarded"
  | "failed";

export interface Campaign {
  id: string;
  accountId: string;
  brief: string;
  url: string;
  competitors: string;
  count: number;
  windowMinutes: number;
  useAiImages: boolean;
  autoSchedule: boolean;
  provider: AiProvider;
  status: CampaignStatus;
  /** Human-readable progress line for the current step. */
  progress: string;
  research?: string;
  drafts: CampaignDraft[];
  postIds: string[];
  error?: string;
  createdAt: string;
}

/** One follow change made by the Unfollow tab, kept so it can be undone. */
export interface FollowChange {
  handle: string;
  name: string;
  /** X's user id, when the scan had it (finds the right button on the profile). */
  userId?: string;
  action: "unfollowed" | "refollowed";
  at: string;
  /** Why it was suggested, as shown at the time. */
  reasons: string[];
}

/** The Unfollow tab's saved state for one X account. */
export interface UnfollowData {
  following: (FollowedAccount & { id?: string })[];
  scannedAt?: string;
  /** False when the last scan couldn't read X's stats. */
  hasStats: boolean;
  /** The last scan stopped before the end of the list. */
  partial: boolean;
  /** Lowercase handle → when they were last seen interacting (ISO). */
  interactions: Record<string, string>;
  interactionsScannedAt?: string;
  /** Lowercase handles never to unfollow. */
  keep: string[];
  /** Newest last. */
  history: FollowChange[];
}

/** Why the handle finder suggests an account (see lib/handle-finder.ts). */
export type SuggestionGroup = "audience" | "competitor" | "news" | "peer";

/** An X account the handle finder suggests watching or following, checked on X. */
export interface HandleSuggestion {
  handle: string;
  name: string;
  group: SuggestionGroup;
  reason: string;
  /** Came from X's own "Who to follow" for this account. */
  fromX: boolean;
  userId?: string;
  bio?: string;
  followers?: number;
  posts?: number;
  /** ISO time of their newest original post. */
  lastPostAt?: string;
  youFollow: boolean;
  /** When Kyrelo followed them from the finder. */
  followedAt?: string;
}

/** The handle finder's last run for one X account. */
export interface HandleFinderData {
  suggestions: HandleSuggestion[];
  ranAt?: string;
  /** Suggestions left out after checking X, and why. */
  dropped: { handle: string; why: string }[];
  /** Follows made from the finder (newest last), for the daily limit. */
  follows: { handle: string; at: string }[];
}

