import { getAccountSecret, setAccountSecret } from "./storage";
import { Account, PlatformId } from "./types";

// Posting to any platform. The scheduler calls publish() and never branches on
// the platform; each platform supplies one Publisher. Browser platforms load
// Playwright lazily so importing this module stays cheap.

export interface PublishOptions {
  imagePath?: string;
  /** Show the browser while posting (browser platforms only). */
  headless: boolean;
  /** Called when sending actually starts, after any wait for the account's browser. */
  onSendingStarted: () => Promise<unknown>;
  /** The scheduled post's id: platforms that accept one use it to ignore a repeat of the same post. */
  idempotencyKey: string;
}

type Publisher = (account: Account, text: string, opts: PublishOptions) => Promise<{ url: string }>;

const PUBLISHERS: Record<PlatformId, Publisher> = {
  async twitter(account, text, opts) {
    const { postTweetBrowser } = await import("./browser/twitter-post");
    return postTweetBrowser(account.id, text, {
      headless: opts.headless,
      imagePath: opts.imagePath,
      onBrowserReady: opts.onSendingStarted,
    });
  },
  async bluesky(account, text, opts) {
    const secret = await getAccountSecret("bluesky", account.id);
    if (!secret?.appPassword) throw new Error("No app password saved for this Bluesky account. Reconnect it under Accounts.");
    await opts.onSendingStarted();
    const { postToBluesky } = await import("./bluesky");
    return postToBluesky(account.handle, secret.appPassword, text, opts.imagePath);
  },
  async mastodon(account, text, opts) {
    const secret = await getAccountSecret("mastodon", account.id);
    if (!secret?.instance || !secret.token) throw new Error("This Mastodon account isn't signed in any more. Reconnect it under Accounts.");
    await opts.onSendingStarted();
    const { postToMastodon } = await import("./mastodon");
    return postToMastodon(secret.instance, secret.token, text, { imagePath: opts.imagePath, idempotencyKey: opts.idempotencyKey });
  },
  async threads(account, text, opts) {
    const secret = await getAccountSecret("threads", account.id);
    if (!secret?.token || !secret.userId) throw new Error("This Threads account isn't signed in any more. Reconnect it under Accounts.");
    if (opts.imagePath) throw new Error("Threads posts from Kyrelo are text only. Remove the image and reschedule.");
    await opts.onSendingStarted();
    const { postToThreads, refreshedToken } = await import("./threads");
    // Tokens last 60 days; renewing one in use keeps the account connected.
    let token = secret.token;
    const fresh = await refreshedToken(token, secret.refreshedAt).catch(() => null);
    if (fresh) {
      token = fresh;
      await setAccountSecret("threads", account.id, { ...secret, token, refreshedAt: new Date().toISOString() });
    }
    return postToThreads(secret.userId, token, text);
  },
};

export function publish(account: Account, text: string, opts: PublishOptions): Promise<{ url: string }> {
  return PUBLISHERS[account.platform](account, text, opts);
}
