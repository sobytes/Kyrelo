import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { saveImage, uploadsDir } from "./uploads";

// Video work with the bundled ffmpeg (scripts/ffmpeg-install.mjs): how long a
// video is, a still frame for its thumbnail, a version that fits a platform's
// length and size limits, and a clip cut from it. Everything degrades
// gracefully without ffmpeg (a dev checkout that hasn't downloaded it):
// hasFfmpeg() is false and videos go out as they are.

const EXE = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

/** Electron passes the bundled binary's path; dev and tests use the downloaded copy. */
export function ffmpegPath(): string {
  return process.env.FFMPEG_PATH ?? path.join(process.cwd(), "build", "ffmpeg", EXE);
}

export function hasFfmpeg(): boolean {
  return existsSync(ffmpegPath());
}

/** Runs ffmpeg; resolves with its log (stderr), which is where it reports what it read. */
function run(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath(), ["-hide_banner", ...args], { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) reject(Object.assign(new Error(`ffmpeg: ${stderr.split("\n").filter(Boolean).slice(-2).join(" ") || err.message}`), { stderr }));
      else resolve(stderr);
    });
  });
}

export interface VideoInfo {
  seconds: number;
  width?: number;
  height?: number;
}

/** Reads "Duration: 00:04:12.34" and the video stream's size from ffmpeg's log. */
export function parseInfo(log: string): VideoInfo | null {
  const d = log.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!d) return null;
  const size = log.match(/Stream #.*Video:.*?(\d{2,5})x(\d{2,5})/);
  return {
    seconds: Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]),
    ...(size ? { width: Number(size[1]), height: Number(size[2]) } : {}),
  };
}

/** How long a video is (and its size in pixels). ffmpeg with no output exits with an error but still prints this. */
export async function probe(file: string): Promise<VideoInfo> {
  const log = await run(["-i", file], 30_000).catch((err: { stderr?: string }) => err.stderr ?? "");
  const info = parseInfo(log);
  if (!info) throw new Error("ffmpeg couldn't read that video.");
  return info;
}

/** A still frame a second in (or from the middle of a shorter clip), saved as an upload; returns its filename. */
export async function makePoster(file: string): Promise<string> {
  const { seconds } = await probe(file);
  const out = path.join(uploadsDir(), `poster-${randomUUID()}.jpg`);
  try {
    await run(["-y", "-ss", String(Math.min(1, seconds / 2)), "-i", file, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", out], 60_000);
    return await saveImage(await fs.readFile(out));
  } finally {
    await fs.rm(out, { force: true });
  }
}

/** Audio bitrate used for fitted videos. */
const AUDIO_BPS = 128_000;
/** Below this, a video squeezed into a size limit isn't worth watching. */
const MIN_VIDEO_BPS = 250_000;

export interface FitLimits {
  /** Longest the platform takes; 0 or missing for no limit. */
  maxSeconds?: number;
  /** Biggest file the platform takes. */
  maxBytes?: number;
}

/**
 * The ffmpeg arguments for a version within the limits: cut to `seconds`,
 * at most 1080p, H.264/AAC MP4 (what every platform takes), at a bitrate
 * that lands under `maxBytes` when there is one. Null when it can't fit.
 */
export function fitArgs(input: string, output: string, seconds: number, maxBytes?: number): string[] | null {
  const videoBps = maxBytes ? Math.floor((maxBytes * 0.9 * 8) / seconds - AUDIO_BPS) : null;
  if (videoBps !== null && videoBps < MIN_VIDEO_BPS) return null;
  return [
    "-y",
    "-i", input,
    "-t", seconds.toFixed(2),
    "-vf", "scale=-2:'min(1080,ih)'",
    "-c:v", "libx264",
    "-preset", "veryfast",
    ...(videoBps ? ["-b:v", String(videoBps), "-maxrate", String(videoBps), "-bufsize", String(videoBps * 2)] : ["-crf", "23"]),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", String(AUDIO_BPS),
    "-movflags", "+faststart",
    output,
  ];
}

/**
 * A version of the video (an absolute path in uploads/) that fits the
 * platform: the first `maxSeconds`, shrunk under `maxBytes`. The video itself
 * when it already fits. Versions are kept, named by their limits, so posting
 * the same video to the same kind of platform again reuses one.
 */
// Versions being made, by output path: scheduling starts one in the
// background and sending may ask for the same one before it's done.
const making = ((globalThis as { __kyreloFitting?: Map<string, Promise<string>> }).__kyreloFitting ??= new Map());

export async function fitVideo(file: string, limits: FitLimits): Promise<string> {
  const base = path.basename(file).replace(/\.(mp4|mov)$/i, "");
  const out = path.join(uploadsDir(), `${base}_fit_${limits.maxSeconds ?? 0}_${limits.maxBytes ?? 0}.mp4`);
  let job = making.get(out);
  if (!job) {
    job = makeFit(file, out, limits).finally(() => making.delete(out));
    making.set(out, job);
  }
  return job;
}

async function makeFit(file: string, out: string, limits: FitLimits): Promise<string> {
  const { seconds } = await probe(file);
  const bytes = (await fs.stat(file)).size;
  const tooLong = Boolean(limits.maxSeconds && seconds > limits.maxSeconds + 0.5);
  const tooBig = Boolean(limits.maxBytes && bytes > limits.maxBytes);
  if (!tooLong && !tooBig) return file;

  if (existsSync(out)) return out;

  const length = tooLong ? limits.maxSeconds! : seconds;
  const part = `${out}.part.mp4`;
  const tooLongToShrink = "This video is too long to fit the platform's file size limit. Trim it in Media and try again.";
  try {
    // Only cut: keep normal quality, and squeeze the bitrate only if the cut is still too big.
    if (!tooBig) {
      await run(fitArgs(file, part, length)!, 30 * 60_000);
      if (!limits.maxBytes || (await fs.stat(part)).size <= limits.maxBytes) {
        await fs.rename(part, out);
        return out;
      }
    }
    const args = fitArgs(file, part, length, limits.maxBytes);
    if (!args) throw new Error(tooLongToShrink);
    await run(args, 30 * 60_000);
    if ((await fs.stat(part)).size > limits.maxBytes!) {
      throw new Error("The video couldn't be made small enough for this platform. Trim it in Media and try again.");
    }
    await fs.rename(part, out);
    return out;
  } finally {
    await fs.rm(part, { force: true });
  }
}

/** Cuts start–end (seconds) into a new upload, re-encoded so the cut is exact; returns its filename. */
export async function cutClip(file: string, start: number, end: number): Promise<string> {
  if (!(end > start && start >= 0)) throw new Error("The clip's end must come after its start.");
  const filename = `${randomUUID()}.mp4`;
  const out = path.join(uploadsDir(), filename);
  await run(
    [
      "-y", "-ss", start.toFixed(2), "-i", file, "-t", (end - start).toFixed(2),
      "-vf", "scale=-2:'min(1080,ih)'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", String(AUDIO_BPS), "-movflags", "+faststart", out,
    ],
    30 * 60_000,
  );
  return filename;
}
