import { promises as fs } from "node:fs";
import path from "node:path";
import { ApiKeys, GrokSettings, GrokState, ScheduledPost, XAccount } from "./types";

const GROK_SETTINGS_KEY = "grok-settings";
const GROK_STATE_KEY = "grok-state";
const API_KEYS_KEY = "api-keys";
const SCHEDULED_POSTS_KEY = "scheduled-posts";
const X_ACCOUNTS_KEY = "x-accounts";

const dataDir = process.env.STORAGE_DIR ?? path.join(process.cwd(), ".data");

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

export async function saveScheduledPosts(posts: ScheduledPost[]): Promise<void> {
  await write(SCHEDULED_POSTS_KEY, posts);
}

export async function upsertScheduledPost(post: ScheduledPost): Promise<void> {
  const all = await listScheduledPosts();
  const idx = all.findIndex((p) => p.id === post.id);
  if (idx >= 0) all[idx] = post;
  else all.push(post);
  await saveScheduledPosts(all);
}

export async function deleteScheduledPost(id: string): Promise<void> {
  const all = await listScheduledPosts();
  await saveScheduledPosts(all.filter((p) => p.id !== id));
}

export async function listXAccounts(): Promise<XAccount[]> {
  return (await read<XAccount[]>(X_ACCOUNTS_KEY)) ?? [];
}

export async function saveXAccounts(accounts: XAccount[]): Promise<void> {
  await write(X_ACCOUNTS_KEY, accounts);
}
