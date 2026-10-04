"use client";
import { useEffect, useState } from "react";
import { PLATFORMS } from "@/lib/platforms";
import { Account, PlatformId } from "@/lib/types";

declare global {
  interface Window {
    electronAPI?: {
      isElectron: true;
      openExternal?: (url: string) => Promise<boolean>;
    };
  }
}

/** Opens a link in the user's browser (Electron) or a new tab (dev in a browser). */
export function openExternal(url: string) {
  if (window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export type ConnectPhase = "idle" | "starting" | "connecting" | "saving";

interface AccountsStatus {
  accounts: Account[];
  /** Platform whose browser login is in progress on the server, if any. */
  connecting: PlatformId | null;
}

async function post(body: object): Promise<{ error?: string; chromeMissing?: boolean }> {
  try {
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Connected accounts on every platform (/api/accounts), plus connecting and
 * disconnecting them. Browser platforms (X) connect in three steps:
 * start opens Chrome for the user to log in, done saves the session, cancel
 * abandons it. Bluesky connects in one step with an app password. `status` is
 * null until the first load.
 */
export function useAccounts() {
  const [status, setStatus] = useState<AccountsStatus | null>(null);
  const [phase, setPhase] = useState<ConnectPhase>("idle");
  const [phasePlatform, setPhasePlatform] = useState<PlatformId | null>(null);

  async function refresh() {
    const r = (await fetch("/api/accounts").then((res) => res.json())) as AccountsStatus;
    setStatus(r);
    // Pick up a login started elsewhere (another page, or before a reload).
    if (r.connecting) {
      setPhasePlatform(r.connecting);
      setPhase((p) => (p === "idle" ? "connecting" : p));
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, []);

  async function start(platform: PlatformId) {
    setPhasePlatform(platform);
    setPhase("starting");
    const r = await post({ action: "start", platform });
    if (!r.error) {
      setPhase("connecting");
      return;
    }
    if (r.chromeMissing) {
      if (confirm(`${r.error}\n\nOpen the Chrome download page now?`)) {
        openExternal("https://www.google.com/chrome/");
      }
    } else {
      alert(r.error);
    }
    setPhase("idle");
  }

  async function done() {
    setPhase("saving");
    const r = await post({ action: "done" });
    if (r.error) {
      alert(r.error);
      setPhase("connecting");
      return;
    }
    setPhase("idle");
    refresh();
  }

  async function cancel() {
    const r = await post({ action: "cancel" });
    if (r.error) alert(r.error);
    setPhase("idle");
    refresh();
  }

  /** Credentials the user typed (PLATFORMS[..].credentials). Returns an error message, or null on success. */
  async function connectWithCredentials(platform: PlatformId, fields: Record<string, string>): Promise<string | null> {
    const r = await post({ action: "connect", platform, fields });
    refresh();
    return r.error ?? null;
  }

  /**
   * Mastodon: opens the server's "Authorize Kyrelo?" page in the browser. The
   * account appears here (the list refreshes) once the user approves.
   */
  async function startMastodon(server: string): Promise<string | null> {
    const r = (await post({ action: "mastodon-start", server })) as { error?: string; authorizeUrl?: string };
    if (r.authorizeUrl) openExternal(r.authorizeUrl);
    return r.error ?? null;
  }

  /**
   * The user's own developer app (PLATFORMS[..].connect "app"): opens the
   * platform's approval page in the browser. The account appears here once
   * the user approves.
   */
  async function startApp(platform: PlatformId, fields: Record<string, string>): Promise<string | null> {
    const r = (await post({ action: "app-start", platform, fields })) as { error?: string; authorizeUrl?: string };
    if (r.authorizeUrl) openExternal(r.authorizeUrl);
    return r.error ?? null;
  }

  async function disconnect(account: Account) {
    const what =
      PLATFORMS[account.platform].connect === "browser"
        ? "This wipes the saved Chrome session, so you'll need to log in again to re-add it."
        : "This forgets its sign-in.";
    if (!confirm(`Disconnect ${PLATFORMS[account.platform].label} account @${account.handle}? ${what}`)) return;
    const r = await post({ action: "disconnect", platform: account.platform, accountId: account.id });
    if (r.error) alert(r.error);
    refresh();
  }

  return { status, phase, phasePlatform, start, done, cancel, connectWithCredentials, startMastodon, startApp, disconnect, refresh };
}
