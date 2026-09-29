// Which followed accounts the Unfollow tab suggests, and why. Pure, so the
// panel (to tick rows) and the server (to refuse anything else) use the same
// rules.

/** Someone the user follows on X, as the Following scan saw them. */
export interface FollowedAccount {
  handle: string;
  name: string;
  /** Stats come from X's own data for the page; missing if X changed its format. */
  bio?: string;
  followers?: number;
  following?: number;
  posts?: number;
  /** When the account was created (ISO). */
  createdAt?: string;
  defaultAvatar?: boolean;
  followsYou: boolean;
  /** From the activity check: ISO time of their latest post, null if they have none. */
  lastPostAt?: string | null;
  activityCheckedAt?: string;
}

export interface UnfollowRules {
  /** No posts in `inactiveDays`, or hardly any posts at all. */
  dead: boolean;
  inactiveDays: number;
  /** Not seen interacting with the user (needs the interactions scan). */
  neverEngage: boolean;
  /** Follow-for-follow, brand new, or empty accounts. */
  bots: boolean;
  notFollowingBack: boolean;
  /** Keep accounts with BIG_ACCOUNT_FOLLOWERS or more. */
  protectBig: boolean;
}

export const DEFAULT_RULES: UnfollowRules = {
  dead: true,
  inactiveDays: 180,
  neverEngage: false,
  bots: true,
  notFollowingBack: false,
  protectBig: true,
};

export const MIN_INACTIVE_DAYS = 30;
export const MAX_INACTIVE_DAYS = 3 * 365;

/** Rules from a request: known fields only, anything missing or invalid is the default. */
export function parseRules(raw: unknown): UnfollowRules {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<Record<keyof UnfollowRules, unknown>>;
  const flag = (key: keyof UnfollowRules) => (typeof r[key] === "boolean" ? (r[key] as boolean) : (DEFAULT_RULES[key] as boolean));
  const days = typeof r.inactiveDays === "number" && Number.isFinite(r.inactiveDays) ? Math.round(r.inactiveDays) : DEFAULT_RULES.inactiveDays;
  return {
    dead: flag("dead"),
    inactiveDays: Math.min(MAX_INACTIVE_DAYS, Math.max(MIN_INACTIVE_DAYS, days)),
    neverEngage: flag("neverEngage"),
    bots: flag("bots"),
    notFollowingBack: flag("notFollowingBack"),
    protectBig: flag("protectBig"),
  };
}

/** What the rules know besides the account itself. */
export interface UnfollowContext {
  /** Handles (lowercase) on the user's keep list. */
  keep: string[];
  /** Handles (lowercase) watched in the Monitor. */
  watched: string[];
  /** Lowercase handle → when they were last seen interacting with the user (ISO). */
  interactions: Record<string, string>;
  /** When interactions were last scanned; undefined means never. */
  interactionsScannedAt?: string;
  now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** An interaction counts for this long after it was last seen. */
export const INTERACTION_WINDOW_DAYS = 90;
export const BIG_ACCOUNT_FOLLOWERS = 50_000;

// "Bots & spam" thresholds.
const FOLLOW_FARM_MIN_FOLLOWING = 1_000;
const FOLLOW_FARM_RATIO = 3;
const MASS_FOLLOWER = 5_000;
const NEW_ACCOUNT_DAYS = 30;
// "Dead" thresholds besides the inactive days.
const FEW_POSTS = 10;
const FEW_POSTS_PER_YEAR = 5;

function daysSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / DAY_MS;
}

/** "12 days", "8 months", "3 years". */
export function describeDays(days: number): string {
  if (days < 60) return `${Math.max(1, Math.round(days))} days`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
}

function hasInteracted(handle: string, ctx: UnfollowContext): boolean {
  const seen = ctx.interactions[handle.toLowerCase()];
  return seen !== undefined && daysSince(seen, ctx.now) <= INTERACTION_WINDOW_DAYS;
}

/** Why this account must not be unfollowed, or null. Checked before any rule. */
export function protectionReason(account: FollowedAccount, rules: UnfollowRules, ctx: UnfollowContext): string | null {
  const handle = account.handle.toLowerCase();
  if (ctx.keep.includes(handle)) return "on your keep list";
  if (ctx.watched.includes(handle)) return "watched in Monitor";
  if (hasInteracted(handle, ctx)) return "interacts with you";
  if (rules.protectBig && (account.followers ?? 0) >= BIG_ACCOUNT_FOLLOWERS) return "big account";
  return null;
}

/** The turned-on rules this account breaks, as short reasons. Empty: keep following. */
export function unfollowReasons(account: FollowedAccount, rules: UnfollowRules, ctx: UnfollowContext): string[] {
  const reasons: string[] = [];
  const n = (v: number) => v.toLocaleString("en-US");
  const ageDays = account.createdAt ? daysSince(account.createdAt, ctx.now) : undefined;

  if (rules.dead) {
    if (account.lastPostAt === null) {
      reasons.push("has never posted");
    } else if (account.lastPostAt && daysSince(account.lastPostAt, ctx.now) >= rules.inactiveDays) {
      reasons.push(`no posts in ${describeDays(daysSince(account.lastPostAt, ctx.now))}`);
    } else if (account.posts !== undefined && account.posts < FEW_POSTS) {
      reasons.push(`only ${account.posts} post${account.posts === 1 ? "" : "s"}`);
    } else if (account.posts !== undefined && ageDays !== undefined && ageDays >= 365) {
      const perYear = account.posts / (ageDays / 365);
      if (perYear < FEW_POSTS_PER_YEAR) reasons.push(`about ${Math.round(perYear)} posts a year`);
    }
  }

  if (rules.neverEngage && ctx.interactionsScannedAt && !hasInteracted(account.handle, ctx)) {
    reasons.push("never interacts with you");
  }

  if (rules.bots) {
    const { followers, following } = account;
    if (
      following !== undefined &&
      followers !== undefined &&
      following >= FOLLOW_FARM_MIN_FOLLOWING &&
      following >= FOLLOW_FARM_RATIO * Math.max(followers, 1)
    ) {
      reasons.push(`follows ${n(following)}, followed by ${n(followers)}`);
    } else if (following !== undefined && following >= MASS_FOLLOWER) {
      reasons.push(`follows ${n(following)} accounts`);
    }
    if (ageDays !== undefined && ageDays < NEW_ACCOUNT_DAYS) reasons.push(`account is ${describeDays(ageDays)} old`);
    if (account.defaultAvatar && !account.bio?.trim()) reasons.push("no photo or bio");
  }

  if (rules.notFollowingBack && !account.followsYou) reasons.push("doesn't follow you");

  return reasons;
}

/** Accounts the rules suggest unfollowing: breaks a rule and isn't protected. */
export function isSuggested(account: FollowedAccount, rules: UnfollowRules, ctx: UnfollowContext): boolean {
  return protectionReason(account, rules, ctx) === null && unfollowReasons(account, rules, ctx).length > 0;
}

/**
 * Whether a last-post check would help: the dead rule only knows "inactive"
 * after one. Checks older than two weeks are redone.
 */
export function needsActivityCheck(account: FollowedAccount, now: Date): boolean {
  return !account.activityCheckedAt || daysSince(account.activityCheckedAt, now) > 14;
}
