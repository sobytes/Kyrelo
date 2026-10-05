import { promises as fs } from "node:fs";
import path from "node:path";
import {
  deleteScheduledPost,
  getAccountSecret,
  getGrokSettings,
  insertScheduledPost,
  listScheduledPosts,
  listAccounts,
  updateScheduledPost,
} from "./storage";
import { connectingPlatform } from "./browser-connect";
import { PLATFORMS, postImageError, postVideoError } from "./platforms";
import { publish } from "./publish";
import { ScheduledPost } from "./types";
import { SAFE_IMAGE_FILENAME, SAFE_VIDEO_FILENAME, uploadsDir } from "./uploads";
import { fitVideo, hasFfmpeg } from "./ffmpeg";

export interface DispatchOutcome {
  ran: number;
  posted: number;
  failed: number;
  skipped?: string;
}

// One dispatch run at a time in this process, like the watcher's guard. The
// worker skips overlapping ticks, but its flag resets when fetch gives up at
// 300s; a second run would then treat the post still being sent as stale.
const dispatchState = ((globalThis as { __kyreloDispatch?: { running: boolean } }).__kyreloDispatch ??= {
  running: false,
});

export async function runDueScheduledPosts(): Promise<DispatchOutcome> {
  if (dispatchState.running) return { ran: 0, posted: 0, failed: 0, skipped: "busy" };
  dispatchState.running = true;
  try {
    return await dispatchDuePosts();
  } finally {
    dispatchState.running = false;
  }
}

async function dispatchDuePosts(): Promise<DispatchOutcome> {
  if (connectingPlatform()) return { ran: 0, posted: 0, failed: 0, skipped: "connecting" };

  const all = await listScheduledPosts();
  const now = Date.now();

  // Recover posts orphaned at "posting" — the app closed (or crashed) mid-send,
  // leaving the record stuck forever, since the dispatch loop below only picks
  // up "pending". A real send finishes within a couple minutes of its
  // scheduled time, so anything still "posting" well past that is stale. Mark
  // it failed (not pending) — the original send may have gone through, so don't
  // auto-retry; the user can reschedule from History.
  const STALE_POSTING_MS = 10 * 60_000;
  for (const p of all) {
    if (
      p.status === "posting" &&
      now - new Date(p.scheduledFor).getTime() > STALE_POSTING_MS
    ) {
      await updateScheduledPost(p.id, (latest) =>
        latest.status === "posting"
          ? {
              ...latest,
              status: "failed",
              error:
                "Posting was interrupted — the app closed mid-send. Reschedule if it didn't go out.",
            }
          : null,
      );
    }
  }

  const due = all.filter(
    (p) => p.status === "pending" && new Date(p.scheduledFor).getTime() <= now,
  );
  if (due.length === 0) return { ran: 0, posted: 0, failed: 0 };
  console.log(`[scheduler] dispatching ${due.length} due post(s)`);

  const accounts = await listAccounts();
  if (accounts.length === 0) {
    return { ran: 0, posted: 0, failed: 0, skipped: "no-account" };
  }

  const settings = await getGrokSettings();
  const headless = settings.headlessPosting ?? false;

  let posted = 0;
  let failed = 0;
  for (const candidate of due) {
    // Claim the post from its latest stored copy. The user may have edited,
    // rescheduled or cancelled it since `due` was read; only a post that is
    // still pending and due gets marked "posting", so it can't be sent twice.
    const post = await updateScheduledPost(candidate.id, (latest) =>
      latest.status === "pending" && new Date(latest.scheduledFor).getTime() <= Date.now()
        ? { ...latest, status: "posting" }
        : null,
    );
    if (!post) continue;

    // Posts from before multi-account support have no accountId: they go
    // from the first account on their platform.
    const account = post.accountId
      ? accounts.find((a) => a.platform === post.platform && a.id === post.accountId)
      : accounts.find((a) => a.platform === post.platform);
    if (!account) {
      await updateScheduledPost(post.id, (latest) => ({
        ...latest,
        status: "failed",
        error: `The ${PLATFORMS[post.platform].label} account for this post isn't connected any more.`,
      }));
      failed++;
      continue;
    }
    console.log(`[scheduler] posting id=${post.id} to ${post.platform}:${account.id}`);
    // Result updates go through updateScheduledPost, which does nothing if
    // the user cancelled (deleted) the post mid-send, so it doesn't come back.
    try {
      const imagePath = post.imagePath ? path.join(uploadsDir(), post.imagePath) : undefined;
      const videoPath = post.videoPath ? await videoFor(post.platform, path.join(uploadsDir(), post.videoPath)) : undefined;
      const r = await publish(account, post.text, {
        headless,
        imagePath,
        videoPath,
        onSendingStarted: () =>
          updateScheduledPost(post.id, (latest) => ({ ...latest, sendingStartedAt: new Date().toISOString() })),
        idempotencyKey: post.id,
      });
      await updateScheduledPost(post.id, (latest) => ({
        ...latest,
        status: "posted",
        postedAt: new Date().toISOString(),
        postedUrl: r.url,
        error: undefined,
      }));
      posted++;
      console.log(`[scheduler] posted id=${post.id} → ${r.url}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateScheduledPost(post.id, (latest) => ({ ...latest, status: "failed", error: msg }));
      failed++;
      console.error(`[scheduler] failed id=${post.id}: ${msg}`);
    }
  }

  return { ran: due.length, posted, failed };
}

export async function createScheduledPost(input: {
  platform: ScheduledPost["platform"];
  accountId: string;
  text: string;
  imagePath?: string;
  videoPath?: string;
  scheduledFor: string;
  campaignId?: string;
}): Promise<ScheduledPost> {
  const post: ScheduledPost = {
    id: crypto.randomUUID(),
    platform: input.platform,
    accountId: input.accountId,
    text: input.text,
    imagePath: input.imagePath,
    videoPath: input.videoPath,
    scheduledFor: input.scheduledFor,
    createdAt: new Date().toISOString(),
    status: "pending",
    campaignId: input.campaignId,
  };
  await insertScheduledPost(post);
  if (post.videoPath) prepareVideo(post.platform, post.videoPath);
  return post;
}

export async function cancelScheduledPost(id: string): Promise<void> {
  await deleteScheduledPost(id);
}

/**
 * Why a post on `platform` can't have this attachment, or null if it can.
 * The same rules for creating and editing a post. Filenames must be ones the
 * upload route made, so a request can't point at a file outside uploads/.
 */
export async function postMediaError(
  platform: ScheduledPost["platform"],
  imagePath?: string,
  videoPath?: string,
  accountId?: string,
): Promise<string | null> {
  if (imagePath && !SAFE_IMAGE_FILENAME.test(imagePath)) return "invalid imagePath";
  if (videoPath && !SAFE_VIDEO_FILENAME.test(videoPath)) return "invalid videoPath";
  if (imagePath && videoPath) return "a post can have an image or a video, not both";
  if (!videoPath) return postImageError(platform, imagePath);
  const bytes = await fs
    .stat(path.join(uploadsDir(), videoPath))
    .then((s) => s.size)
    .catch(() => undefined);
  if (bytes === undefined) return "that video isn't uploaded any more";
  // Facebook videos go through the API, which needs the Page's token.
  if (platform === "facebook" && !(accountId && (await getAccountSecret("facebook", accountId))?.token)) {
    return "Facebook videos need a Page token: add one on the Comments page";
  }
  return postVideoError(platform, videoPath, bytes, hasFfmpeg());
}

/**
 * The version of a video to send to `platform`: cut to its length limit and
 * shrunk under its size limit (lib/ffmpeg.ts), or the video itself when it
 * fits or there's no ffmpeg. Versions are kept, so this is quick the second
 * time (see prepareVideo).
 */
export async function videoFor(platform: ScheduledPost["platform"], file: string): Promise<string> {
  if (!hasFfmpeg()) return file;
  const spec = PLATFORMS[platform];
  return fitVideo(file, { maxSeconds: spec.maxVideoSeconds || undefined, maxBytes: spec.maxVideoBytes });
}

/**
 * Starts making the platform's version of a scheduled video in the
 * background, so it's ready when the post goes out. A failure here is
 * retried (and reported) at send time.
 */
export function prepareVideo(platform: ScheduledPost["platform"], videoPath: string): void {
  void videoFor(platform, path.join(uploadsDir(), videoPath)).catch((err) =>
    console.warn(`[scheduler] couldn't prepare ${videoPath} for ${platform} yet: ${err instanceof Error ? err.message : err}`),
  );
}
