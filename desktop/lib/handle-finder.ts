import { hasApiKey } from "./ai";
import { jsonCompletion, webResearch } from "./ai-web";
import { BrowserJob, findXAccount, jobSlot, JobResult, pauseForPosts, yieldToPosts } from "./browser-job";
import { jitter } from "./browser/session";
import { FollowedAccount } from "./unfollow-rules";
import { readWhoToFollow, setFollowing, visitProfile, XUser } from "./browser/twitter-follows";
import { getBrandProfile, getGrokSettings, getHandleFinderData, modifyHandleFinderData, saveBrandProfile } from "./storage";
import { BrandProfile, HandleSuggestion, SuggestionGroup } from "./types";

// Finds X accounts worth watching in the Monitor (and following) for the
// user's brand. One job:
//   1. read X's own "Who to follow" for the account,
//   2. AI web research from the brand profile (shared with auto campaigns),
//      told about X's suggestions, returns a list with a reason each,
//   3. every suggested handle is opened on X: AI invents handles and suggests
//      renamed or dead accounts, so only real, active ones are kept.
// Following is a second job, paced and capped like Unfollow.

export const MAX_SUGGESTIONS = 30;
/** Accounts quieter than this aren't worth watching. */
export const INACTIVE_DAYS = 60;
export const MAX_FOLLOWS_PER_RUN = 50;
export const MAX_FOLLOWS_PER_DAY = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

export const SUGGESTION_GROUPS: SuggestionGroup[] = ["audience", "competitor", "news", "peer"];

export type FinderJobKind = "find" | "follow";
export type FinderJob = BrowserJob<FinderJobKind>;
type Result = JobResult<FinderJobKind>;

const slot = jobSlot<FinderJobKind>("finder", "The handle finder is already running.");

export function getFinderJob(): FinderJob | null {
  return slot.current();
}

// --- The AI side ----------------------------------------------------------------

const FIND_SYSTEM = `You help a small brand grow on X (Twitter) by finding accounts worth watching, replying to and following.

Research on the web, then list real, currently active X accounts in four groups:
- audience: accounts the brand's target customers follow and engage with (niche creators, communities, practitioners, thought leaders), where a useful reply from the brand would be seen.
- competitor: the competitors' own X accounts, and their founders if they post about the product.
- news: publications, newsletters and journalists covering the niche.
- peer: similar-sized or slightly bigger accounts in the same or neighbouring niches, good for relationships.

Rules:
- Use handles you found (a link to x.com/<handle> or twitter.com/<handle>, or the handle shown on an official site) or know well. Don't make one up from a person's name. Every handle is opened on X afterwards and ones that don't exist or have gone quiet are dropped, so a wrong handle costs a slot, nothing more.
- Prefer accounts that post regularly. Skip huge general accounts (celebrities, general news) unless the niche is about them.
- X also suggested some accounts for the brand's X account; include the ones clearly relevant to the brand.
- Leave out the accounts listed as already watched.
- Give each a one-sentence reason specific to this brand.
- Aim for ${MAX_SUGGESTIONS - 5} to ${MAX_SUGGESTIONS} accounts: roughly 10 audience, 3 to 5 competitor, 4 to 6 news and 6 to 8 peer.

Answer with one line per account: @handle | group | reason`;

const STRUCTURE_SYSTEM = `Turn the list of X accounts you're given into JSON. Copy each handle exactly as written, without the @. Keep each account's group and reason. Don't add, merge or invent accounts.`;

const SUGGESTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["handle", "group", "reason"],
        properties: {
          handle: { type: "string" },
          group: { type: "string", enum: SUGGESTION_GROUPS },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

function findPrompt(profile: BrandProfile, xSuggested: FollowedAccount[], watched: string[], own: string): string {
  const fromX = xSuggested.length
    ? xSuggested
        .map((u) => `- @${u.handle} (${u.name}${u.followers !== undefined ? `, ${u.followers} followers` : ""}): ${u.bio ?? ""}`)
        .join("\n")
    : "(none)";
  return (
    `The brand's X account: @${own}\n` +
    `Product URL: ${profile.url || "(none given)"}\n` +
    `Competitors: ${profile.competitors || "(none given, find the obvious ones)"}\n\n` +
    `What the brand does:\n"""\n${profile.brief}\n"""\n\n` +
    `Already watched (leave out): ${watched.length ? watched.map((h) => `@${h}`).join(", ") : "(none)"}\n\n` +
    `Accounts X suggested to @${own}:\n${fromX}`
  );
}

export interface RawSuggestion {
  handle: string;
  group: SuggestionGroup;
  reason: string;
}

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

/**
 * The AI's JSON as clean suggestions: handles normalised ("@x", x.com links),
 * invalid, duplicate and excluded ones dropped, capped at MAX_SUGGESTIONS.
 */
export function parseSuggestions(raw: string, exclude: string[]): RawSuggestion[] {
  let parsed: { suggestions?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The AI returned its suggestions in an unreadable format. Try again.");
  }
  const skip = new Set(exclude.map((h) => h.toLowerCase()));
  const out: RawSuggestion[] = [];
  for (const item of Array.isArray(parsed.suggestions) ? parsed.suggestions : []) {
    const s = item as Partial<RawSuggestion>;
    const handle = String(s.handle ?? "")
      .trim()
      .replace(/^@/, "")
      .replace(/^(https?:\/\/)?(www\.)?(x|twitter)\.com\//i, "")
      .replace(/[/?].*$/, "");
    if (!HANDLE_RE.test(handle) || skip.has(handle.toLowerCase())) continue;
    if (!SUGGESTION_GROUPS.includes(s.group as SuggestionGroup)) continue;
    skip.add(handle.toLowerCase());
    out.push({ handle, group: s.group as SuggestionGroup, reason: String(s.reason ?? "").trim() });
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

/** What checking a suggestion on X decided: keep it (with its stats) or drop it, and why. */
export function checkSuggestion(
  s: RawSuggestion,
  visit: { user?: XUser; lastPostAt: string | null | undefined; missing: boolean },
  fromX: boolean,
  now: Date,
): { keep: HandleSuggestion } | { drop: string } {
  if (visit.missing) return { drop: "doesn't exist on X or is suspended" };
  if (!visit.user) return { drop: "profile didn't load" };
  if (visit.lastPostAt === null) return { drop: "has never posted" };
  if (visit.lastPostAt) {
    const days = (now.getTime() - new Date(visit.lastPostAt).getTime()) / DAY_MS;
    if (days > INACTIVE_DAYS) return { drop: `no posts in ${Math.round(days)} days` };
  }
  const u = visit.user;
  return {
    keep: {
      // X's spelling of the handle, not the AI's.
      handle: u.handle,
      name: u.name,
      group: s.group,
      reason: s.reason,
      fromX,
      userId: u.id,
      bio: u.bio,
      followers: u.followers,
      posts: u.posts,
      lastPostAt: visit.lastPostAt ?? undefined,
      youFollow: u.youFollow ?? false,
    },
  };
}

/** Grouped in SUGGESTION_GROUPS order, biggest first within a group. */
export function rankSuggestions(list: HandleSuggestion[]): HandleSuggestion[] {
  return [...list].sort(
    (a, b) =>
      SUGGESTION_GROUPS.indexOf(a.group) - SUGGESTION_GROUPS.indexOf(b.group) || (b.followers ?? 0) - (a.followers ?? 0),
  );
}

// --- Jobs --------------------------------------------------------------------------

export async function startFind(accountId: string, profileUpdate?: BrandProfile): Promise<Result> {
  const account = await findXAccount(accountId);
  if (!account) return { error: "Account not found." };
  // Saved even if the run can't start, so what the user typed isn't lost.
  if (profileUpdate) await saveBrandProfile(profileUpdate);
  const settings = await getGrokSettings();
  const provider = settings.aiProvider;
  if (!(await hasApiKey(provider === "openai" ? "openai" : "anthropic"))) {
    return { error: `Add a ${provider === "openai" ? "OpenAI" : "Claude"} API key in Settings first.` };
  }
  const profile = await getBrandProfile();
  if (!profile.brief.trim()) return { error: "Describe what your brand does first." };
  const watched = settings.handles.map((h) => h.toLowerCase());

  return slot.run("find", account, 0, async (session, job, record) => {
    let xSuggested: FollowedAccount[] = [];
    try {
      xSuggested = await readWhoToFollow(session.page, record);
    } catch (err) {
      record(`Couldn't read X's suggestions (${err instanceof Error ? err.message : String(err)}); carrying on without them.`);
    }

    record("Researching accounts for your brand. This takes a few minutes…");
    // Chrome isn't needed meanwhile, so scheduled posts can use it.
    const raw = await session.withoutBrowser(async () => {
      const research = await webResearch({
        system: FIND_SYSTEM,
        prompt: findPrompt(profile, xSuggested, watched, account.handle),
        provider,
        task: "find accounts for this brand",
        maxSearches: 8,
      });
      if (!research.text.trim()) throw new Error("The research came back empty. Try again.");
      return jsonCompletion({
        system: STRUCTURE_SYSTEM,
        prompt: research.text,
        schema: SUGGESTIONS_SCHEMA,
        name: "handle_suggestions",
        provider,
        task: "list these accounts",
      });
    });
    const candidates = parseSuggestions(raw, [...watched, account.handle]);
    if (candidates.length === 0) throw new Error("The AI didn't suggest any accounts. Add more detail about your brand and try again.");

    record(`Checking ${candidates.length} suggestions on X…`);
    job.total = candidates.length;
    const fromX = new Set(xSuggested.map((u) => u.handle.toLowerCase()));
    const kept: HandleSuggestion[] = [];
    const dropped: { handle: string; why: string }[] = [];
    for (const c of candidates) {
      // The research is paid for, so pause for a post rather than stop.
      await pauseForPosts(job, session, record);
      const result = checkSuggestion(c, await visitProfile(session.page, c.handle), fromX.has(c.handle.toLowerCase()), new Date());
      if ("keep" in result) {
        job.done++;
        kept.push(result.keep);
      } else {
        job.failed++;
        dropped.push({ handle: c.handle, why: result.drop });
        record(`Left out @${c.handle}: ${result.drop}`);
      }
      await jitter(1500, 3000);
    }

    await modifyHandleFinderData(account.id, (d) => ({
      ...d,
      suggestions: rankSuggestions(kept),
      dropped,
      ranAt: new Date().toISOString(),
    }));
    record(`Done: ${kept.length} accounts to look at${dropped.length ? `, ${dropped.length} left out` : ""}.`);
  });
}

export async function startFollow(accountId: string, handles: string[]): Promise<Result> {
  const account = await findXAccount(accountId);
  if (!account) return { error: "Account not found." };
  const data = await getHandleFinderData(account.id);
  if (handles.length === 0) return { error: "Tick the accounts to follow." };
  if (handles.length > MAX_FOLLOWS_PER_RUN) {
    return { error: `Follow up to ${MAX_FOLLOWS_PER_RUN} at a time. X locks accounts that follow too fast.` };
  }
  const dayAgo = Date.now() - DAY_MS;
  const today = data.follows.filter((f) => new Date(f.at).getTime() > dayAgo).length;
  if (today + handles.length > MAX_FOLLOWS_PER_DAY) {
    return {
      error: `That would be more than ${MAX_FOLLOWS_PER_DAY} follows in 24 hours (${today} so far). X locks accounts past its limits, so try again later.`,
    };
  }
  // Only accounts the finder suggested, whatever the page sent.
  const byHandle = new Map(data.suggestions.map((s) => [s.handle.toLowerCase(), s]));
  const targets: HandleSuggestion[] = [];
  for (const h of handles) {
    const s = byHandle.get(h.toLowerCase());
    if (!s) return { error: `@${h} isn't in the finder's suggestions. Run it again.` };
    if (!s.youFollow) targets.push(s);
  }
  if (targets.length === 0) return { error: "You already follow all of them." };

  return slot.run("follow", account, targets.length, async ({ page }, job, record) => {
    let failuresInARow = 0;
    for (const target of targets) {
      if (yieldToPosts(job, record)) return;
      const result = await setFollowing(page, target.handle, target.userId, true);
      if (result.ok) {
        failuresInARow = 0;
        job.done++;
        record(`Following @${target.handle}`);
        const at = new Date().toISOString();
        const key = target.handle.toLowerCase();
        await modifyHandleFinderData(account.id, (d) => ({
          ...d,
          suggestions: d.suggestions.map((s) => (s.handle.toLowerCase() === key ? { ...s, youFollow: true, followedAt: at } : s)),
          follows: [...d.follows, { handle: target.handle, at }].slice(-1_000),
        }));
      } else {
        failuresInARow++;
        job.failed++;
        record(`Skipped @${target.handle}: ${result.reason}`);
        if (failuresInARow >= 3) {
          record("Stopping after 3 failures in a row. X may be limiting this account; try again later.");
          return;
        }
      }
      // A person's pace, not a script's.
      await jitter(4000, 9000);
    }
    record(`Done. Now following ${job.done}${job.failed ? `, skipped ${job.failed}` : ""}.`);
  });
}
