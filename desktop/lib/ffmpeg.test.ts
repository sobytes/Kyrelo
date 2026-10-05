import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let ff: typeof import("./ffmpeg");
let dir: string;

// storage.ts (through uploads.ts) reads STORAGE_DIR at import time, so point it at a temp dir first.
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "kyrelo-ffmpeg-"));
  process.env.STORAGE_DIR = dir;
  ff = await import("./ffmpeg");
});

describe("ffmpeg helpers", () => {
  it("reads the length and size from ffmpeg's log", () => {
    const log = "  Duration: 00:04:12.34, start: 0.000000, bitrate: 2048 kb/s\n  Stream #0:0(und): Video: h264 (High), yuv420p, 1920x1080 [SAR 1:1], 30 fps";
    expect(ff.parseInfo(log)).toEqual({ seconds: 252.34, width: 1920, height: 1080 });
    expect(ff.parseInfo("nothing here")).toBeNull();
  });

  it("aims under the size limit, and gives up when the result would be unwatchable", () => {
    const args = ff.fitArgs("in.mov", "out.mp4", 100, 10 * 1024 * 1024)!;
    const bps = Number(args[args.indexOf("-b:v") + 1]);
    expect((bps + 128_000) * 100 / 8).toBeLessThan(10 * 1024 * 1024);
    expect(args).toContain("+faststart");
    expect(ff.fitArgs("in.mov", "out.mp4", 3600, 10 * 1024 * 1024)).toBeNull();
    expect(ff.fitArgs("in.mov", "out.mp4", 60)).toContain("-crf");
  });
});

// The real thing, when ffmpeg has been downloaded (npm run ffmpeg:install).
describe.runIf(Boolean(process.env.FFMPEG_PATH) || existsSync(path.join(process.cwd(), "build", "ffmpeg")))("with ffmpeg", () => {
  it("cuts a video to a platform's length, makes a poster and a clip", async () => {
    const { uploadsDir } = await import("./uploads");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(uploadsDir(), { recursive: true });
    const src = path.join(uploadsDir(), "0123456789ab.mp4");
    execFileSync(ff.ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=8:size=640x360:rate=25", "-f", "lavfi", "-i", "sine=duration=8", "-shortest", "-pix_fmt", "yuv420p", src]);
    expect((await ff.probe(src)).seconds).toBeCloseTo(8, 0);

    const fitted = await ff.fitVideo(src, { maxSeconds: 3, maxBytes: 10 * 1024 * 1024 });
    expect(fitted).not.toBe(src);
    expect((await ff.probe(fitted)).seconds).toBeLessThan(3.5);
    // Already fits: the same file back.
    expect(await ff.fitVideo(src, { maxSeconds: 60, maxBytes: 100 * 1024 * 1024 })).toBe(src);

    const poster = await ff.makePoster(src);
    expect(poster).toMatch(/\.jpg$/);
    const clip = await ff.cutClip(src, 2, 5);
    expect((await ff.probe(path.join(uploadsDir(), clip))).seconds).toBeCloseTo(3, 0);
    expect((await stat(path.join(uploadsDir(), clip))).size).toBeGreaterThan(0);
  }, 60_000);
});
