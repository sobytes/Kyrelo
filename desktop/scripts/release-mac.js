/**
 * Local-only macOS release script for Kyrelo.
 *
 * What it does:
 *   1. Validates Apple notarization + gh CLI credentials.
 *   2. Bumps the patch version in package.json (commits + tags locally).
 *   3. Builds the Next app, installs Playwright Chromium, packages with
 *      electron-builder (signs + notarizes).
 *   4. Pushes the version commit and tag to origin.
 *   5. Creates a GitHub release at that tag with the .dmg attached.
 *
 * Usage:
 *   npm run release:mac           → full release (signed, notarized, uploaded)
 *   npm run release:mac:test      → build only (no notarize, no push, no upload)
 *
 * Credentials (in .env.local — gitignored, NEVER commit):
 *   APPLE_ID=you@example.com
 *   APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
 *   APPLE_TEAM_ID=YOUR10CHARS         (your Apple Developer Team ID)
 *   MAC_SIGNING_IDENTITY=...optional  (pin a specific keychain identity;
 *                                     auto-detects a Developer ID
 *                                     Application cert otherwise)
 *
 * gh CLI must be authenticated as a user with push access to the repo.
 * Check with: gh auth status
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

// If GIT_SSH_KEY is set in .env.local (path to a private key file), force
// git push to use that key. Avoids the "denied to <other-account>" failure
// when multiple keys are loaded in the agent.
if (!process.env.GIT_SSH_COMMAND && process.env.GIT_SSH_KEY) {
  process.env.GIT_SSH_COMMAND = `ssh -i "${process.env.GIT_SSH_KEY}" -o IdentitiesOnly=yes`;
}

const TEST_MODE = process.argv.slice(2).some((a) => a === "--test" || a === "test");

const APPLE_ID = process.env.APPLE_ID;
const APPLE_APP_SPECIFIC_PASSWORD = process.env.APPLE_APP_SPECIFIC_PASSWORD;
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID;

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

function maskEmail(s) {
  // Show only the domain so log paste-bins don't leak the mailbox.
  const at = s.indexOf("@");
  if (at < 0) return "[set]";
  return `***@${s.slice(at + 1)}`;
}

function validate() {
  console.log("\nValidating credentials…");
  if (!APPLE_ID) fail("APPLE_ID missing in .env.local");
  if (!APPLE_APP_SPECIFIC_PASSWORD) fail("APPLE_APP_SPECIFIC_PASSWORD missing in .env.local");
  if (!APPLE_TEAM_ID) fail("APPLE_TEAM_ID missing in .env.local");
  console.log(`  APPLE_ID: ${maskEmail(APPLE_ID)}`);
  console.log(`  APPLE_TEAM_ID: [set]`);
  console.log(`  APPLE_APP_SPECIFIC_PASSWORD: [set]`);

  try {
    execSync("gh auth status", { stdio: "pipe" });
  } catch {
    fail("gh CLI is not authenticated. Run `gh auth login` first.");
  }
  console.log("  gh CLI: authenticated");

  // Confirm at least one Developer ID Application cert is in the keychain.
  // MAC_SIGNING_IDENTITY pins a specific one when multiple are present.
  const pin = (process.env.MAC_SIGNING_IDENTITY ?? "").trim();
  try {
    const out = execSync('security find-identity -v -p codesigning', {
      encoding: "utf8",
    });
    if (pin) {
      if (!out.includes(pin)) {
        fail(`Signing identity "${pin}" not found in keychain.`);
      }
      console.log("  signing identity: [pinned via MAC_SIGNING_IDENTITY]");
    } else if (!/Developer ID Application/.test(out)) {
      fail(
        "No Developer ID Application cert found in keychain. Install one from " +
          "https://developer.apple.com/account/resources/certificates, or pin one " +
          "with MAC_SIGNING_IDENTITY in .env.local.",
      );
    } else {
      console.log("  signing identity: Developer ID Application (auto-detected)");
    }
  } catch (err) {
    fail(`security find-identity failed: ${err.message}`);
  }
  console.log("");
}

function bumpVersion() {
  const pkgPath = path.join(__dirname, "../package.json");
  const before = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
  console.log(`Bumping version (current: ${before})…`);
  run('npm version patch -m "Release v%s"');
  const after = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
  console.log(`  new version: ${after}\n`);
  return after;
}

function build() {
  // Always start with a clean dist/ — electron-builder appends to it, so
  // stale .dmgs from previous versions would otherwise get picked up by
  // uploadRelease() and re-uploaded against the new tag.
  const distDir = path.join(__dirname, "../dist");
  if (fs.existsSync(distDir)) {
    console.log("Cleaning dist/ …");
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  console.log("Building Next + downloading Playwright Chromium…");
  run("npm run build");
  run("npm run pw:install");
  console.log("");

  if (TEST_MODE) {
    console.log("Packaging (test — no notarize)…");
    run("SKIP_NOTARIZE=true npx electron-builder --mac --arm64 --dir");
  } else {
    console.log("Packaging + notarizing (this can take 5–15 min)…");
    const env = {
      ...process.env,
      APPLE_ID,
      APPLE_APP_SPECIFIC_PASSWORD,
      APPLE_TEAM_ID,
    };
    // Optional: pin a specific keychain identity via env. Without it
    // electron-builder picks the first Developer ID Application cert.
    const pin = (process.env.MAC_SIGNING_IDENTITY ?? "").trim();
    const identityFlag = pin ? ` -c.mac.identity=${JSON.stringify(pin)}` : "";
    run(`npx electron-builder --mac --arm64${identityFlag}`, { env });
  }
}

function uploadRelease(version) {
  const distDir = path.join(__dirname, "../dist");
  // Only ship artifacts that belong to *this* version. latest-mac.yml is
  // version-agnostic but always the current build's, so it's always included.
  const files = fs
    .readdirSync(distDir)
    .filter((f) => {
      if (f === "latest-mac.yml") return true;
      if (!f.endsWith(".dmg") && !f.endsWith(".dmg.blockmap")) return false;
      return f.includes(`-${version}-`);
    })
    .map((f) => path.join(distDir, f));

  if (!files.some((f) => f.endsWith(".dmg"))) {
    fail(`No .dmg for version ${version} in dist/. Build failed?`);
  }

  console.log("\nPushing version commit and tag…");
  run("git push origin HEAD --follow-tags");

  console.log(`\nCreating GitHub release v${version}…`);
  const fileArgs = files.map((f) => `"${f}"`).join(" ");
  run(
    `gh release create v${version} ${fileArgs} ` +
      `--title "v${version}" ` +
      `--generate-notes`,
  );
  console.log("");

  updateReleaseNotes(version);
}

/**
 * Rewrite the release body with a "Platforms in this release" banner above
 * the auto-generated changelog. Detects which artifacts are actually attached
 * (so if release:mac runs first, only the macOS row shows ✅; if release:win
 * later adds the .exe, re-running release:win updates the banner to show
 * both).
 */
function updateReleaseNotes(version) {
  try {
    const assetsJson = execSync(
      `gh release view v${version} --json assets -q '[.assets[].name]'`,
      { encoding: "utf8" },
    );
    const names = JSON.parse(assetsJson) || [];
    const hasMac = names.some((n) => n.endsWith(".dmg"));
    const hasWin = names.some((n) => n.endsWith(".exe"));

    const currentBody = execSync(
      `gh release view v${version} --json body -q .body`,
      { encoding: "utf8" },
    ).trimStart();

    // Strip any previous banner we wrote so repeated runs don't stack.
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
      run(`gh release edit v${version} --notes-file "${tmp}"`);
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
  console.log(TEST_MODE ? "  Kyrelo — TEST BUILD" : "  Kyrelo — RELEASE");
  console.log("========================================");

  if (!TEST_MODE) validate();

  const version = TEST_MODE
    ? require("../package.json").version
    : bumpVersion();

  build();

  if (!TEST_MODE) uploadRelease(version);

  console.log("========================================");
  console.log(`  Done in ${fmt(Date.now() - start)}`);
  if (TEST_MODE) {
    console.log("  App: dist/mac-arm64/Kyrelo.app");
    console.log("  (Not notarized — Gatekeeper will warn.)");
  } else {
    console.log(`  Release: https://github.com/sobytes/Kyrelo-Buffer-Alternative/releases/tag/v${version}`);
  }
  console.log("========================================\n");
}

main().catch((err) => {
  console.error("\nRelease failed:", err.message);
  process.exit(1);
});
