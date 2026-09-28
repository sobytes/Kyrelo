export type AiProvider = "claude" | "openai";

export interface ApiKeys {
  anthropic?: string;
  openai?: string;
}

export interface GrokSettings {
  enabled: boolean;
  handles: string[];
  includeReplies: boolean;
  aiProvider: AiProvider;
  styleHint: string;
  notifyDesktop: boolean;
  /** When true, scheduled posts run with the browser hidden. Default: false (visible). */
  headlessPosting?: boolean;
}

export interface SeenTweet {
  id: string;
  /** Handle this tweet was scraped from. */
  handle: string;
  text: string;
  url: string;
  isReply: boolean;
  seenAt: string;
  /** ISO timestamp pulled from the tweet's <time datetime> element. */
  postedAt?: string;
  repliedAt?: string;
  replyText?: string;
  replyError?: string;
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
