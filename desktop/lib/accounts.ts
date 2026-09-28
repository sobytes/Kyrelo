import { promises as fs } from "node:fs";
import { acquireBrowserLock, userDataDir } from "./browser/session";
import { connectingPlatform, saveAccount } from "./browser-connect";
import { createSession } from "./bluesky";
import { PLATFORMS } from "./platforms";
import { listAccounts, modifyAccounts, setAccountSecret } from "./storage";
import { PlatformId } from "./types";

/** Connects a Bluesky account after checking the app password with Bluesky. */
export async function connectBluesky(
  identifier: string,
  appPassword: string,
): Promise<{ ok: true; handle: string } | { error: string }> {
  if (!identifier.trim() || !appPassword.trim()) return { error: "Enter your Bluesky handle and an app password." };
  let handle: string;
  try {
    ({ handle } = await createSession(identifier.trim(), appPassword.trim()));
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  const id = handle.toLowerCase();
  await setAccountSecret("bluesky", id, { appPassword: appPassword.trim() });
  await saveAccount({ platform: "bluesky", id, handle, addedAt: new Date().toISOString() });
  return { ok: true, handle };
}

export async function disconnectAccount(
  platform: PlatformId,
  id: string,
): Promise<{ ok: true } | { error: string }> {
  if (connectingPlatform()) return { error: "Cancel the connect flow first." };
  if (PLATFORMS[platform].connect === "browser") {
    // Wait for any job using this account's browser before deleting its profile.
    const release = await acquireBrowserLock(`${platform}:${id}`, "disconnect");
    try {
      await fs.rm(userDataDir(platform, id), { recursive: true, force: true }).catch(() => {});
    } finally {
      release();
    }
  } else {
    await setAccountSecret(platform, id, null);
  }
  await modifyAccounts((accounts) => accounts.filter((a) => !(a.platform === platform && a.id === id)));
  return { ok: true };
}

/** The X account the Monitor reads timelines with: the first one connected. */
export async function defaultXAccountId(): Promise<string | null> {
  return (await listAccounts("twitter"))[0]?.id ?? null;
}
