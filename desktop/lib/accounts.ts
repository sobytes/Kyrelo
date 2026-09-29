import { promises as fs } from "node:fs";
import { acquireBrowserLock, userDataDir } from "./browser/session";
import { connectingPlatform, saveAccount } from "./browser-connect";
import { randomBytes } from "node:crypto";
import { createSession } from "./bluesky";
import { authorizeUrl, exchangeCode, normalizeInstance, registerApp, verifyCredentials } from "./mastodon";
import { CredentialField, PLATFORMS } from "./platforms";
import { verifyToken } from "./threads";
import { listAccounts, modifyAccounts, setAccountSecret } from "./storage";
import { PlatformId } from "./types";

type ConnectResult = { ok: true; handle: string } | { error: string };
type Fields = Partial<Record<CredentialField["key"], string>>;
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Connectors for platforms where the user types credentials (PLATFORMS[..]
 * .credentials lists the fields). Each checks them with the platform before
 * saving, so a typo fails here rather than at posting time. Mastodon
 * connects through the browser instead (startMastodonConnect).
 */
const CONNECTORS: Partial<Record<PlatformId, (fields: Fields) => Promise<ConnectResult>>> = {
  async bluesky({ handle = "", appPassword = "" }) {
    if (!handle.trim() || !appPassword.trim()) return { error: "Enter your Bluesky handle and an app password." };
    let session;
    try {
      session = await createSession(handle.trim(), appPassword.trim());
    } catch (err) {
      return { error: message(err) };
    }
    const id = session.handle.toLowerCase();
    await setAccountSecret("bluesky", id, { appPassword: appPassword.trim() });
    await saveAccount({ platform: "bluesky", id, handle: session.handle, addedAt: new Date().toISOString() });
    return { ok: true, handle: session.handle };
  },
  async threads({ token = "" }) {
    if (!token.trim()) return { error: "Paste your Threads access token." };
    let me;
    try {
      me = await verifyToken(token.trim());
    } catch (err) {
      return { error: message(err) };
    }
    const id = me.username.toLowerCase();
    await setAccountSecret("threads", id, { token: token.trim(), userId: me.id, refreshedAt: new Date().toISOString() });
    await saveAccount({ platform: "threads", id, handle: me.username, addedAt: new Date().toISOString() });
    return { ok: true, handle: me.username };
  },
};

export function connectWithCredentials(platform: PlatformId, fields: Fields): Promise<ConnectResult> {
  const connector = CONNECTORS[platform];
  return connector ? connector(fields) : Promise.resolve({ error: `${PLATFORMS[platform].label} doesn't connect this way.` });
}

// --- Mastodon: sign in through the browser ------------------------------------------

/** The phone signs in in its own browser sheet, which catches this redirect. */
export const PHONE_MASTODON_REDIRECT = "kyrelo://mastodon";

interface PendingMastodon {
  instance: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  expires: number;
}

// Sign-ins waiting for the server to redirect back, by OAuth `state`. On
// globalThis so a dev hot-reload between the two steps doesn't lose them.
const pendingMastodon = ((globalThis as { __kyreloMastodon?: Map<string, PendingMastodon> }).__kyreloMastodon ??= new Map());
const SIGN_IN_WINDOW_MS = 15 * 60_000;

/**
 * Registers Kyrelo with the user's server and returns the page where they
 * approve it. `redirectUri` is where the server sends the code: this app's
 * callback route, or the phone app (PHONE_MASTODON_REDIRECT).
 */
export async function startMastodonConnect(
  server: string,
  redirectUri: string,
): Promise<{ authorizeUrl: string } | { error: string }> {
  const instance = normalizeInstance(server);
  if (!instance) return { error: "Enter your Mastodon server, like mastodon.social." };
  let app;
  try {
    app = await registerApp(instance, redirectUri);
  } catch (err) {
    return { error: `Couldn't reach ${instance.replace("https://", "")}: ${message(err)}` };
  }
  const state = randomBytes(24).toString("base64url");
  for (const [key, p] of pendingMastodon) if (p.expires < Date.now()) pendingMastodon.delete(key);
  pendingMastodon.set(state, {
    instance,
    clientId: app.client_id,
    clientSecret: app.client_secret,
    redirectUri,
    expires: Date.now() + SIGN_IN_WINDOW_MS,
  });
  return { authorizeUrl: authorizeUrl(instance, app.client_id, redirectUri, state) };
}

/** The server redirected back: swap the code for a token and save the account. */
export async function finishMastodonConnect(state: string, code: string): Promise<ConnectResult> {
  const pending = pendingMastodon.get(state);
  pendingMastodon.delete(state);
  if (!pending || pending.expires < Date.now()) return { error: "This sign-in link has expired. Start again from Kyrelo." };
  try {
    const token = await exchangeCode(pending.instance, pending, code, pending.redirectUri);
    const me = await verifyCredentials(pending.instance, token);
    const host = new URL(pending.instance).host;
    const handle = `${me.username}@${host}`;
    const id = handle.toLowerCase();
    await setAccountSecret("mastodon", id, { instance: pending.instance, token });
    await saveAccount({ platform: "mastodon", id, handle, addedAt: new Date().toISOString() });
    return { ok: true, handle };
  } catch (err) {
    return { error: message(err) };
  }
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
