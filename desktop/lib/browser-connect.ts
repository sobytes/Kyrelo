import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ChromeNotFoundError,
  killChromeTree,
  launchSystemChrome,
  SystemChromeHandle,
} from "./browser/system-chrome";
import { acquireBrowserLock, userDataDir } from "./browser/session";
import { PLATFORMS } from "./platforms";
import { modifyAccounts } from "./storage";
import { Account, PlatformId } from "./types";

// Connecting an account on a browser platform: open the user's real Chrome on
// the platform's login page with a fresh profile, let them sign in (any
// method, including Google/Apple), then keep that profile for posting. The
// flow is the same for every browser platform; only the login cookie and how
// to read the signed-in handle differ (BrowserLogin below).

/** What differs per browser platform. */
interface BrowserLogin {
  /** True if the cookies show a signed-in session. */
  isSignedIn(cookies: Awaited<ReturnType<SystemChromeHandle["context"]["cookies"]>>): boolean;
  /** The signed-in account's handle, read from the logged-in browser. */
  readHandle(chrome: SystemChromeHandle): Promise<string | null>;
}

const LOGINS: Partial<Record<PlatformId, BrowserLogin>> = {
  twitter: {
    isSignedIn: (cookies) =>
      cookies.some((c) => c.name === "auth_token" && !!c.value && /(^|\.)(x|twitter)\.com$/.test(c.domain)),
    async readHandle(chrome) {
      await chrome.page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 7_000 });
      const link = chrome.page.locator('a[data-testid="AppTabBar_Profile_Link"]').first();
      try {
        await link.waitFor({ state: "visible", timeout: 5_000 });
        const href = await link.getAttribute("href");
        if (href) return href.replace(/^\//, "");
      } catch {
        // try the API fallback
      }
      const res = await chrome.context.request.get("https://api.x.com/1.1/account/settings.json", {
        timeout: 6_000,
      });
      if (!res.ok()) return null;
      const json = (await res.json()) as { screen_name?: string };
      return typeof json.screen_name === "string" ? json.screen_name : null;
    },
  },
  instagram: {
    isSignedIn: (cookies) =>
      cookies.some((c) => c.name === "sessionid" && !!c.value && /(^|\.)instagram\.com$/.test(c.domain)),
    async readHandle(chrome) {
      // Instagram's own web app asks this endpoint for the signed-in user, with
      // its public web app id.
      const res = await chrome.context.request.get("https://www.instagram.com/api/v1/accounts/current_user/?edit=true", {
        headers: { "X-IG-App-ID": "936619743392459" },
        timeout: 8_000,
      });
      if (!res.ok()) return null;
      const json = (await res.json().catch(() => null)) as { user?: { username?: string } } | null;
      return typeof json?.user?.username === "string" ? json.user.username : null;
    },
  },
};

interface ActiveConnect {
  platform: PlatformId;
  chrome: SystemChromeHandle;
  pendingId: string;
}

// Stash on globalThis so Next dev HMR doesn't wipe the in-progress connect
// state when an unrelated file changes between Start and "I'm logged in".
declare global {
  // eslint-disable-next-line no-var
  var __kyreloConnectActive: ActiveConnect | null | undefined;
}

function getActive(): ActiveConnect | null {
  return globalThis.__kyreloConnectActive ?? null;
}

function setActive(v: ActiveConnect | null): void {
  globalThis.__kyreloConnectActive = v;
}

// The connect flow's Chrome is spawned by us and only attached over CDP, so
// nothing else closes it. If the app quits mid-connect (Electron stops this
// server), kill it rather than leave a Chrome with an open debugging port.
// "exit" handlers must be synchronous; killChromeTree only starts a kill.
// Registered once per process (dev hot-reload re-runs this module).
const G = globalThis as { __kyreloConnectExitHook?: boolean };
if (!G.__kyreloConnectExitHook) {
  G.__kyreloConnectExitHook = true;
  process.once("exit", () => {
    const active = getActive();
    if (active) killChromeTree(active.chrome.proc);
  });
}

// Set synchronously before the first await in startBrowserConnect, so a
// double-click can't launch two Chromes while the first is still starting.
let starting: PlatformId | null = null;

/** The platform whose connect flow is in progress, if any. */
export function connectingPlatform(): PlatformId | null {
  return starting ?? getActive()?.platform ?? null;
}

// Windows keeps file handles on a Chrome profile dir open briefly after the
// browser exits, so renaming the dir can fail with EPERM/EBUSY for a short
// window. Retry with backoff to give the OS time to release the locks.
async function renameWithRetry(from: string, to: string): Promise<void> {
  const transient = new Set(["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"]);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (!transient.has(code)) throw err;
      await new Promise((r) => setTimeout(r, 200 + attempt * 200));
    }
  }
  throw lastErr;
}

export async function startBrowserConnect(
  platform: PlatformId,
): Promise<{ ok: true } | { error: string; chromeMissing?: boolean }> {
  if (!LOGINS[platform]) return { error: `${PLATFORMS[platform].label} doesn't connect through the browser.` };
  if (connectingPlatform()) {
    console.log("[connect] start: already connecting");
    return { error: "Already connecting an account." };
  }
  starting = platform;
  try {
    return await launchConnect(platform);
  } finally {
    starting = null;
  }
}

async function launchConnect(platform: PlatformId): Promise<{ ok: true } | { error: string; chromeMissing?: boolean }> {
  const pendingId = `_pending_${randomUUID()}`;
  const dir = userDataDir(platform, pendingId);
  console.log(`[connect] start: ${platform} pendingId=${pendingId}`);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Couldn't create profile dir: ${message}` };
  }

  let chrome: SystemChromeHandle;
  try {
    chrome = await launchSystemChrome(dir, PLATFORMS[platform].loginUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[connect] start: launch failed:", message);
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    if (err instanceof ChromeNotFoundError) {
      return { error: message, chromeMissing: true };
    }
    return { error: message };
  }

  setActive({ platform, chrome, pendingId });
  console.log("[connect] start: ok, active set");
  return { ok: true };
}

async function readHandleWithTimeout(login: BrowserLogin, chrome: SystemChromeHandle, timeoutMs: number) {
  const work = login.readHandle(chrome).catch((err) => {
    console.warn("[connect] handle capture failed:", err);
    return null;
  });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([work, timeout]);
}

export async function endBrowserConnect(): Promise<{ ok: true; handle: string } | { error: string }> {
  const current = getActive();
  if (!current) {
    console.log("[connect] end: no active session");
    return { error: "not connecting" };
  }
  const { platform, chrome, pendingId } = current;
  const login = LOGINS[platform]!;
  const label = PLATFORMS[platform].label;
  setActive(null);
  console.log(`[connect] end: ${platform} pendingId=${pendingId}`);

  let cookies: Awaited<ReturnType<typeof chrome.context.cookies>> = [];
  let signedIn = false;
  try {
    cookies = await chrome.context.cookies();
    signedIn = login.isSignedIn(cookies);
    console.log(`[connect] end: cookies=${cookies.length}, signed in=${signedIn}`);
  } catch (err) {
    console.warn("[connect] cookie check failed:", err);
  }

  const capturedHandle = signedIn ? await readHandleWithTimeout(login, chrome, 15_000) : null;
  console.log(`[connect] end: captured handle=${capturedHandle ?? "null"}`);

  try {
    await chrome.close();
  } catch (err) {
    console.warn("[connect] close failed:", err);
  }

  const pendingDir = userDataDir(platform, pendingId);
  if (!signedIn) {
    await fs.rm(pendingDir, { recursive: true, force: true }).catch(() => {});
    return {
      error: `Not signed in to ${label} yet. Finish sign-in in the Chrome window, then click "I'm logged in" again.`,
    };
  }
  if (!capturedHandle) {
    await fs.rm(pendingDir, { recursive: true, force: true }).catch(() => {});
    return { error: `Logged in but couldn't read your ${label} profile name. Try Connect again.` };
  }

  const id = capturedHandle.toLowerCase();
  const finalDir = userDataDir(platform, id);
  // Reconnecting an existing account replaces its profile dir. Hold that
  // account's browser lock so no post, scrape or delete job is using it.
  const release = await acquireBrowserLock(`${platform}:${id}`, "connect");
  try {
    console.log(`[connect] end: renaming ${pendingId} → ${id} at ${finalDir}`);
    await fs.rm(finalDir, { recursive: true, force: true }).catch(() => {});
    try {
      await renameWithRetry(pendingDir, finalDir);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[connect] end: profile rename failed:", message);
      await fs.rm(pendingDir, { recursive: true, force: true }).catch(() => {});
      return {
        error:
          `Signed in to ${label}, but couldn't save the session — Chrome still had the ` +
          "profile files locked. Close any open Chrome windows, then click Connect again.",
      };
    }

    // openBrowser (lib/browser/session.ts) injects these into later sessions.
    const sidecarPath = path.join(finalDir, "kyrelo-cookies.json");
    try {
      await fs.writeFile(sidecarPath, JSON.stringify({ savedAt: new Date().toISOString(), cookies }, null, 2));
      console.log(`[connect] end: wrote ${cookies.length} cookies → ${sidecarPath}`);
    } catch (err) {
      console.warn("[connect] cookie sidecar write failed:", err);
    }
  } finally {
    release();
  }

  await saveAccount({ platform, id, handle: capturedHandle, addedAt: new Date().toISOString() });
  return { ok: true, handle: capturedHandle };
}

export async function cancelBrowserConnect(): Promise<{ ok: true }> {
  const current = getActive();
  if (!current) return { ok: true };
  setActive(null);
  try {
    await current.chrome.close();
  } catch (err) {
    console.warn("[connect] cancel close failed:", err);
  }
  await fs.rm(userDataDir(current.platform, current.pendingId), { recursive: true, force: true }).catch(() => {});
  return { ok: true };
}

/** Adds the account, or replaces it if (platform, id) is already connected. */
export async function saveAccount(acct: Account): Promise<void> {
  const same = (a: Account) => a.platform === acct.platform && a.id === acct.id;
  await modifyAccounts((accounts) =>
    accounts.some(same) ? accounts.map((a) => (same(a) ? acct : a)) : [...accounts, acct],
  );
}
