import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ApiKeys,
  BrandProfile,
  Campaign,
  GrokSettings,
  GrokState,
  MediaItem,
  Account,
  PlatformId,
  ScheduledPost,
  UnfollowData,
  HandleFinderData,
} from "./types";
import { isPlatformId } from "./platforms";
import { MAX_TWEET_LENGTH } from "./tweet";

const GROK_SETTINGS_KEY = "grok-settings";
const GROK_STATE_KEY = "grok-state";
const API_KEYS_KEY = "api-keys";
const SCHEDULED_POSTS_KEY = "scheduled-posts";
const ACCOUNTS_KEY = "accounts";
// Before other platforms existed, accounts were X-only and had no `platform`.
const LEGACY_X_ACCOUNTS_KEY = "x-accounts";
const ACCOUNT_SECRETS_KEY = "account-secrets";
const MOBILE_BRIDGE_KEY = "mobile-bridge";
const CAMPAIGNS_KEY = "campaigns";
const BRAND_PROFILE_KEY = "brand-profile";
const MEDIA_LIBRARY_KEY = "media-library";
const UNFOLLOW_KEY = "unfollow";
const HANDLE_FINDER_KEY = "handle-finder";

/** Root of all local app data. Electron sets STORAGE_DIR to the OS app-data folder. */
export const dataDir = process.env.STORAGE_DIR ?? path.join(process.cwd(), ".data");

async function read<T>(key: string): Promise<T | null> {
  try {
    const buf = await fs.readFile(path.join(dataDir, `${key}.json`), "utf8");
    return JSON.parse(buf) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

// Write to a temp file, then rename over the real one. A rename replaces the
// file in one step, so quitting mid-write can't leave truncated JSON behind
// (which would make every later read throw).
async function write<T>(key: string, value: T): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, `${key}.json`);
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, file);
}

// Per-file queue for read-modify-write, the same promise-chain pattern as the
// browser lock in lib/browser/session.ts. The worker's dispatch loop, UI
// edits and campaign jobs all rewrite whole files; without this two of them
// can interleave between read and write and one change is lost.
const fileLocks: Record<string, Promise<void>> = {};

async function modify<T>(key: string, fallback: T, change: (value: T) => T): Promise<T> {
  const prev = fileLocks[key] ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((r) => (release = r));
  fileLocks[key] = prev.then(() => current);
  await prev;
  try {
    const next = change((await read<T>(key)) ?? fallback);
    await write(key, next);
    return next;
  } finally {
    release();
  }
}

const DEFAULT_GROK_SETTINGS: GrokSettings = {
  enabled: false,
  handles: [],
  keywords: [],
  includeReplies: true,
  aiProvider: "claude",
  styleHint:
    "Take a sharp devil's-advocate angle. Question an assumption, surface a downside, or argue the opposite is true.",
  notifyDesktop: true,
  headlessPosting: false,
  autopilot: {
    enabled: false,
    tone: "curious",
    style: "grok",
    minScore: 60,
    creativity: 0.7,
    topics: "",
    avoid: "",
  },
};

export async function getGrokSettings(): Promise<GrokSettings> {
  const stored = await read<Record<string, unknown>>(GROK_SETTINGS_KEY);
  if (!stored) return DEFAULT_GROK_SETTINGS;
  const legacyHandle = typeof stored.handle === "string" ? stored.handle : null;
  const handles = Array.isArray(stored.handles)
    ? (stored.handles as string[])
    : legacyHandle
      ? [legacyHandle]
      : DEFAULT_GROK_SETTINGS.handles;
  return {
    ...DEFAULT_GROK_SETTINGS,
    ...(stored as Partial<GrokSettings>),
    handles,
    // Nested, so merge field by field: settings saved before a field existed
    // still get its default.
    autopilot: {
      ...DEFAULT_GROK_SETTINGS.autopilot,
      ...(stored.autopilot as Partial<GrokSettings["autopilot"]> | undefined),
    },
  };
}

export async function saveGrokSettings(settings: GrokSettings): Promise<void> {
  await write(GROK_SETTINGS_KEY, settings);
}

const DEFAULT_GROK_STATE: GrokState = { bootstrapped: false, tweets: [] };

function normalizeGrokState(stored: GrokState | null): GrokState {
  if (!stored) return { ...DEFAULT_GROK_STATE, tweets: [] };
  for (const t of stored.tweets) {
    if (!t.handle) {
      const m = t.url?.match(/^https?:\/\/[^/]+\/([^/]+)\/status\//);
      if (m) t.handle = m[1].toLowerCase();
    }
  }
  return stored;
}

export async function getGrokState(): Promise<GrokState> {
  return normalizeGrokState(await read<GrokState>(GROK_STATE_KEY));
}

/**
 * Changes the watcher state through the write queue. The watcher, "mark
 * replied" and "clear seen tweets" all rewrite this file, and a scrape takes
 * minutes, so each change must apply to the latest copy.
 */
export async function modifyGrokState(change: (state: GrokState) => GrokState): Promise<GrokState> {
  return modify<GrokState | null>(GROK_STATE_KEY, null, (stored) => {
    const next = change(normalizeGrokState(stored));
    return { ...next, tweets: next.tweets.slice(-200) };
  }) as Promise<GrokState>;
}

export async function getApiKeys(): Promise<ApiKeys> {
  return (await read<ApiKeys>(API_KEYS_KEY)) ?? {};
}

export async function saveApiKeys(keys: ApiKeys): Promise<void> {
  await write(API_KEYS_KEY, keys);
}

/**
 * Posts and accounts on a platform Kyrelo no longer supports (LinkedIn, until
 * September 2026) stay in the files but aren't listed, so nothing tries to
 * post to or show a platform it has no rules for.
 */
export async function listScheduledPosts(): Promise<ScheduledPost[]> {
  return ((await read<ScheduledPost[]>(SCHEDULED_POSTS_KEY)) ?? []).filter((p) => isPlatformId(p.platform));
}

export async function insertScheduledPost(post: ScheduledPost): Promise<void> {
  await modify<ScheduledPost[]>(SCHEDULED_POSTS_KEY, [], (all) => [...all, post]);
}

/**
 * Applies `change` to the latest stored copy of a post. `change` returns the
 * updated post, or null to leave it untouched (e.g. its status moved on since
 * the caller last looked). Returns the saved post, or null if the post no
 * longer exists (cancelled) or `change` declined.
 */
export async function updateScheduledPost(
  id: string,
  change: (post: ScheduledPost) => ScheduledPost | null,
): Promise<ScheduledPost | null> {
  let saved: ScheduledPost | null = null;
  await modify<ScheduledPost[]>(SCHEDULED_POSTS_KEY, [], (all) =>
    all.map((p) => {
      if (p.id !== id) return p;
      saved = change({ ...p });
      return saved ?? p;
    }),
  );
  return saved;
}

export async function deleteScheduledPost(id: string): Promise<void> {
  await modify<ScheduledPost[]>(SCHEDULED_POSTS_KEY, [], (all) => all.filter((p) => p.id !== id));
}

/** All connected accounts, or only those on `platform`. */
export async function listAccounts(platform?: PlatformId): Promise<Account[]> {
  const all = ((await read<Account[]>(ACCOUNTS_KEY)) ?? (await legacyXAccounts())).filter((a) => isPlatformId(a.platform));
  return platform ? all.filter((a) => a.platform === platform) : all;
}

export async function modifyAccounts(change: (accounts: Account[]) => Account[]): Promise<Account[]> {
  // The first write migrates legacy X accounts into accounts.json.
  const legacy = await legacyXAccounts();
  return modify<Account[]>(ACCOUNTS_KEY, legacy, change);
}

async function legacyXAccounts(): Promise<Account[]> {
  const old = (await read<Omit<Account, "platform">[]>(LEGACY_X_ACCOUNTS_KEY)) ?? [];
  return old.map((a) => ({ ...a, platform: "twitter" }));
}

/**
 * Credentials for API-based accounts, keyed "platform:id". Kept out of the
 * accounts list so they never reach the UI. Which fields are set depends on
 * the platform: Bluesky an app password; Mastodon its server and token;
 * Threads a token (refreshed now and then) and the user's Threads id.
 */
export interface AccountSecret {
  appPassword?: string;
  instance?: string;
  token?: string;
  userId?: string;
  refreshedAt?: string;
}

function secretKey(platform: PlatformId, id: string): string {
  return `${platform}:${id}`;
}

export async function getAccountSecret(platform: PlatformId, id: string): Promise<AccountSecret | null> {
  const all = (await read<Record<string, AccountSecret>>(ACCOUNT_SECRETS_KEY)) ?? {};
  return all[secretKey(platform, id)] ?? null;
}

export async function setAccountSecret(platform: PlatformId, id: string, secret: AccountSecret | null): Promise<void> {
  await modify<Record<string, AccountSecret>>(ACCOUNT_SECRETS_KEY, {}, (all) => {
    const next = { ...all };
    if (secret) next[secretKey(platform, id)] = secret;
    else delete next[secretKey(platform, id)];
    return next;
  });
}

export async function listCampaigns(): Promise<Campaign[]> {
  // Campaigns from before they could post to several platforms went to one X account.
  return ((await read<Campaign[]>(CAMPAIGNS_KEY)) ?? []).map((c) =>
    c.targets ? c : { ...c, targets: [{ platform: "twitter", accountId: c.accountId }], maxLength: MAX_TWEET_LENGTH },
  );
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  return (await listCampaigns()).find((c) => c.id === id) ?? null;
}

export async function upsertCampaign(campaign: Campaign): Promise<void> {
  await modify<Campaign[]>(CAMPAIGNS_KEY, [], (all) =>
    all.some((c) => c.id === campaign.id)
      ? all.map((c) => (c.id === campaign.id ? campaign : c))
      : [...all, campaign].slice(-50),
  );
}

export async function getBrandProfile(): Promise<BrandProfile> {
  return (await read<BrandProfile>(BRAND_PROFILE_KEY)) ?? { brief: "", url: "", competitors: "" };
}

export async function saveBrandProfile(profile: BrandProfile): Promise<void> {
  await write(BRAND_PROFILE_KEY, profile);
}

export async function listMediaItems(): Promise<MediaItem[]> {
  return (await read<MediaItem[]>(MEDIA_LIBRARY_KEY)) ?? [];
}

export async function modifyMediaItems(change: (items: MediaItem[]) => MediaItem[]): Promise<MediaItem[]> {
  return modify<MediaItem[]>(MEDIA_LIBRARY_KEY, [], change);
}

/** Phone app access (lib/mobile-bridge.ts). Off until the user turns it on. */
export interface MobileBridgeConfig {
  enabled: boolean;
  /** Pairing secret the phone sends with every request. Rotated on "Reset pairing". */
  token: string | null;
}

export async function getMobileBridgeConfig(): Promise<MobileBridgeConfig> {
  return (await read<MobileBridgeConfig>(MOBILE_BRIDGE_KEY)) ?? { enabled: false, token: null };
}

export async function saveMobileBridgeConfig(config: MobileBridgeConfig): Promise<void> {
  await write(MOBILE_BRIDGE_KEY, config);
}

// --- Unfollow tab: one entry per X account id ---

const EMPTY_UNFOLLOW: UnfollowData = { following: [], hasStats: false, partial: false, interactions: {}, keep: [], history: [] };

export async function getUnfollowData(accountId: string): Promise<UnfollowData> {
  const all = (await read<Record<string, UnfollowData>>(UNFOLLOW_KEY)) ?? {};
  return { ...EMPTY_UNFOLLOW, ...all[accountId] };
}

export async function modifyUnfollowData(
  accountId: string,
  change: (data: UnfollowData) => UnfollowData,
): Promise<UnfollowData> {
  const all = await modify<Record<string, UnfollowData>>(UNFOLLOW_KEY, {}, (stored) => ({
    ...stored,
    [accountId]: change({ ...EMPTY_UNFOLLOW, ...stored[accountId] }),
  }));
  return all[accountId];
}

// --- Handle finder: one entry per X account id ---

const EMPTY_FINDER: HandleFinderData = { suggestions: [], dropped: [], follows: [] };

export async function getHandleFinderData(accountId: string): Promise<HandleFinderData> {
  const all = (await read<Record<string, HandleFinderData>>(HANDLE_FINDER_KEY)) ?? {};
  return { ...EMPTY_FINDER, ...all[accountId] };
}

export async function modifyHandleFinderData(
  accountId: string,
  change: (data: HandleFinderData) => HandleFinderData,
): Promise<HandleFinderData> {
  const all = await modify<Record<string, HandleFinderData>>(HANDLE_FINDER_KEY, {}, (stored) => ({
    ...stored,
    [accountId]: change({ ...EMPTY_FINDER, ...stored[accountId] }),
  }));
  return all[accountId];
}

