// Shared by server and client code, so keep this free of Node imports.

/**
 * Standard X limit. Auto campaigns write to this so their posts work on any
 * account.
 */
export const MAX_TWEET_LENGTH = 280;

/** Replies are kept a little under the limit, leaving room for X's own mention prefix. */
export const REPLY_MAX_LENGTH = 270;

const URL_RE = /https?:\/\/\S+/g;

/** Length as X counts it: every URL is 23 characters. */
export function tweetLength(text: string): number {
  return text.replace(URL_RE, "x".repeat(23)).length;
}
