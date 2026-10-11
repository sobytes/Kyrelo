import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { BrowserContext, chromium, Page } from "playwright";
import { findChrome } from "./system-chrome";
import { dataDir } from "../storage";

const USERDATA_ROOT = path.join(dataDir, "userdata");

export function userDataDir(platform: string, accountId: string): string {
  return path.join(USERDATA_ROOT, platform, accountId);
}

export interface BrowserHandle {
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

export interface OpenOptions {
  headless?: boolean;
  /** What the browser is for ("post", "scrape", …). Only used in logs. */
  purpose: string;
  /** Selects the profile directory: <dataDir>/userdata/<platform>/<accountId>/. */
  accountId: string;
}

// Kyrelo drives the user's own installed Chrome (findChrome), and the best
// disguise is to let it be exactly that: its own user agent, version, system
// language, timezone and graphics card. Earlier versions overrode them (a
// fixed Chrome 131 user agent, New York time, en-US, a fake Intel GPU), and
// each mismatch with the real browser and the user's IP is what bot checks
// look for. Only headless runs need one fix: headless Chrome names itself
// "HeadlessChrome", so presentAsChrome() reports it as the Chrome it is.

type ClientHints = {
  brands: { brand: string; version: string }[];
  fullVersionList: { brand: string; version: string }[];
  uaFullVersion: string;
  platform: string;
  platformVersion: string;
  architecture: string;
  bitness: string;
  model: string;
  mobile: boolean;
  wow64: boolean;
};

/**
 * The browser's own client hints, exactly as it reports them (brand order,
 * OS version and all). They only show on a secure page, so a throwaway page
 * loads a stand-in https address served from here, never the network.
 */
async function ownClientHints(context: BrowserContext): Promise<ClientHints> {
  const page = await context.newPage();
  try {
    await page.route("https://kyrelo.invalid/", (r) => r.fulfill({ body: "<html></html>", contentType: "text/html" }));
    await page.goto("https://kyrelo.invalid/");
    return await page.evaluate(() =>
      (navigator as unknown as { userAgentData: { getHighEntropyValues(k: string[]): Promise<ClientHints> } }).userAgentData.getHighEntropyValues(
        ["architecture", "bitness", "fullVersionList", "model", "platformVersion", "uaFullVersion", "wow64"],
      ),
    );
  } finally {
    await page.close();
  }
}

/**
 * Makes a headless page report the normal Chrome it is. Headless Chrome's
 * client hints already match the visible browser; only its user agent says
 * "HeadlessChrome". Overriding the user agent drops the hints unless they are
 * passed too, so the browser's own go back in unchanged.
 */
async function presentAsChrome(context: BrowserContext, page: Page, hints: ClientHints): Promise<void> {
  const cdp = await context.newCDPSession(page);
  const { userAgent } = await cdp.send("Browser.getVersion");
  await cdp.send("Network.setUserAgentOverride", {
    userAgent: userAgent.replace("HeadlessChrome", "Chrome"),
    userAgentMetadata: {
      brands: hints.brands,
      fullVersionList: hints.fullVersionList,
      fullVersion: hints.uaFullVersion,
      platform: hints.platform,
      platformVersion: hints.platformVersion,
      architecture: hints.architecture,
      bitness: hints.bitness,
      model: hints.model,
      mobile: hints.mobile,
      wow64: hints.wow64,
    },
  });
}

// Per-profile mutex, keyed `platform:accountId`. launchPersistentContext locks
// the profile dir, so two concurrent opens of the same profile collide on
// Chrome's SingletonLock. This chain queues all consumers (worker crons,
// UI-triggered routes, and the connect flow when it replaces a profile dir)
// inside a single Node process.
//
// All of it lives on globalThis: Next's dev server reloads modules after an
// edit, and a second copy of this state would let two Chromes open the same
// profile, or count no open browsers and sweep away one in use.
const shared = ((globalThis as { __kyreloBrowserState?: BrowserState }).__kyreloBrowserState ??= {
  browserLocks: {},
  lockWaiters: {},
  postWaiters: {},
  lockHolders: {},
  openBrowserCount: 0,
});

interface BrowserState {
  browserLocks: Record<string, Promise<void>>;
  /** How many callers are queued behind the current holder, per lock key… */
  lockWaiters: Record<string, number>;
  /** …and how many of those are posts. */
  postWaiters: Record<string, number>;
  /** What currently holds each lock, for the "waited for the browser" log. */
  lockHolders: Record<string, string>;
  /** Our browsers open right now, on any profile. */
  openBrowserCount: number;
}
const { browserLocks, lockWaiters, postWaiters, lockHolders } = shared;

export async function acquireBrowserLock(platform: string, purpose = "unknown"): Promise<() => void> {
  const prev = browserLocks[platform] ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((r) => (release = r));
  browserLocks[platform] = prev.then(() => current);
  const isPost = purpose === "post";
  lockWaiters[platform] = (lockWaiters[platform] ?? 0) + 1;
  if (isPost) postWaiters[platform] = (postWaiters[platform] ?? 0) + 1;
  const heldBy = lockHolders[platform];
  const waitStart = Date.now();
  try {
    await prev;
  } finally {
    lockWaiters[platform]--;
    if (isPost) postWaiters[platform]--;
  }
  const waitedSec = Math.round((Date.now() - waitStart) / 1000);
  if (waitedSec >= 5) {
    console.log(`[session] ${purpose} waited ${waitedSec}s for the ${platform} browser (held by: ${heldBy ?? "unknown"})`);
  }
  lockHolders[platform] = purpose;
  return () => {
    delete lockHolders[platform];
    release();
  };
}

/**
 * True when anything is queued for this account's browser. The Monitor's
 * scraper checks this and hands over at once: its checks are short and pick
 * up where they left off next time.
 */
export function browserHasWaiters(platform: string, accountId: string): boolean {
  return (lockWaiters[`${platform}:${accountId}`] ?? 0) > 0;
}

/**
 * True when a post is queued for this account's browser. Long jobs the user
 * started (Deleter, Unfollow) check this and stop early so posts go out on
 * time; anything else, like the Monitor's next check, waits for them.
 */
export function postWaitingForBrowser(platform: string, accountId: string): boolean {
  return (postWaiters[`${platform}:${accountId}`] ?? 0) > 0;
}

// Strip files that make Chrome refuse to start cleanly on a profile dir:
//
//  - Singleton{Lock,Cookie,Socket} — stale lock files left by crashed runs;
//    without removing them the next launch fails to create a ProcessSingleton.
//
//  - "Last Version" — the Connect flow opens this profile with the user's real
//    (auto-updating) Chrome, which stamps the dir with that version. Chrome
//    refuses to open a profile stamped by a NEWER build (exit code 21), which
//    also bites when Chrome is later downgraded or only the bundled Chromium
//    is available. Dropping the stamp lets it start; openBrowser prefers the
//    user's own Chrome so this is rarely needed.
//
// Safe: the per-profile lock above and the app's single-instance lock mean
// only one browser touches the dir.
async function clearStaleProfileLocks(dir: string) {
  for (const name of [
    "SingletonLock",
    "SingletonCookie",
    "SingletonSocket",
    "Last Version",
  ]) {
    await fs.rm(path.join(dir, name), { force: true }).catch(() => {});
  }
}

// A leaked scrape browser (chrome-headless-shell) — from a crashed scrape or
// an unclean app shutdown — keeps its profile dir locked, so the next launch
// dies with "Target page, context or browser has been closed". Kill any stray
// headless shell before launching so a leak can never block us. Safe: that
// process name is exclusively Playwright's headless browser — it is never the
// user's own Chrome (chrome.exe). Always resolves; never throws into caller.
//
// Only when none of our own browsers are open: the lock is per account, so a
// screenshot or a second account can launch while another browser is mid-job,
// and the sweep would kill it.

function killStrayHeadlessShells(): Promise<void> {
  return new Promise((resolve) => {
    const [cmd, args]: [string, string[]] =
      process.platform === "win32"
        ? ["taskkill", ["/F", "/T", "/IM", "chrome-headless-shell.exe"]]
        : ["pkill", ["-f", "chrome-headless-shell"]];
    try {
      execFile(cmd, args, (_err, stdout) => {
        // taskkill reports each kill; pkill prints nothing.
        const killed = (String(stdout).match(/SUCCESS/g) ?? []).length;
        if (killed > 0) {
          console.log(`[session] swept ${killed} stray headless browser(s) before launch`);
        }
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

export async function openBrowser(
  platform: string,
  opts: OpenOptions,
): Promise<BrowserHandle> {
  const headless = opts.headless ?? process.env.BROWSER_HEADLESS !== "false";
  const channel = process.env.BROWSER_CHANNEL ?? "chrome";
  const dir = userDataDir(platform, opts.accountId);
  const lockKey = `${platform}:${opts.accountId}`;

  const release = await acquireBrowserLock(lockKey, opts.purpose);
  let context: BrowserContext | undefined;
  try {
    await fs.mkdir(dir, { recursive: true });
    if (shared.openBrowserCount === 0) await killStrayHeadlessShells();
    await clearStaleProfileLocks(dir);

    // launchPersistentContext = the browser thinks it's "your normal Chrome with
    // the same profile dir each time." History, GPU caches, fonts, even cookies
    // all persist exactly as a real user accumulates them. Strongest free win
    // against fingerprint-based detection.
    // No user agent, locale or timezone of our own: the real Chrome's (see
    // presentAsChrome). Headless needs a window size; a visible window keeps
    // its natural one.
    const launchOptions = {
      headless,
      viewport: headless ? { width: 1366, height: 820 } : null,
      args: ["--disable-blink-features=AutomationControlled"],
      ignoreDefaultArgs: ["--enable-automation"],
    };

    // Use the same Chrome the connect flow logs in with (findChrome in
    // system-chrome.ts). Playwright's channel="chrome" only looks in
    // /Applications on macOS, so a Chrome installed elsewhere (e.g.
    // ~/Applications) used to fall back to the bundled Chromium. That is older
    // than the Chrome that wrote the account's profile, so Chrome showed
    // "Something went wrong when opening your profile". If the user's Chrome
    // exists but won't start, say so rather than open the profile with an
    // older browser.
    const chromePath = channel === "chrome" ? findChrome() : null;
    if (chromePath) {
      try {
        context = await chromium.launchPersistentContext(dir, { ...launchOptions, executablePath: chromePath });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Couldn't start Google Chrome (${chromePath}): ${message}`);
      }
    } else if (channel === "chrome") {
      console.warn("[browser] Google Chrome not found — using the bundled Chromium.");
      context = await chromium.launchPersistentContext(dir, launchOptions);
    } else {
      context = await chromium.launchPersistentContext(dir, { ...launchOptions, channel });
    }

    shared.openBrowserCount++;
    // Non-optional alias: close() below runs later, where `context` isn't narrowed.
    const launched = context;

    // Inject cookies saved by the Connect flow.
    const sidecar = path.join(dir, "kyrelo-cookies.json");
    try {
      const raw = await fs.readFile(sidecar, "utf8");
      const parsed = JSON.parse(raw) as { cookies?: unknown };
      if (Array.isArray(parsed.cookies) && parsed.cookies.length > 0) {
        await launched.addCookies(parsed.cookies as Parameters<typeof launched.addCookies>[0]);
        const hasAuth = (parsed.cookies as { name?: string }[]).some((c) => c.name === "auth_token");
        console.log(
          `[session] openBrowser(${platform}/${opts.accountId}): injected ${parsed.cookies.length} cookies, auth_token=${hasAuth}`,
        );
      } else {
        console.log(
          `[session] openBrowser(${platform}/${opts.accountId}): sidecar exists but empty`,
        );
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        console.log(`[session] openBrowser(${platform}/${opts.accountId}): no cookie sidecar`);
      } else {
        console.warn(`[session] sidecar read failed:`, err);
      }
    }

    const page = launched.pages()[0] ?? (await launched.newPage());
    if (headless) {
      try {
        const hints = await ownClientHints(launched);
        await presentAsChrome(launched, page, hints);
        launched.on("page", (p) => void presentAsChrome(launched, p, hints).catch(() => {}));
      } catch (err) {
        console.warn("[session] couldn't present as Chrome:", err);
      }
    }
    console.log(
      `[session] openBrowser(${platform}/${opts.accountId}): ready, headless=${headless}`,
    );

    return {
      context: launched,
      page,
      async close() {
        try {
          await launched.close();
        } finally {
          shared.openBrowserCount--;
          release();
        }
      },
    };
  } catch (err) {
    // Launched but failed during setup: close it, or the browser outlives the
    // lock and keeps the profile dir busy.
    if (context) {
      await context.close().catch(() => {});
      shared.openBrowserCount--;
    }
    release();
    throw err;
  }
}

/** Throws if X bounced the page to its login screen (the saved session expired). */
export function assertLoggedIn(page: Page) {
  const url = page.url();
  if (url.includes("/login") || url.includes("/i/flow/login")) {
    throw new Error("X session expired. Reconnect under Connected accounts.");
  }
}

export function jitter(min: number, max: number): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((r) => setTimeout(r, ms));
}

function keystrokeDelay(): number {
  const r = Math.random();
  if (r < 0.82) return 55 + Math.random() * 80;     // normal flow: 55–135ms
  if (r < 0.96) return 180 + Math.random() * 220;   // small pauses: 180–400ms
  return 500 + Math.random() * 700;                 // rare longer pause: 0.5–1.2s
}

/**
 * Type into the focused element with realistic, variable per-key timing plus
 * pauses after punctuation and the occasional "thinking" gap. Doesn't simulate
 * typos — the final text needs to match exactly.
 */
export async function humanType(
  page: Page,
  text: string,
  opts: { thinkRate?: number; speed?: number } = {},
): Promise<void> {
  const thinkRate = opts.thinkRate ?? 0.035;
  const speed = opts.speed ?? 1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1] ?? "";

    if (prev === "." || prev === "!" || prev === "?") {
      await jitter(320 * speed, 760 * speed);
    } else if (prev === "," || prev === ";" || prev === ":") {
      await jitter(140 * speed, 320 * speed);
    } else if (prev === "\n") {
      await jitter(220 * speed, 600 * speed);
    }

    if (prev === " " && Math.random() < thinkRate) {
      await jitter(700 * speed, 2200 * speed);
    }

    await page.keyboard.type(ch, { delay: keystrokeDelay() * speed });
  }
}

// Browse the platform like a person about to scrape: scroll the feed, dwell,
// hover a couple of items. Wrapped in try/catch by callers — warmup failure
// must never block the actual scrape.
export async function warmup(page: Page, feedUrl: string): Promise<void> {
  await page.goto(feedUrl, { waitUntil: "domcontentloaded" });
  await jitter(2000, 4000);

  // Scroll down 3-6 times with realistic pauses
  const scrolls = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < scrolls; i++) {
    await page.mouse.wheel(0, 250 + Math.random() * 400);
    await jitter(800, 2200);
  }

  // Hover on a few articles/tweets if any are present
  const articles = page.locator("article").first();
  try {
    if (await articles.isVisible({ timeout: 1500 })) {
      await articles.hover();
      await jitter(900, 1800);
    }
  } catch {
    // no articles in DOM — skip
  }

  // Small scroll-up so we're not at the bottom
  await page.mouse.wheel(0, -(200 + Math.random() * 400));
  await jitter(600, 1200);
}
