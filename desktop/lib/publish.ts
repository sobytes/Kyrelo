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
    if (!secret) throw new Error("No app password saved for this Bluesky account. Reconnect it under Connected.");
    await opts.onSendingStarted();
    const { postToBluesky } = await import("./bluesky");
    return postToBluesky(account.handle, secret.appPassword, text, opts.imagePath);
  },
};

export function publish(account: Account, text: string, opts: PublishOptions): Promise<{ url: string }> {
  return PUBLISHERS[account.platform](account, text, opts);
}
