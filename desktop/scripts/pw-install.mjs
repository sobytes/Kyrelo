// Cross-platform Playwright Chromium install. Downloads into a per-arch cache
// (build/pw-browsers-cache/<arch>), then copies it to build/pw-browsers/ (so
// electron-builder can ship it via extraResources) and prunes the ffmpeg
// subdir we don't use. The headless-shell is KEPT —
// the scraper runs headless, and Playwright drives that through its separate
// chromium-headless-shell binary.
//
// Works the same on macOS, Windows, and Linux — no shell-specific syntax.
//
// PW_TARGET_ARCH (x64 | arm64) picks the Chromium arch to bundle on macOS.
// Playwright otherwise downloads for the build machine, so an Intel Mac
// building the arm64 release would ship an x64 Chromium that fails to spawn.

import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "build", "pw-browsers");
const arch = process.env.PW_TARGET_ARCH || process.arch;
// One download per arch, kept between runs. A release builds arm64 and x64
// back to back, so without this it re-downloaded Chromium twice every time.
const cache = path.join(root, "build", "pw-browsers-cache", arch);
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: cache };

if (process.platform === "darwin") {
  const major = parseInt(os.release().split(".")[0], 10);
  env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE =
    `mac${Math.min(major - 9, 15)}` + (arch === "arm64" ? "-arm64" : "");
}

// Playwright skips the download when this revision is already in the cache.
console.log(`Installing Playwright Chromium (${arch}) → ${cache}`);
execSync("npx playwright install chromium", { stdio: "inherit", env });

// Refresh build/pw-browsers (what electron-builder packages and dev mode
// uses) from the cache. verbatimSymlinks keeps Chromium's relative framework
// symlinks relative, so the copy doesn't point back into the cache.
await fs.rm(target, { recursive: true, force: true });
await fs.cp(cache, target, { recursive: true, verbatimSymlinks: true });
await fs.writeFile(path.join(target, ".arch"), arch);

// ffmpeg isn't used; drop it from the packaged copy (the cache keeps it, so
// Playwright doesn't download it again next time).
for (const e of await fs.readdir(target)) {
  if (e.startsWith("ffmpeg-")) {
    await fs.rm(path.join(target, e), { recursive: true, force: true });
    console.log(`  removed ${e}`);
  }
}
console.log("Done.");
