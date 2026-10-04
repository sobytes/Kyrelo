import { aiErrorMessage, draftCommentReplies } from "./ai";
import { getGrokSettings, getAccountSecret, getCommentSettings, getCommentsState, listAccounts, modifyCommentsState } from "./storage";
import { Account, PlatformId, PostComment, ReplyDraft } from "./types";

// Comments: replies people leave on the user's own posts, gathered from every
// connected account that supports it, with AI reply drafts. Like the
// Monitor's Autopilot, nothing is sent until the user picks a reply and
// presses Send. Each platform supplies one CommentSource; the rest of this
// file never branches on the platform.

type FoundComment = Omit<PostComment, "id" | "platform" | "accountId" | "seenAt">;

interface CommentSource {
  /** The newest comments on the account's posts. */
  list: (account: Account) => Promise<FoundComment[]>;
  /** Posts `text` as a reply to the comment and returns the reply's URL. */
  reply: (account: Account, comment: PostComment, text: string) => Promise<{ url: string }>;
}

async function blueskyPassword(account: Account): Promise<string> {
  const secret = await getAccountSecret("bluesky", account.id);
  if (!secret?.appPassword) throw new Error("No app password saved for this Bluesky account. Reconnect it under Accounts.");
  return secret.appPassword;
}

async function mastodonLogin(account: Account): Promise<{ instance: string; token: string }> {
  const secret = await getAccountSecret("mastodon", account.id);
  if (!secret?.instance || !secret.token) throw new Error("This Mastodon account isn't signed in any more. Reconnect it under Accounts.");
  return { instance: secret.instance, token: secret.token };
}

const SOURCES: Partial<Record<PlatformId, CommentSource>> = {
  bluesky: {
    async list(account) {
      const { listBlueskyComments } = await import("./bluesky");
      const found = await listBlueskyComments(account.handle, await blueskyPassword(account));
      return found.map((c) => ({
        author: c.author,
        text: c.text,
        url: c.url,
        postedAt: c.postedAt,
        postText: c.postText,
        target: { uri: c.uri, cid: c.cid, rootUri: c.root.uri, rootCid: c.root.cid },
      }));
    },
    async reply(account, comment, text) {
      const { replyOnBluesky } = await import("./bluesky");
      const { uri, cid, rootUri, rootCid } = comment.target;
      return replyOnBluesky(account.handle, await blueskyPassword(account), { uri, cid, root: { uri: rootUri, cid: rootCid } }, text);
    },
  },
  mastodon: {
    async list(account) {
      const { listMastodonComments } = await import("./mastodon");
      const { instance, token } = await mastodonLogin(account);
      const found = await listMastodonComments(instance, token);
      return found.map((c) => ({
        author: c.acct,
        text: c.text,
        url: c.url,
        postedAt: c.postedAt,
        postText: c.postText,
        target: { id: c.id, visibility: c.visibility },
      }));
    },
    async reply(account, comment, text) {
      const { replyOnMastodon } = await import("./mastodon");
      const { instance, token } = await mastodonLogin(account);
      const visibility = comment.target.visibility as "public" | "unlisted" | "private";
      return replyOnMastodon(instance, token, { id: comment.target.id, acct: comment.author, visibility }, text);
    },
  },
  threads: {
    async list(account) {
      const { listThreadsComments, threadsCredentials } = await import("./threads");
      const { userId, token } = await threadsCredentials(account.id);
      const found = await listThreadsComments(userId, account.handle, token);
      return found.map((c) => ({
        author: c.username,
        text: c.text,
        url: c.url,
        postedAt: c.postedAt,
        postText: c.postText,
        target: { id: c.id },
      }));
    },
    async reply(account, comment, text) {
      const { postToThreads, threadsCredentials } = await import("./threads");
      const { userId, token } = await threadsCredentials(account.id);
      return postToThreads(userId, token, text, comment.target.id);
    },
  },
};

/** The platforms whose comments Kyrelo can read and answer. */
export const COMMENT_PLATFORMS = Object.keys(SOURCES) as PlatformId[];

/**
 * A comment already this old when first seen stays out: the first check
 * would otherwise fill the list with weeks of answered comments.
 */
const MAX_AGE_MS = 2 * 24 * 60 * 60_000;
/** Drafts per check. Each is one AI call; the rest are picked up next check. */
const DRAFTS_PER_CHECK = 5;

export interface CommentsCheckResult {
  skipped?: string;
  /** New comments found this check, for the worker's notification. */
  newComments?: number;
}

// One check at a time. The worker's timer and the page's "Check now" share
// it: a call while one runs waits for that one's result.
const checkState = ((globalThis as { __kyreloComments?: { inFlight?: Promise<CommentsCheckResult> } }).__kyreloComments ??= {});

export function runCommentsCheck(opts: { force?: boolean } = {}): Promise<CommentsCheckResult> {
  checkState.inFlight ??= checkOnce(opts.force ?? false).finally(() => {
    checkState.inFlight = undefined;
  });
  return checkState.inFlight;
}

async function checkOnce(force: boolean): Promise<CommentsCheckResult> {
  const settings = await getCommentSettings();
  if (!settings.enabled && !force) return { skipped: "disabled" };
  const accounts = (await listAccounts()).filter((a) => SOURCES[a.platform]);
  if (accounts.length === 0) return { skipped: "no-account" };

  const now = new Date();
  const found: PostComment[] = [];
  const accountErrors: Record<string, string> = {};
  for (const account of accounts) {
    try {
      for (const c of await SOURCES[account.platform]!.list(account)) {
        found.push({
          ...c,
          id: `${account.platform}:${account.id}:${c.target.id ?? c.target.uri}`,
          platform: account.platform,
          accountId: account.id,
          seenAt: now.toISOString(),
        });
      }
    } catch (err) {
      accountErrors[`${account.platform}:${account.id}`] = err instanceof Error ? err.message : String(err);
    }
  }

  let newComments = 0;
  await modifyCommentsState((state) => {
    const known = new Set(state.comments.map((c) => c.id));
    const fresh = found.filter((c) => !known.has(c.id) && now.getTime() - new Date(c.postedAt).getTime() <= MAX_AGE_MS);
    newComments = fresh.length;
    return {
      comments: [...state.comments, ...fresh].sort((a, b) => a.postedAt.localeCompare(b.postedAt)),
      lastCheckedAt: now.toISOString(),
      accountErrors,
    };
  });

  await draftNewComments();
  // The worker pops a notification for these, so honour the Settings toggle
  // here (it's the only place the worker learns of it).
  return { newComments: (await getGrokSettings()).notifyDesktop ? newComments : 0 };
}

/** Drafts replies for comments that are waiting for an answer and have no draft yet, newest first. */
async function draftNewComments(): Promise<void> {
  const { minScore } = await getCommentSettings();
  const waiting = (await getCommentsState()).comments
    .filter((c) => !c.draft && !c.repliedAt && !c.dismissedAt)
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
    .slice(0, DRAFTS_PER_CHECK);
  for (const c of waiting) {
    const r = await draftForComment(c.id, minScore);
    if (r.error) {
      // Nothing is saved, so it's retried next check. Stop now: the same
      // problem (no API key, provider down) would fail every comment.
      console.warn(`[comments] drafting failed for ${c.id}: ${r.error}`);
      return;
    }
  }
}

/**
 * Asks the AI to judge a comment and draft replies, and stores the result on
 * it. `threshold` 0 always drafts (the user asked); the background check
 * passes the user's minimum score.
 */
export async function draftForComment(id: string, threshold: number): Promise<{ draft?: ReplyDraft; error?: string }> {
  const comment = (await getCommentsState()).comments.find((c) => c.id === id);
  if (!comment) return { error: "That comment isn't in the list any more." };
  const settings = await getCommentSettings();
  let draft: ReplyDraft;
  try {
    const r = await draftCommentReplies({
      platform: comment.platform,
      author: comment.author,
      text: comment.text,
      postText: comment.postText,
      postedAt: comment.postedAt,
      tone: settings.tone,
      voiceNotes: settings.voiceNotes,
      threshold,
      // One AI provider for the whole app, chosen in Settings.
      provider: (await getGrokSettings()).aiProvider,
    });
    draft = { ...r, generatedAt: new Date().toISOString() };
  } catch (err) {
    return { error: aiErrorMessage(err) };
  }
  await modifyCommentsState((state) => ({
    ...state,
    comments: state.comments.map((c) => (c.id === id ? { ...c, draft } : c)),
  }));
  return { draft };
}

// Comments being sent right now, so a double click can't reply twice.
const sending = ((globalThis as { __kyreloCommentSends?: Set<string> }).__kyreloCommentSends ??= new Set());

/** Sends `text` as the reply to a comment and records it. */
export async function sendCommentReply(id: string, text: string): Promise<{ comment?: PostComment; error?: string }> {
  const reply = text.trim();
  if (!reply) return { error: "Write a reply first." };
  const comment = (await getCommentsState()).comments.find((c) => c.id === id);
  if (!comment) return { error: "That comment isn't in the list any more." };
  if (comment.repliedAt) return { error: "You've already replied to this comment." };
  const account = (await listAccounts(comment.platform)).find((a) => a.id === comment.accountId);
  if (!account) return { error: "The account this comment is on isn't connected any more." };
  if (sending.has(id)) return { error: "This reply is already being sent." };

  sending.add(id);
  try {
    let patch: Partial<PostComment>;
    try {
      const { url } = await SOURCES[comment.platform]!.reply(account, comment, reply);
      patch = { repliedAt: new Date().toISOString(), replyText: reply, replyUrl: url, replyError: undefined };
    } catch (err) {
      patch = { replyError: err instanceof Error ? err.message : String(err) };
    }
    let saved: PostComment | undefined;
    await modifyCommentsState((state) => ({
      ...state,
      comments: state.comments.map((c) => (c.id === id ? (saved = { ...c, ...patch }) : c)),
    }));
    return patch.replyError ? { error: patch.replyError, comment: saved } : { comment: saved };
  } finally {
    sending.delete(id);
  }
}

/** Hides a comment from the waiting list (or brings it back). */
export async function dismissComment(id: string, dismissed: boolean): Promise<void> {
  await modifyCommentsState((state) => ({
    ...state,
    comments: state.comments.map((c) =>
      c.id === id ? { ...c, dismissedAt: dismissed ? new Date().toISOString() : undefined } : c,
    ),
  }));
}
