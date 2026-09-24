/**
 * Local-only Windows release script for Kyrelo.
 *
 * What it does:
 *   1. Validates env (must run on Windows, gh CLI authenticated, optionally a
 *      WINDOWS_CERT_THUMBPRINT pointing at a cert in the Windows cert store).
 *   2. Builds the Next app, installs Playwright Chromium, packages with
 *      electron-builder. When the thumbprint is set every produced .exe is
 *      signed sha256 + timestamped via Sectigo's RFC 3161 server.
 *   3. Verifies each signature with signtool /pa.
 *   4. Uploads the installer .exe to the existing GitHub release for the
 *      current package.json version (or creates the release if it doesn't
 *      exist yet — e.g. you ran Windows before Mac).
 *
 * This script does NOT bump the version. Run release:mac first (which bumps
 * + tags), then run this on a Windows machine to attach the .exe to the
 * same release.
 *
 * Usage (on Windows):
 *   npm run release:win           → full release (build, sign, verify, upload)
 *   npm run release:win:test      → unpacked build only, no upload
 *
 * Credentials (in desktop/.env.local — gitignored, NEVER commit):
 *   WINDOWS_CERT_THUMBPRINT=<sha1 thumbprint, no spaces>
 *
 * gh CLI must be authenticated as a user with push access:
 *   gh auth status
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

if (!process.env.GIT_SSH_COMMAND && process.env.GIT_SSH_KEY) {
  process.env.GIT_SSH_COMMAND = `ssh -i "${process.env.GIT_SSH_KEY}" -o IdentitiesOnly=yes`;
}

const TEST_MODE = process.argv.slice(2).some((a) => a === "--test" || a === "test");
const WINDOWS_CERT_THUMBPRINT = (process.env.WINDOWS_CERT_THUMBPRINT || "").trim();
const SIGNING_ENABLED = WINDOWS_CERT_THUMBPRINT.length > 0;

const VERSION = require("../package.json").version;
const REPO = "sobytes/Kyrelo-Buffer-Alternative";

function fail(msg) {
  console.error(`\nERROR: ${msg}\n`);
  process.exit(1);
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", cwd: path.join(__dirname, ".."), ...opts });
}

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function findSigntool() {
  if (process.platform !== "win32") return null;
  const sdkRoot = "C:\\Program Files (x86)\\Windows Kits\\10\\bin";
  if (!fs.existsSync(sdkRoot)) return null;
  const candidates = fs
    .readdirSync(sdkRoot)
    .map((v) => path.join(sdkRoot, v, "x64", "signtool.exe"))
    .filter((p) => fs.existsSync(p))
    .sort()
    .reverse();
  return candidates[0] || null;
}

function validate() {
  console.log("\nValidating Windows release env…");

  if (process.platform !== "win32") {
    fail(
      "release:win must be run on a Windows machine (electron-builder Windows " +
        "signing + signtool verification require the Windows cert store).",
    );
  }

  try {
    execSync("gh auth status", { stdio: "pipe" });
  } catch {
    fail("gh CLI is not authenticated. Run `gh auth login` first.");
  }
  console.log("  gh CLI: authenticated");

  if (SIGNING_ENABLED) {
    const signtool = findSigntool();
    if (!signtool) {
      fail(
        'signtool.exe not found under "C:\\Program Files (x86)\\Windows Kits\\10\\bin". ' +
          'Install the "Windows SDK Signing Tools" component.',
      );
    }
    console.log(`  WINDOWS_CERT_THUMBPRINT: ${WINDOWS_CERT_THUMBPRINT.substring(0, 8)}…`);
    console.log(`  signtool: ${signtool}`);
  } else {
    console.log(
      "  WINDOWS_CERT_THUMBPRINT: not set — installer will ship UNSIGNED (SmartScreen warns first-time users)",
    );
  }
  console.log("");
}

function build() {
  // Always start with a clean dist/ — electron-builder appends, so stale
  // .exes from previous versions would otherwise sneak into the upload.
  const distDir = path.join(__dirname, "../dist");
  if (fs.existsSync(distDir)) {
    console.log("Cleaning dist/ …");
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  console.log("Building Next + installing Playwright Chromium…");
  run("npm run build");
  run("npm run pw:install");
  console.log("");

  const signFlag = SIGNING_ENABLED
    ? ` -c.win.certificateSha1=${WINDOWS_CERT_THUMBPRINT}`
    : "";

  if (TEST_MODE) {
    console.log("Packaging unpacked Windows app (--dir, no installer)…");
    run(`npx electron-builder --win --x64 --dir${signFlag}`);
  } else {
    console.log(
      `Packaging Windows installer${SIGNING_ENABLED ? " (signed)" : " (UNSIGNED)"}…`,
    );
    run(`npx electron-builder --win --x64${signFlag}`);
  }
}

function findExeFiles() {
  const distDir = path.join(__dirname, "../dist");
  return fs
    .readdirSync(distDir)
    .filter((f) => f.endsWith(".exe") && f.includes(VERSION))
    .map((f) => path.join(distDir, f));
}

function verifySignatures(exeFiles) {
  if (!SIGNING_ENABLED) return;
  const signtool = findSigntool();
  if (!signtool) fail("signtool.exe not found — cannot verify.");

  console.log("\nVerifying signatures with signtool /pa …");
  for (const exe of exeFiles) {
    console.log(`  ${path.basename(exe)}`);
    try {
      execSync(`"${signtool}" verify /pa /v "${exe}"`, { stdio: "inherit" });
    } catch {
      fail(
        `Signature verification failed for ${path.basename(exe)}. ` +
          "Refusing to upload an unsigned/invalid artifact.",
      );
    }
  }
}

function uploadToGithub(exeFiles) {
  // If the release for this tag doesn't exist yet (e.g. Windows ran before
  // Mac), create it. Otherwise append the .exe(s).
  let releaseExists = false;
  try {
    execSync(`gh release view v${VERSION} -R ${REPO}`, { stdio: "pipe" });
    releaseExists = true;
  } catch {
    // doesn't exist
  }

  if (!releaseExists) {
    console.log(`\nCreating GitHub release v${VERSION}…`);
    run(`gh release create v${VERSION} -R ${REPO} --title "v${VERSION}" --generate-notes`);
  } else {
    console.log(`\nAppending Windows artifacts to release v${VERSION}…`);
  }

  const fileArgs = exeFiles.map((f) => `"${f}"`).join(" ");
  run(`gh release upload v${VERSION} -R ${REPO} ${fileArgs} --clobber`);

  updateReleaseNotes();
}

/**
 * Rewrite the release body with a "Platforms in this release" banner above
 * the auto-generated changelog. Detects which artifacts are attached so the
 * banner reflects whichever combination of mac/windows builds have been
 * uploaded so far.
 */
function updateReleaseNotes() {
  try {
    const assetsJson = execSync(
      `gh release view v${VERSION} -R ${REPO} --json assets -q '[.assets[].name]'`,
      { encoding: "utf8" },
    );
    const names = JSON.parse(assetsJson) || [];
    const hasMac = names.some((n) => n.endsWith(".dmg"));
    const hasWin = names.some((n) => n.endsWith(".exe"));

    const currentBody = execSync(
      `gh release view v${VERSION} -R ${REPO} --json body -q .body`,
      { encoding: "utf8" },
    ).trimStart();

    const stripped = currentBody.replace(/^### Platforms[\s\S]*?\n---\n+/, "");

    const banner = [
      "### Platforms",
      "",
      `- 🍎 **macOS** (Apple Silicon, signed & notarized) ${hasMac ? "✅" : "— not in this release"}`,
      `- 🪟 **Windows** (10/11 x64, signed) ${hasWin ? "✅" : "— not in this release"}`,
      "",
      "Pick your installer from **Assets** below.",
      "",
      "---",
      "",
    ].join("\n");

    const newBody = banner + stripped;
    const tmp = path.join(os.tmpdir(), `kyrelo-notes-${Date.now()}.md`);
    fs.writeFileSync(tmp, newBody);
    try {
      run(`gh release edit v${VERSION} -R ${REPO} --notes-file "${tmp}"`);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  } catch (err) {
    console.warn(`Couldn't update release notes: ${err.message}`);
  }
}

async function main() {
  const start = Date.now();
  console.log("========================================");
  console.log(TEST_MODE ? "  Kyrelo — Windows TEST BUILD" : "  Kyrelo — Windows RELEASE");
  console.log("========================================");
  console.log(`  Version: ${VERSION}`);
  if (!TEST_MODE) {
    console.log(
      `  Code signing: ${SIGNING_ENABLED ? `Sectigo cert (${WINDOWS_CERT_THUMBPRINT.substring(0, 8)}…)` : "Not configured (unsigned)"}`,
    );
  }
  console.log("");

  if (!TEST_MODE) validate();

  build();

  if (TEST_MODE) {
    console.log("\n========================================");
    console.log(`  TEST BUILD complete in ${fmt(Date.now() - start)}`);
    console.log("  App: dist/win-unpacked/Kyrelo.exe");
    console.log("  (Unsigned, unpacked — for testing only)");
    console.log("========================================\n");
    return;
  }

  const exes = findExeFiles();
  if (exes.length === 0) fail("No .exe files found in dist/. Build failed?");

  verifySignatures(exes);
  uploadToGithub(exes);

  console.log("\n========================================");
  console.log(`  Done in ${fmt(Date.now() - start)}`);
  console.log(
    `  Release: https://github.com/${REPO}/releases/tag/v${VERSION}`,
  );
  if (SIGNING_ENABLED) {
    console.log("  Code signed and verified with Sectigo cert.");
  } else {
    console.log("  Note: installer is NOT code signed.");
    console.log("        Windows SmartScreen will warn first-time users.");
  }
  console.log("========================================\n");
}

main().catch((err) => {
  console.error("\nWindows release failed:", err.message);
  process.exit(1);
});
