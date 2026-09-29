"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FinderJob } from "@/lib/handle-finder";
import { Account, BrandProfile, HandleFinderData, HandleSuggestion, SuggestionGroup } from "@/lib/types";
import { describeDays } from "@/lib/unfollow-rules";
import { JobLog, JobStatus } from "./JobLog";
import { openExternal } from "./useAccounts";

// Mirrors lib/handle-finder.ts; the server enforces it.
const MAX_FOLLOWS_PER_RUN = 50;
/** More handles make each Monitor check longer and Autopilot score more posts. */
const COMFORTABLE_WATCH_COUNT = 30;

const GROUP_TITLES: Record<SuggestionGroup, { title: string; detail: string }> = {
  audience: { title: "Where your audience is", detail: "Replies here get seen by the people you want to reach." },
  competitor: { title: "Competitors", detail: "What they post and who engages with it." },
  news: { title: "News & journalists", detail: "Be first to hear, and first to comment." },
  peer: { title: "Peers", detail: "Accounts like yours, worth getting to know." },
};

interface FinderState {
  job: FinderJob | null;
  data: HandleFinderData;
  profile: BrandProfile;
  aiReady: boolean;
}

export function HandleFinderModal({
  accounts,
  watched,
  onWatch,
  onClose,
}: {
  accounts: Account[];
  watched: string[];
  /** Adds (true) or removes (false) handles from the Monitor. */
  onWatch: (handles: string[], watch: boolean) => void;
  onClose: () => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [state, setState] = useState<FinderState | null>(null);
  const [brief, setBrief] = useState("");
  const [url, setUrl] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function load(fillForm = false) {
    const r: FinderState = await fetch(`/api/handle-finder?accountId=${encodeURIComponent(accountId)}`).then((r) => r.json());
    setState(r);
    if (fillForm) {
      setBrief(r.profile.brief);
      setUrl(r.profile.url);
      setCompetitors(r.profile.competitors);
    }
  }

  useEffect(() => {
    setTicked(new Set());
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const running = state?.job?.running ?? false;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(load, 2000);
    return () => {
      clearInterval(id);
      load(); // once more for the job's final state
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, accountId]);

  async function start(body: object) {
    setBusy(true);
    try {
      const r = await fetch("/api/handle-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, ...body }),
      }).then((r) => r.json());
      if (r.error) alert(r.error);
      else setState((s) => (s ? { ...s, job: r.job } : s));
    } finally {
      setBusy(false);
    }
  }

  function followTicked() {
    const handles = [...ticked].slice(0, MAX_FOLLOWS_PER_RUN);
    if (
      !confirm(
        `Follow ${handles.length} account${handles.length === 1 ? "" : "s"} from @${account?.handle}?\n\n` +
          "It goes slowly (a few seconds each) so X doesn't flag the account.",
      )
    ) {
      return;
    }
    start({ action: "follow", handles });
    setTicked(new Set());
  }

  const account = accounts.find((a) => a.id === accountId);
  const isWatched = (handle: string) => watched.includes(handle.toLowerCase());
  const suggestions = state?.data.suggestions ?? [];
  const job = state?.job && state.job.accountId === accountId ? state.job : null;
  const disabled = busy || running;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-in" onClick={running ? undefined : onClose}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="label !mb-0">Find accounts for my brand</div>
            <p className="mt-1 text-xs text-zinc-500">
              AI researches your niche and reads X&apos;s own suggestions for you, then every account is checked on X,
              so only real, active ones are listed. Watch the ones you want to reply to, follow the ones you want to
              know.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full px-2 py-0.5 text-zinc-500 hover:bg-panel2 hover:text-zinc-200">
            ✕
          </button>
        </div>

        {!state ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : !state.aiReady ? (
          <div className="card space-y-2 text-sm text-zinc-300">
            <div>Finding accounts needs an AI key for the research.</div>
            <Link href="/settings" className="btn-primary inline-block text-xs">
              Add a key in Settings
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              {accounts.length > 1 && (
                <select
                  className="w-full rounded-md border border-line bg-ink px-2 py-2 text-sm"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  disabled={disabled}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      @{a.handle}
                    </option>
                  ))}
                </select>
              )}
              <div>
                <div className="label">What does your brand do, and for whom?</div>
                <textarea
                  className="textarea h-20 resize-none"
                  placeholder="e.g. Invoicing app for freelance designers in the UK. We want designers and small studios to know us."
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="input text-sm" placeholder="Link to your product" value={url} onChange={(e) => setUrl(e.target.value)} disabled={disabled} />
                <input
                  className="input text-sm"
                  placeholder="Competitors (optional)"
                  value={competitors}
                  onChange={(e) => setCompetitors(e.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => start({ action: "find", brief, url, competitors })}
                  disabled={disabled || !brief.trim()}
                  className="btn-primary text-sm"
                >
                  {running && job?.kind === "find" ? "Finding…" : suggestions.length ? "Find again" : "Find accounts"}
                </button>
                <span className="text-[11px] text-zinc-500">
                  Takes a few minutes: research, then a quick look at each account on X in Chrome. Saved as your brand
                  profile for auto campaigns too.
                </span>
              </div>
            </div>

            {job && (
              <section className="card space-y-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <JobStatus running={job.running} error={job.error} />
                    <span className="text-zinc-300">{job.kind === "find" ? "Finding accounts" : "Following"}</span>
                  </div>
                  {job.total > 0 && (
                    <span className="text-[11px] tabular-nums text-zinc-500">
                      {job.done + job.failed} / {job.total}
                    </span>
                  )}
                </div>
                <JobLog log={job.log} error={job.error} />
              </section>
            )}

            {suggestions.length > 0 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
                  <span>
                    Watching {watched.length}.{" "}
                    {watched.length > COMFORTABLE_WATCH_COUNT
                      ? `More than about ${COMFORTABLE_WATCH_COUNT} makes each check slower and gives Autopilot more to score.`
                      : `Around ${COMFORTABLE_WATCH_COUNT} keeps checks quick.`}
                  </span>
                  {state.data.ranAt && <span>Found {new Date(state.data.ranAt).toLocaleString()}</span>}
                </div>

                {(Object.keys(GROUP_TITLES) as SuggestionGroup[]).map((group) => {
                  const inGroup = suggestions.filter((s) => s.group === group);
                  if (inGroup.length === 0) return null;
                  const unwatched = inGroup.filter((s) => !isWatched(s.handle)).map((s) => s.handle);
                  return (
                    <section key={group} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <div>
                          <span className="text-sm font-medium text-zinc-200">{GROUP_TITLES[group].title}</span>{" "}
                          <span className="text-[11px] text-zinc-500">{GROUP_TITLES[group].detail}</span>
                        </div>
                        {unwatched.length > 0 && (
                          <button onClick={() => onWatch(unwatched, true)} className="text-[11px] text-zinc-500 hover:text-accent">
                            Watch all
                          </button>
                        )}
                      </div>
                      <div className="divide-y divide-line rounded-lg border border-line">
                        {inGroup.map((s) => (
                          <SuggestionRow
                            key={s.handle}
                            s={s}
                            watched={isWatched(s.handle)}
                            ticked={ticked.has(s.handle)}
                            onWatch={(watch) => onWatch([s.handle], watch)}
                            onTick={(on) => {
                              const next = new Set(ticked);
                              if (on) next.add(s.handle);
                              else next.delete(s.handle);
                              setTicked(next);
                            }}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}

                <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                  <button onClick={followTicked} disabled={disabled || ticked.size === 0} className="btn-primary text-sm">
                    {running && job?.kind === "follow" ? "Following…" : `Follow ${Math.min(ticked.size, MAX_FOLLOWS_PER_RUN)}`}
                  </button>
                  <span className="text-[11px] text-zinc-500">
                    Tick accounts to follow. Up to {MAX_FOLLOWS_PER_RUN} a run and 200 a day, a few seconds apart.
                  </span>
                </div>
              </>
            )}

            {state.data.dropped.length > 0 && (
              <details className="text-[11px] text-zinc-500">
                <summary className="cursor-pointer">{state.data.dropped.length} left out after checking X</summary>
                <ul className="mt-1 space-y-0.5 pl-4">
                  {state.data.dropped.map((d) => (
                    <li key={d.handle}>
                      @{d.handle}: {d.why}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionRow({
  s,
  watched,
  ticked,
  onWatch,
  onTick,
}: {
  s: HandleSuggestion;
  watched: boolean;
  ticked: boolean;
  onWatch: (watch: boolean) => void;
  onTick: (on: boolean) => void;
}) {
  const days = s.lastPostAt ? (Date.now() - new Date(s.lastPostAt).getTime()) / 86_400_000 : undefined;
  const facts = [
    s.followers !== undefined ? `${s.followers.toLocaleString("en-US")} followers` : null,
    days !== undefined ? (days < 1 ? "posted today" : `last post ${describeDays(days)} ago`) : null,
    s.fromX ? "suggested by X" : null,
    s.youFollow ? "you follow" : null,
  ].filter(Boolean);

  return (
    <div className="flex items-start gap-3 p-2.5">
      <input
        type="checkbox"
        className="mt-1 accent-accent"
        checked={ticked}
        disabled={s.youFollow}
        onChange={(e) => onTick(e.target.checked)}
        title={s.youFollow ? "You already follow them" : "Tick to follow"}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <button onClick={() => openExternal(`https://x.com/${s.handle}`)} className="truncate text-sm font-medium text-zinc-100 hover:underline">
            {s.name}
          </button>
          <span className="truncate text-xs text-zinc-500">@{s.handle}</span>
        </div>
        {s.reason && <div className="mt-0.5 text-xs text-zinc-300">{s.reason}</div>}
        <div className="mt-0.5 text-[11px] text-zinc-500">{facts.join(" · ")}</div>
      </div>
      <button onClick={() => onWatch(!watched)} className={(watched ? "chip-on" : "chip-suggest") + " shrink-0"}>
        {watched ? "Watching" : "+ Watch"}
      </button>
    </div>
  );
}
