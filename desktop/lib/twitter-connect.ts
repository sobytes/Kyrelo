import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ChromeNotFoundError,
  launchSystemChrome,
  SystemChromeHandle,
} from "./browser/system-chrome";
import { listXAccounts, saveXAccounts } from "./storage";
import { XAccount } from "./types";

interface ActiveConnect {
  handle: SystemChromeHandle;
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

function userdataRoot(): string {
  return path.join(
    process.env.STORAGE_DIR ?? path.join(process.cwd(), ".data"),
    "userdata",
    "twitter",
  );
}

function profileDir(accountId: string): string {
  return path.join(userdataRoot(), accountId);
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

export function isConnectActive(): boolean {
  return getActive() !== null;
}

export async function listXConnectedAccounts(): Promise<XAccount[]> {
  return listXAccounts();
}

export async function startTwitterConnect(): Promise<
  { ok: true } | { error: string; chromeMissing?: boolean }
> {
  if (getActive()) {
    console.log("[twitter-connect] start: already connecting");
    return { error: "Already connecting an account." };
  }

  const pendingId = `_pending_${randomUUID()}`;
  const dir = profileDir(pendingId);
  console.log(`[twitter-connect] start: pendingId=${pendingId}`);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Couldn't create profile dir: ${message}` };
  }

  let handle: SystemChromeHandle;
  try {
    handle = await launchSystemChrome(dir, "https://x.com/login");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[twitter-connect] start: launch failed:", message);
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    if (err instanceof ChromeNotFoundError) {
      return { error: message, chromeMissing: true };
    }
    return { error: message };
  }

  setActive({ handle, pendingId });
  console.log("[twitter-connect] start: ok, active set");
  return { ok: true };
}

export async function endTwitterConnect(): Promise<
  { ok: true; handle: string } | { error: string }
> {
  const current = getActive();
  if (!current) {
    console.log("[twitter-connect] end: no active session");
    return { error: "not connecting" };
  }
  const { handle, pendingId } = current;
  setActive(null);
  console.log(`[twitter-connect] end: pendingId=${pendingId}`);

  let cookies: Awaited<ReturnType<typeof handle.context.cookies>> = [];
  let loggedIn = false;
  try {
    cookies = await handle.context.cookies();
    const authCookie = cookies.find(
      (c) => c.name === "auth_token" && !!c.value && /\.x\.com$|x\.com$|twitter\.com$/.test(c.domain),
    );
    loggedIn = !!authCookie;
    console.log(
      `[twitter-connect] end: cookies=${cookies.length}, auth_token=${loggedIn ? `found (domain=${authCookie?.domain})` : "MISSING"}`,
    );
  } catch (err) {
    console.warn("[twitter-connect] cookie check failed:", err);
  }

  let capturedHandle: string | null = null;
  if (loggedIn) {
    capturedHandle = await captureHandleWithTimeout(handle, 12_000);
    console.log(`[twitter-connect] end: captured handle=${capturedHandle ?? "null"}`);
  }

  try {
    await handle.close();
  } catch (err) {
    console.warn("[twitter-connect] close failed:", err);
  }

  if (!loggedIn) {
    await fs.rm(profileDir(pendingId), { recursive: true, force: true }).catch(() => {});
    return {
      error:
        "Not signed in to X yet. Finish sign-in in the Chrome window, then click \"I'm logged in\" again.",
    };
  }

  if (!capturedHandle) {
    await fs.rm(profileDir(pendingId), { recursive: true, force: true }).catch(() => {});
    return { error: "Logged in but couldn't read your @handle. Try Connect again." };
  }

  const id = capturedHandle.toLowerCase();
  const finalDir = profileDir(id);
  console.log(`[twitter-connect] end: renaming ${pendingId} → ${id} at ${finalDir}`);
  await fs.rm(finalDir, { recursive: true, force: true }).catch(() => {});
  try {
    await renameWithRetry(profileDir(pendingId), finalDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[twitter-connect] end: profile rename failed:", message);
    await fs.rm(profileDir(pendingId), { recursive: true, force: true }).catch(() => {});
    return {
      error:
        "Signed in to X, but couldn't save the session — Chrome still had the " +
        "profile files locked. Close any open Chrome windows, then click Connect again.",
    };
  }

  const sidecarPath = path.join(finalDir, "kyrelo-cookies.json");
  try {
    await fs.writeFile(
      sidecarPath,
      JSON.stringify({ savedAt: new Date().toISOString(), cookies }, null, 2),
    );
    console.log(`[twitter-connect] end: wrote ${cookies.length} cookies → ${sidecarPath}`);
  } catch (err) {
    console.warn("[twitter-connect] cookie sidecar write failed:", err);
  }

  const accounts = await listXAccounts();
  const acct: XAccount = { id, handle: capturedHandle, addedAt: new Date().toISOString() };
  const existing = accounts.findIndex((a) => a.id === id);
  if (existing >= 0) accounts[existing] = acct;
  else accounts.push(acct);
  await saveXAccounts(accounts);

  return { ok: true, handle: capturedHandle };
}

export async function cancelTwitterConnect(): Promise<{ ok: true }> {
  const current = getActive();
  if (!current) return { ok: true };
  const { handle, pendingId } = current;
  setActive(null);
  try {
    await handle.close();
  } catch (err) {
    console.warn("[twitter-connect] cancel close failed:", err);
  }
  await fs.rm(profileDir(pendingId), { recursive: true, force: true }).catch(() => {});
  return { ok: true };
}

export async function disconnectXAccount(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  if (getActive()) return { error: "Cancel the connect flow first." };
  await fs.rm(profileDir(id), { recursive: true, force: true }).catch(() => {});
  const accounts = await listXAccounts();
  await saveXAccounts(accounts.filter((a) => a.id !== id));
  return { ok: true };
}

export async function getDefaultAccountId(): Promise<string | null> {
  const accs = await listXAccounts();
  return accs[0]?.id ?? null;
}

async function captureHandleWithTimeout(
  handle: SystemChromeHandle,
  timeoutMs: number,
): Promise<string | null> {
  const work = (async (): Promise<string | null> => {
    try {
      await handle.page.goto("https://x.com/home", {
        waitUntil: "domcontentloaded",
        timeout: 7_000,
      });
      const link = handle.page.locator('a[data-testid="AppTabBar_Profile_Link"]').first();
      try {
        await link.waitFor({ state: "visible", timeout: 5_000 });
        const href = await link.getAttribute("href");
        if (href) return href.replace(/^\//, "");
      } catch {
        // try the API fallback
      }
      const res = await handle.context.request.get(
        "https://api.x.com/1.1/account/settings.json",
        { timeout: 6_000 },
      );
      if (res.ok()) {
        const json = (await res.json()) as { screen_name?: string };
        if (typeof json.screen_name === "string") return json.screen_name;
      }
    } catch (err) {
      console.warn("[twitter-connect] handle capture inner failed:", err);
    }
    return null;
  })();

  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([work, timeout]);
}
