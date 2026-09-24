// Cross-platform Playwright Chromium install. Installs into
// build/pw-browsers/ (so electron-builder can ship it via extraResources)
// and prunes the ffmpeg subdir we don't use. The headless-shell is KEPT —
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
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: target };

if (process.platform === "darwin") {
  const major = parseInt(os.release().split(".")[0], 10);
  env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE =
    `mac${Math.min(major - 9, 15)}` + (arch === "arm64" ? "-arm64" : "");
}

// Browser dirs are named by revision, not arch, so a cache from another arch
// would be silently reused. Wipe it when the arch changes.
const marker = path.join(target, ".arch");
const cached = await fs.readFile(marker, "utf8").catch(() => null);
if (cached !== arch) await fs.rm(target, { recursive: true, force: true });

console.log(`Installing Playwright Chromium (${arch}) → ${target}`);

execSync("npx playwright install chromium", { stdio: "inherit", env });
await fs.writeFile(marker, arch);

try {
  const entries = await fs.readdir(target);
  for (const e of entries) {
    if (e.startsWith("ffmpeg-")) {
      await fs.rm(path.join(target, e), { recursive: true, force: true });
      console.log(`  removed ${e}`);
    }
  }
} catch {
  // dir missing — install failed silently
}
console.log("Done.");
