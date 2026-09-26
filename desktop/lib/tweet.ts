// Shared by server and client code, so keep this free of Node imports.

export const MAX_TWEET_LENGTH = 280;
const URL_RE = /https?:\/\/\S+/g;

/** Length as X counts it: every URL is 23 characters. */
export function tweetLength(text: string): number {
  return text.replace(URL_RE, "x".repeat(23)).length;
}
