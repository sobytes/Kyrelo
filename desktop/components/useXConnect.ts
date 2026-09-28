"use client";
import { useEffect, useState } from "react";
import { XAccount } from "@/lib/types";

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

interface ConnectStatus {
  accounts: XAccount[];
  connecting: boolean;
}

async function post(body: object): Promise<{ error?: string; chromeMissing?: boolean }> {
  try {
    const res = await fetch("/api/twitter-connect", {
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
 * The X account connect flow (/api/twitter-connect): start opens Chrome for
 * the user to log in, done saves the session, cancel abandons it. Shared by
 * the Monitor and Connected pages. `status` is null until the first load.
 */
export function useXConnect() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [phase, setPhase] = useState<ConnectPhase>("idle");

  async function refresh() {
    const r = (await fetch("/api/twitter-connect").then((res) => res.json())) as ConnectStatus;
    setStatus(r);
    setPhase((p) => (r.connecting && p === "idle" ? "connecting" : p));
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, []);

  async function start() {
    setPhase("starting");
    const r = await post({ action: "start" });
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

  return { status, phase, start, done, cancel, refresh };
}
