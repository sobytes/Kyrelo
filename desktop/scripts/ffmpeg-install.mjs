// Fetches the ffmpeg binary Kyrelo bundles for fitting videos to each
// platform (lib/ffmpeg.ts), into build/ffmpeg/ for electron-builder's
// extraResources and dev mode. Static builds from the ffmpeg-static project,
// with their licence (GPL) and the README saying where the source is: both
// ship next to the binary.
//
// FFMPEG_TARGET_ARCH (or PW_TARGET_ARCH, which the Mac release already sets
// per arch) picks the arch: an Intel Mac building the arm64 release needs the
// arm64 binary, not its own. Downloads are cached per platform and arch in
// build/ffmpeg-cache/, so a release building both Mac arches fetches each once.

import { createGunzip } from "node:zlib";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const RELEASE = "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1";
const root = process.cwd();
const platform = process.platform;
const arch = process.env.FFMPEG_TARGET_ARCH || process.env.PW_TARGET_ARCH || process.arch;
const id = `${platform}-${arch}`;
const cache = path.join(root, "build", "ffmpeg-cache", id);
const target = path.join(root, "build", "ffmpeg");
const exe = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

async function download(name, dest, gunzip) {
  const res = await fetch(`${RELEASE}/${name}`);
  if (!res.ok || !res.body) throw new Error(`couldn't download ${name}: HTTP ${res.status}`);
  const tmp = `${dest}.download`;
  await pipeline(Readable.fromWeb(res.body), ...(gunzip ? [createGunzip()] : []), createWriteStream(tmp));
  await fs.rename(tmp, dest);
}

const exists = (p) => fs.access(p).then(() => true, () => false);

await fs.mkdir(cache, { recursive: true });
if (!(await exists(path.join(cache, exe)))) {
  console.log(`Downloading ffmpeg (${id}) → ${cache}`);
  await download(`ffmpeg-${id}.gz`, path.join(cache, exe), true);
  await download(`${id}.LICENSE`, path.join(cache, "LICENSE"), false);
  await download(`${id}.README`, path.join(cache, "README"), false);
} else {
  console.log(`ffmpeg (${id}) already downloaded`);
}

// Refresh build/ffmpeg (what electron-builder packages and dev mode uses).
await fs.rm(target, { recursive: true, force: true });
await fs.cp(cache, target, { recursive: true });
await fs.chmod(path.join(target, exe), 0o755);
console.log(`ffmpeg ready in ${target}`);
