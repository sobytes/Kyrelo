import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ApiKeys,
  BrandProfile,
  Campaign,
  GrokSettings,
  GrokState,
  MediaItem,
  ScheduledPost,
  XAccount,
} from "./types";

const GROK_SETTINGS_KEY = "grok-settings";
const GROK_STATE_KEY = "grok-state";
const API_KEYS_KEY = "api-keys";
const SCHEDULED_POSTS_KEY = "scheduled-posts";
const X_ACCOUNTS_KEY = "x-accounts";
const CAMPAIGNS_KEY = "campaigns";
const BRAND_PROFILE_KEY = "brand-profile";
const MEDIA_LIBRARY_KEY = "media-library";

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

async function write<T>(key: string, value: T): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, `${key}.json`), JSON.stringify(value, null, 2));
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
  includeReplies: true,
  aiProvider: "claude",
  styleHint:
    "Take a sharp devil's-advocate angle. Question an assumption, surface a downside, or argue the opposite is true.",
  notifyDesktop: true,
  headlessPosting: false,
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
  };
}

export async function saveGrokSettings(settings: GrokSettings): Promise<void> {
  await write(GROK_SETTINGS_KEY, settings);
}

const DEFAULT_GROK_STATE: GrokState = { bootstrapped: false, tweets: [] };

export async function getGrokState(): Promise<GrokState> {
  const stored = await read<GrokState>(GROK_STATE_KEY);
  if (!stored) return DEFAULT_GROK_STATE;
  for (const t of stored.tweets) {
    if (!t.handle) {
      const m = t.url?.match(/^https?:\/\/[^/]+\/([^/]+)\/status\//);
      if (m) t.handle = m[1].toLowerCase();
    }
  }
  return stored;
}

export async function saveGrokState(state: GrokState): Promise<void> {
  const trimmed: GrokState = { ...state, tweets: state.tweets.slice(-200) };
  await write(GROK_STATE_KEY, trimmed);
}

export async function getApiKeys(): Promise<ApiKeys> {
  return (await read<ApiKeys>(API_KEYS_KEY)) ?? {};
}

export async function saveApiKeys(keys: ApiKeys): Promise<void> {
  await write(API_KEYS_KEY, keys);
}

export async function listScheduledPosts(): Promise<ScheduledPost[]> {
  return (await read<ScheduledPost[]>(SCHEDULED_POSTS_KEY)) ?? [];
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

export async function listXAccounts(): Promise<XAccount[]> {
  return (await read<XAccount[]>(X_ACCOUNTS_KEY)) ?? [];
}

export async function saveXAccounts(accounts: XAccount[]): Promise<void> {
  await write(X_ACCOUNTS_KEY, accounts);
}

export async function listCampaigns(): Promise<Campaign[]> {
  return (await read<Campaign[]>(CAMPAIGNS_KEY)) ?? [];
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
