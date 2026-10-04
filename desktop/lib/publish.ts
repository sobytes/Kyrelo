import { postImageError } from "./platforms";
import { getAccountSecret } from "./storage";
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
    if (opts.imagePath) throw new Error("Threads posts from Kyrelo are text only. Remove the image and reschedule.");
    const { postToThreads, threadsCredentials } = await import("./threads");
    const { userId, token } = await threadsCredentials(account.id);
    await opts.onSendingStarted();
    return postToThreads(userId, token, text);
  },
  async instagram(account, text, opts) {
    const imageError = postImageError("instagram", opts.imagePath);
    if (imageError || !opts.imagePath) throw new Error(`${imageError}. Change the photo and reschedule.`);
    const { postToInstagramBrowser } = await import("./browser/instagram-post");
    return postToInstagramBrowser(account.id, text, opts.imagePath, {
      headless: opts.headless,
      onBrowserReady: opts.onSendingStarted,
    });
  },
  async facebook(account, text, opts) {
    const { postToFacebookBrowser } = await import("./browser/facebook-post");
    return postToFacebookBrowser(account.id, text, {
      headless: opts.headless,
      imagePath: opts.imagePath,
      onBrowserReady: opts.onSendingStarted,
    });
  },
};

export function publish(account: Account, text: string, opts: PublishOptions): Promise<{ url: string }> {
  return PUBLISHERS[account.platform](account, text, opts);
}
