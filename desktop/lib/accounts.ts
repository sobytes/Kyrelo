import { promises as fs } from "node:fs";
import { acquireBrowserLock, userDataDir } from "./browser/session";
import { connectingPlatform, saveAccount } from "./browser-connect";
import { randomBytes } from "node:crypto";
import { createSession } from "./bluesky";
import { authorizeUrl, exchangeCode, normalizeInstance, registerApp, verifyCredentials } from "./mastodon";
import { CredentialField, PLATFORMS } from "./platforms";
import { verifyToken } from "./threads";
import { verifyTelegram } from "./telegram";
import { verifyDiscordWebhook } from "./discord";
import { verifyLinkedInToken } from "./linkedin";
import * as tiktok from "./tiktok";
import { slackWebhookId } from "./slack";
import { verifyDevTo } from "./devto";
import { normalizeHost, verifyHashnode } from "./hashnode";
import { normalizeSite, verifyWordPress } from "./wordpress";
import * as youtube from "./youtube";
import { AccountSecret, listAccounts, modifyAccounts, setAccountSecret } from "./storage";
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
  async telegram({ token = "", handle = "" }) {
    if (!token.trim() || !handle.trim()) return { error: "Enter your bot token and channel." };
    let chat;
    try {
      chat = await verifyTelegram(token.trim(), handle);
    } catch (err) {
      return { error: message(err) };
    }
    const id = chat.handle.toLowerCase();
    await setAccountSecret("telegram", id, { token: token.trim(), userId: chat.chatId });
    await saveAccount({ platform: "telegram", id, handle: chat.handle, addedAt: new Date().toISOString() });
    return { ok: true, handle: chat.handle };
  },
  async discord({ webhookUrl = "" }) {
    let hook;
    try {
      hook = await verifyDiscordWebhook(webhookUrl);
    } catch (err) {
      return { error: message(err) };
    }
    // The webhook's id, not its name: several webhooks can share a name.
    await setAccountSecret("discord", hook.id, { token: webhookUrl.trim(), userId: hook.guild_id });
    await saveAccount({ platform: "discord", id: hook.id, handle: hook.name, addedAt: new Date().toISOString() });
    return { ok: true, handle: hook.name };
  },
  async linkedin({ token = "" }) {
    if (!token.trim()) return { error: "Paste your LinkedIn access token." };
    let me;
    try {
      me = await verifyLinkedInToken(token.trim());
    } catch (err) {
      return { error: message(err) };
    }
    // LinkedIn has no @handle through this API, so the member id identifies the account.
    await setAccountSecret("linkedin", me.sub, { token: token.trim(), userId: me.sub });
    await saveAccount({ platform: "linkedin", id: me.sub, handle: me.name, addedAt: new Date().toISOString() });
    return { ok: true, handle: me.name };
  },
  async slack({ webhookUrl = "", handle = "" }) {
    const id = slackWebhookId(webhookUrl);
    if (!id) return { error: "That isn't a Slack webhook URL. It starts with https://hooks.slack.com/services/." };
    const name = handle.trim() || "Slack";
    await setAccountSecret("slack", id.toLowerCase(), { token: webhookUrl.trim() });
    await saveAccount({ platform: "slack", id: id.toLowerCase(), handle: name, addedAt: new Date().toISOString() });
    return { ok: true, handle: name };
  },
  async devto({ token = "" }) {
    if (!token.trim()) return { error: "Paste your DEV API key." };
    let me;
    try {
      me = await verifyDevTo(token.trim());
    } catch (err) {
      return { error: message(err) };
    }
    const id = me.username.toLowerCase();
    await setAccountSecret("devto", id, { token: token.trim() });
    await saveAccount({ platform: "devto", id, handle: me.username, addedAt: new Date().toISOString() });
    return { ok: true, handle: me.username };
  },
  async hashnode({ token = "", site = "" }) {
    if (!token.trim() || !site.trim()) return { error: "Enter your token and your blog's address." };
    let blog;
    try {
      blog = await verifyHashnode(token.trim(), site);
    } catch (err) {
      return { error: message(err) };
    }
    const id = normalizeHost(site);
    await setAccountSecret("hashnode", id, { token: token.trim(), userId: blog.id });
    await saveAccount({ platform: "hashnode", id, handle: id, addedAt: new Date().toISOString() });
    return { ok: true, handle: id };
  },
  async wordpress({ site = "", handle = "", appPassword = "" }) {
    const url = normalizeSite(site);
    if (!url || !handle.trim() || !appPassword.trim()) return { error: "Enter your site, username and application password." };
    const login = { site: url, username: handle.trim(), appPassword: appPassword.trim() };
    try {
      await verifyWordPress(login);
    } catch (err) {
      return { error: message(err) };
    }
    const id = `${login.username}@${url.replace(/^https?:\/\//, "")}`.toLowerCase();
    await setAccountSecret("wordpress", id, { instance: url, userId: login.username, appPassword: login.appPassword });
    await saveAccount({ platform: "wordpress", id, handle: id, addedAt: new Date().toISOString() });
    return { ok: true, handle: id };
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

// --- Your own developer app: approve Kyrelo in the browser -------------------------

interface AppConnector {
  /** `verifier` is the sign-in's PKCE code verifier, for platforms that require PKCE. */
  authorizeUrl: (clientId: string, redirectUri: string, state: string, verifier: string) => string;
  /** Swaps the code for credentials and reads which account they're for. */
  finish: (app: { clientId: string; clientSecret: string }, code: string, redirectUri: string, verifier: string) => Promise<{
    id: string;
    handle: string;
    secret: AccountSecret;
  }>;
}

/**
 * Platforms that connect through an OAuth client the user makes in their own
 * developer account (PLATFORMS[..].connect "app"): they paste its id and
 * secret, approve Kyrelo in the browser, and the platform redirects back to
 * /api/accounts/oauth/callback on this computer.
 */
const APP_CONNECTORS: Partial<Record<PlatformId, AppConnector>> = {
  youtube: {
    authorizeUrl: (clientId, redirectUri, state) => youtube.authorizeUrl(clientId, redirectUri, state),
    async finish(app, code, redirectUri) {
      const refreshToken = await youtube.exchangeCode(app, code, redirectUri);
      const channel = await youtube.myChannel(await youtube.accessToken(app, refreshToken));
      return {
        id: channel.id,
        handle: channel.handle?.replace(/^@/, "") ?? channel.title,
        secret: { clientId: app.clientId, clientSecret: app.clientSecret, token: refreshToken, userId: channel.id },
      };
    },
  },
  tiktok: {
    authorizeUrl: (clientKey, redirectUri, state, verifier) => tiktok.authorizeUrl(clientKey, redirectUri, state, verifier),
    async finish(app, code, redirectUri, verifier) {
      const tokens = await tiktok.exchangeCode(app, code, redirectUri, verifier);
      const user = await tiktok.userInfo(tokens.access_token);
      return {
        id: user.open_id,
        handle: user.display_name,
        secret: { clientId: app.clientId, clientSecret: app.clientSecret, token: tokens.refresh_token, userId: user.open_id },
      };
    },
  },
};

interface PendingApp {
  platform: PlatformId;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** PKCE code verifier, sent with the code (TikTok requires it). */
  verifier: string;
  expires: number;
}

const pendingApps = ((globalThis as { __kyreloAppConnects?: Map<string, PendingApp> }).__kyreloAppConnects ??= new Map<string, PendingApp>());

/** Returns the platform's page where the user approves their own app's access to their account. */
export function startAppConnect(platform: PlatformId, fields: Fields, redirectUri: string): { authorizeUrl: string } | { error: string } {
  const connector = APP_CONNECTORS[platform];
  if (!connector) return { error: `${PLATFORMS[platform].label} doesn't connect this way.` };
  const clientId = fields.clientId?.trim() ?? "";
  const clientSecret = fields.clientSecret?.trim() ?? "";
  if (!clientId || !clientSecret) return { error: "Paste your app's client ID and client secret." };
  const state = randomBytes(24).toString("base64url");
  for (const [key, p] of pendingApps) if (p.expires < Date.now()) pendingApps.delete(key);
  const verifier = randomBytes(32).toString("base64url");
  pendingApps.set(state, { platform, clientId, clientSecret, redirectUri, verifier, expires: Date.now() + SIGN_IN_WINDOW_MS });
  return { authorizeUrl: connector.authorizeUrl(clientId, redirectUri, state, verifier) };
}

/** The platform redirected back: finish signing in and save the account. */
export async function finishAppConnect(state: string, code: string): Promise<ConnectResult & { platform?: PlatformId }> {
  const pending = pendingApps.get(state);
  pendingApps.delete(state);
  if (!pending || pending.expires < Date.now()) return { error: "This sign-in link has expired. Start again from Kyrelo." };
  const { platform } = pending;
  try {
    const { id, handle, secret } = await APP_CONNECTORS[platform]!.finish(pending, code, pending.redirectUri, pending.verifier);
    await setAccountSecret(platform, id, secret);
    await saveAccount({ platform, id, handle, addedAt: new Date().toISOString() });
    return { ok: true, handle, platform };
  } catch (err) {
    return { error: message(err), platform };
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
  }
  // Browser accounts can have one too: Instagram and Facebook's comment token.
  await setAccountSecret(platform, id, null);
  await modifyAccounts((accounts) => accounts.filter((a) => !(a.platform === platform && a.id === id)));
  return { ok: true };
}

/** The X account the Monitor reads timelines with: the first one connected. */
export async function defaultXAccountId(): Promise<string | null> {
  return (await listAccounts("twitter"))[0]?.id ?? null;
}
