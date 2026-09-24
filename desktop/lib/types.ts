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

export type ScheduledPlatform = "twitter";
export type ScheduledStatus = "pending" | "posting" | "posted" | "failed";

export interface ScheduledPost {
  id: string;
  platform: ScheduledPlatform;
  /** Account ID this post is sent from (XAccount.id). Optional for legacy posts. */
  accountId?: string;
  text: string;
  /** Filename inside .data/uploads/ — set when the user attached an image. */
  imagePath?: string;
  scheduledFor: string;
  createdAt: string;
  status: ScheduledStatus;
  postedAt?: string;
  postedUrl?: string;
  error?: string;
}

export interface XAccount {
  /** Lowercased handle. Also the name of the Chrome profile dir on disk. */
  id: string;
  /** Handle as captured from X, preserving case. */
  handle: string;
  addedAt: string;
}
