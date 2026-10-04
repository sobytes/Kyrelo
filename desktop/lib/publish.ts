import { postImageError } from "./platforms";
import { getAccountSecret, setAccountSecret } from "./storage";
import { Account, PlatformId } from "./types";

// Posting to any platform. The scheduler calls publish() and never branches on
// the platform; each platform supplies one Publisher. Browser platforms load
// Playwright lazily so importing this module stays cheap.

export interface PublishOptions {
  imagePath?: string;
  /** Absolute path of an attached video (never with an image). */
  videoPath?: string;
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
      videoPath: opts.videoPath,
      onBrowserReady: opts.onSendingStarted,
    });
  },
  async bluesky(account, text, opts) {
    const secret = await getAccountSecret("bluesky", account.id);
    if (!secret?.appPassword) throw new Error("No app password saved for this Bluesky account. Reconnect it under Accounts.");
    await opts.onSendingStarted();
    const { postToBluesky } = await import("./bluesky");
    return postToBluesky(account.handle, secret.appPassword, text, { imagePath: opts.imagePath, videoPath: opts.videoPath });
  },
  async mastodon(account, text, opts) {
    const secret = await getAccountSecret("mastodon", account.id);
    if (!secret?.instance || !secret.token) throw new Error("This Mastodon account isn't signed in any more. Reconnect it under Accounts.");
    await opts.onSendingStarted();
    const { postToMastodon } = await import("./mastodon");
    return postToMastodon(secret.instance, secret.token, text, {
      imagePath: opts.imagePath,
      videoPath: opts.videoPath,
      idempotencyKey: opts.idempotencyKey,
    });
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
  async telegram(account, text, opts) {
    const secret = await getAccountSecret("telegram", account.id);
    if (!secret?.token || !secret.userId) throw new Error("This Telegram channel isn't connected any more. Reconnect it under Accounts.");
    await opts.onSendingStarted();
    const { postToTelegram } = await import("./telegram");
    return postToTelegram(secret.token, secret.userId, text, { imagePath: opts.imagePath, videoPath: opts.videoPath });
  },
  async discord(account, text, opts) {
    const secret = await getAccountSecret("discord", account.id);
    if (!secret?.token) throw new Error("This Discord webhook isn't connected any more. Reconnect it under Accounts.");
    await opts.onSendingStarted();
    const { postToDiscord } = await import("./discord");
    return postToDiscord(secret.token, secret.userId, text, opts.imagePath ?? opts.videoPath);
  },
  async linkedin(account, text, opts) {
    const secret = await getAccountSecret("linkedin", account.id);
    if (!secret?.token || !secret.userId) throw new Error("This LinkedIn account isn't connected any more. Reconnect it under Accounts.");
    await opts.onSendingStarted();
    const { postToLinkedIn } = await import("./linkedin");
    return postToLinkedIn(secret.token, secret.userId, text, opts.imagePath);
  },
  async youtube(account, text, opts) {
    if (!opts.videoPath) throw new Error("YouTube posts need a video. Attach one and reschedule.");
    const secret = await getAccountSecret("youtube", account.id);
    if (!secret?.token || !secret.clientId || !secret.clientSecret) {
      throw new Error("This YouTube channel isn't connected any more. Reconnect it under Accounts.");
    }
    const youtube = await import("./youtube");
    const token = await youtube.accessToken({ clientId: secret.clientId, clientSecret: secret.clientSecret }, secret.token);
    await opts.onSendingStarted();
    return youtube.uploadToYouTube(token, opts.videoPath, text);
  },
  async tiktok(account, text, opts) {
    if (!opts.videoPath) throw new Error("TikTok posts need a video. Attach one and reschedule.");
    const secret = await getAccountSecret("tiktok", account.id);
    if (!secret?.token || !secret.clientId || !secret.clientSecret) {
      throw new Error("This TikTok account isn't connected any more. Reconnect it under Accounts.");
    }
    const tiktok = await import("./tiktok");
    const tokens = await tiktok.refreshTokens({ clientId: secret.clientId, clientSecret: secret.clientSecret }, secret.token);
    // TikTok may rotate the refresh token; the old one stops working.
    if (tokens.refresh_token && tokens.refresh_token !== secret.token) {
      await setAccountSecret("tiktok", account.id, { ...secret, token: tokens.refresh_token });
    }
    await opts.onSendingStarted();
    return tiktok.uploadToTikTokInbox(tokens.access_token, opts.videoPath);
  },
  async slack(account, text, opts) {
    const secret = await getAccountSecret("slack", account.id);
    if (!secret?.token) throw new Error("This Slack webhook isn't connected any more. Reconnect it under Accounts.");
    await opts.onSendingStarted();
    const { postToSlack } = await import("./slack");
    return postToSlack(secret.token, text);
  },
  async devto(account, text, opts) {
    const secret = await getAccountSecret("devto", account.id);
    if (!secret?.token) throw new Error("This DEV account isn't connected any more. Reconnect it under Accounts.");
    await opts.onSendingStarted();
    const { postToDevTo } = await import("./devto");
    return postToDevTo(secret.token, text);
  },
  async hashnode(account, text, opts) {
    const secret = await getAccountSecret("hashnode", account.id);
    if (!secret?.token || !secret.userId) throw new Error("This Hashnode blog isn't connected any more. Reconnect it under Accounts.");
    await opts.onSendingStarted();
    const { postToHashnode } = await import("./hashnode");
    return postToHashnode(secret.token, secret.userId, text);
  },
  async wordpress(account, text, opts) {
    const secret = await getAccountSecret("wordpress", account.id);
    if (!secret?.instance || !secret.userId || !secret.appPassword) {
      throw new Error("This WordPress site isn't connected any more. Reconnect it under Accounts.");
    }
    await opts.onSendingStarted();
    const { postToWordPress } = await import("./wordpress");
    return postToWordPress({ site: secret.instance, username: secret.userId, appPassword: secret.appPassword }, text, opts.imagePath);
  },
  async lemmy(account, text, opts) {
    const secret = await getAccountSecret("lemmy", account.id);
    if (!secret?.instance || !secret.userId || !secret.appPassword || !secret.targetId) {
      throw new Error("This Lemmy account isn't connected any more. Reconnect it under Accounts.");
    }
    await opts.onSendingStarted();
    const { postToLemmy } = await import("./lemmy");
    const login = { instance: secret.instance, username: secret.userId, password: secret.appPassword };
    return postToLemmy(login, Number(secret.targetId), text, opts.imagePath);
  },
  async nostr(account, text, opts) {
    const secret = await getAccountSecret("nostr", account.id);
    if (!secret?.token) throw new Error("This Nostr key isn't saved any more. Reconnect it under Accounts.");
    await opts.onSendingStarted();
    const { parseSecretKey, postToNostr } = await import("./nostr");
    return postToNostr(parseSecretKey(secret.token), text);
  },
};

export function publish(account: Account, text: string, opts: PublishOptions): Promise<{ url: string }> {
  return PUBLISHERS[account.platform](account, text, opts);
}
