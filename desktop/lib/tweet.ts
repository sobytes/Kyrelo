// Shared by server and client code, so keep this free of Node imports.

/**
 * Standard X limit. Auto campaigns write to this so their posts work on any
 * account.
 */
export const MAX_TWEET_LENGTH = 280;

/**
 * Limit for posts written in the Scheduler. Higher than MAX_TWEET_LENGTH on
 * purpose: X Premium accounts can post long posts, and X rejects over-long
 * posts from other accounts at send time.
 */
export const MAX_POST_LENGTH = 4000;
const URL_RE = /https?:\/\/\S+/g;

/** Length as X counts it: every URL is 23 characters. */
export function tweetLength(text: string): number {
  return text.replace(URL_RE, "x".repeat(23)).length;
}
