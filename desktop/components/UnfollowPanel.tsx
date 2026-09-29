"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Account, UnfollowData } from "@/lib/types";
import type { UnfollowJob } from "@/lib/unfollow";
import {
  BIG_ACCOUNT_FOLLOWERS,
  DEFAULT_RULES,
  describeDays,
  FollowedAccount,
  INTERACTION_WINDOW_DAYS,
  needsActivityCheck,
  protectionReason,
  UnfollowContext,
  UnfollowRules,
  unfollowReasons,
} from "@/lib/unfollow-rules";
import { JobLog, JobStatus } from "./JobLog";
import { openExternal } from "./useAccounts";

// Mirrors lib/unfollow.ts; the server enforces them.
const MAX_PER_RUN = 100;
const MAX_ACTIVITY_CHECKS = 200;
const PAGE_SIZE = 100;

type View = "suggested" | "all" | "protected";

interface Row {
  account: FollowedAccount;
  reasons: string[];
  protectedBecause: string | null;
}

async function api(body: object): Promise<{ error?: string; job?: UnfollowJob; data?: UnfollowData }> {
  const res = await fetch("/api/unfollow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function UnfollowPanel() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [accountId, setAccountId] = useState("");
  const [data, setData] = useState<UnfollowData | null>(null);
  const [watched, setWatched] = useState<string[]>([]);
  const [job, setJob] = useState<UnfollowJob | null>(null);
  const [rules, setRules] = useState<UnfollowRules>(DEFAULT_RULES);
  // Ticks the user changed by hand; everything else follows the rules.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<View>("suggested");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((r: { accounts?: Account[] }) => {
        const list = (r.accounts ?? []).filter((a) => a.platform === "twitter");
        setAccounts(list);
        setAccountId((curr) => curr || list[0]?.id || "");
      });
  }, []);

  async function load() {
    if (!accountId) return;
    const r = await fetch(`/api/unfollow?accountId=${encodeURIComponent(accountId)}`).then((r) => r.json());
    setJob(r.job ?? null);
    setData(r.data ?? null);
    setWatched(r.watched ?? []);
  }

  useEffect(() => {
    setOverrides({});
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Refresh while a job runs so ticks, last-post dates and the log stay live.
  const running = job?.running ?? false;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(load, 2000);
    return () => {
      clearInterval(id);
      load(); // once more for the job's final state
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, accountId]);

  const ctx: UnfollowContext | null = useMemo(
    () =>
      data && {
        keep: data.keep,
        watched,
        interactions: data.interactions,
        interactionsScannedAt: data.interactionsScannedAt,
        now: new Date(),
      },
    [data, watched],
  );

  const rows: Row[] = useMemo(() => {
    if (!data || !ctx) return [];
    return data.following.map((account) => ({
      account,
      reasons: unfollowReasons(account, rules, ctx),
      protectedBecause: protectionReason(account, rules, ctx),
    }));
  }, [data, ctx, rules]);

  const isTicked = (row: Row) =>
    !row.protectedBecause && (overrides[row.account.handle.toLowerCase()] ?? row.reasons.length > 0);
  const ticked = rows.filter(isTicked);
  const suggested = rows.filter((r) => !r.protectedBecause && r.reasons.length > 0);
  const protectedRows = rows.filter((r) => r.protectedBecause);

  // Profiles worth opening for a last-post date: unprotected, not checked
  // lately, least active first (they're the likeliest to be dead).
  const toCheck = useMemo(() => {
    if (!ctx) return [];
    const perYear = (a: FollowedAccount) =>
      a.posts !== undefined && a.createdAt
        ? a.posts / Math.max(1, (ctx.now.getTime() - new Date(a.createdAt).getTime()) / (365 * 86_400_000))
        : Infinity;
    return rows
      .filter((r) => !r.protectedBecause && needsActivityCheck(r.account, ctx.now))
      .map((r) => r.account)
      .sort((a, b) => perYear(a) - perYear(b))
      .slice(0, MAX_ACTIVITY_CHECKS);
  }, [rows, ctx]);

  const visible = (view === "suggested" ? suggested : view === "protected" ? protectedRows : rows).filter((r) => {
    const q = search.trim().toLowerCase().replace(/^@/, "");
    return !q || r.account.handle.toLowerCase().includes(q) || r.account.name.toLowerCase().includes(q);
  });

  async function start(body: object, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    try {
      const r = await api({ accountId, ...body });
      if (r.error) alert(r.error);
      else if (r.job) setJob(r.job);
    } finally {
      setBusy(false);
    }
  }

  async function setKeep(handle: string, keep: boolean) {
    const r = await api({ action: "keep", accountId, handle, keep });
    if (r.data) setData(r.data);
  }

  function unfollowTicked() {
    const batch = ticked.slice(0, MAX_PER_RUN);
    const more = ticked.length - batch.length;
    start(
      { action: "unfollow", handles: batch.map((r) => r.account.handle), rules },
      `Unfollow ${batch.length} account${batch.length === 1 ? "" : "s"} from @${account?.handle}?` +
        (more > 0 ? `\n\nThat's the first ${MAX_PER_RUN}; run it again later for the other ${more}.` : "") +
        `\n\nIt goes slowly (a few seconds each) so X doesn't flag the account. You can follow anyone again from the history below.`,
    );
  }

  if (accounts === null) return <div className="py-6 text-sm text-muted">Loading…</div>;
  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 border-y border-line py-12 text-center">
        <div className="text-sm text-fg">No X accounts connected yet.</div>
        <Link href="/connected" className="btn-primary mt-2 text-sm">
          Connect an account
        </Link>
      </div>
    );
  }

  const account = accounts.find((a) => a.id === accountId);
  const jobHere = job && job.accountId === accountId ? job : null;
  const disabled = busy || running;
  const history = (data?.history ?? []).slice(-50).reverse();

  return (
    <div className="space-y-5">
      <section className="section space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <div className="label">Account</div>
            <select
              className="w-full rounded-md border border-line bg-canvas px-2 py-2 text-sm"
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
          </div>
          <button onClick={() => start({ action: "scan" })} disabled={disabled} className="btn-primary text-sm">
            {running && job?.kind === "scan" ? "Scanning…" : data?.scannedAt ? "Scan again" : "Scan who I follow"}
          </button>
        </div>
        <div className="text-[11px] leading-relaxed text-muted">
          {data?.scannedAt ? (
            <>
              Last scan {new Date(data.scannedAt).toLocaleString()}: following {data.following.length}.{" "}
              {data.interactionsScannedAt
                ? `${Object.keys(data.interactions).length} people interacted with you in the last ${INTERACTION_WINDOW_DAYS} days.`
                : ""}
            </>
          ) : (
            "Opens Chrome, scrolls your Following list and your notifications. Nothing is unfollowed until you choose."
          )}
          {data?.partial && <span className="text-warning"> The last scan stopped early; scan again for everyone.</span>}
          {data?.scannedAt && !data.hasStats && (
            <span className="text-warning">
              {" "}
              X&apos;s stats couldn&apos;t be read (X may have changed its page), so only &ldquo;doesn&apos;t follow
              you&rdquo; and interactions work until it&apos;s fixed.
            </span>
          )}
        </div>
      </section>

      {jobHere && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <JobStatus running={jobHere.running} error={jobHere.error} />
              <span className="text-fg">{JOB_LABELS[jobHere.kind]}</span>
            </div>
            {jobHere.total > 0 && (
              <span className="text-[11px] tabular-nums text-muted">
                {jobHere.done} / {jobHere.total}
                {jobHere.failed ? ` · ${jobHere.failed} skipped` : ""}
              </span>
            )}
          </div>
          <JobLog log={jobHere.log} error={jobHere.error} />
        </section>
      )}

      {data && data.following.length > 0 && (
        <>
          <section className="section space-y-4">
            <div className="text-sm font-medium text-fg">Suggest unfollowing accounts that…</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <RuleToggle
                on={rules.dead}
                onChange={(dead) => setRules({ ...rules, dead })}
                title="Are dead"
                detail={
                  <>
                    No posts in{" "}
                    <select
                      className="rounded border border-line bg-canvas px-1 text-[11px]"
                      value={rules.inactiveDays}
                      onChange={(e) => setRules({ ...rules, inactiveDays: Number(e.target.value) })}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {[90, 180, 365, 730].map((d) => (
                        <option key={d} value={d}>
                          {describeDays(d)}
                        </option>
                      ))}
                    </select>
                    , never posted, or barely post.
                  </>
                }
              />
              <RuleToggle
                on={rules.neverEngage}
                onChange={(neverEngage) => setRules({ ...rules, neverEngage })}
                title="Never interact with you"
                detail={`No likes, reposts, replies or mentions in the last ${INTERACTION_WINDOW_DAYS} days.`}
              />
              <RuleToggle
                on={rules.bots}
                onChange={(bots) => setRules({ ...rules, bots })}
                title="Look like bots or spam"
                detail="Follow far more than follow them, follow 5,000+, brand new, or no photo and bio."
              />
              <RuleToggle
                on={rules.notFollowingBack}
                onChange={(notFollowingBack) => setRules({ ...rules, notFollowingBack })}
                title="Don't follow you back"
                detail="On its own this catches news and big names, so it pairs well with keeping big accounts."
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-fg">
              <input
                type="checkbox"
                className="accent-primary"
                checked={rules.protectBig}
                onChange={(e) => setRules({ ...rules, protectBig: e.target.checked })}
              />
              Always keep big accounts ({BIG_ACCOUNT_FOLLOWERS.toLocaleString("en-US")}+ followers). People you watch in
              Monitor, people who interact with you and your keep list are always kept.
            </label>
            {rules.dead && toCheck.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-canvas p-3 text-[11px] text-muted">
                <span className="flex-1">
                  &ldquo;No posts in {describeDays(rules.inactiveDays)}&rdquo; needs each profile opened.{" "}
                  {toCheck.length} haven&apos;t been checked lately (least active first, about 3 seconds each).
                </span>
                <button
                  onClick={() => start({ action: "activity", handles: toCheck.map((a) => a.handle) })}
                  disabled={disabled}
                  className="btn-ghost text-xs"
                >
                  {running && job?.kind === "activity" ? "Checking…" : `Check ${toCheck.length} profiles`}
                </button>
              </div>
            )}
          </section>

          <section className="section space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["suggested", `Suggested (${suggested.length})`],
                  ["all", `Everyone (${rows.length})`],
                  ["protected", `Kept (${protectedRows.length})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => {
                    setView(id);
                    setShown(PAGE_SIZE);
                  }}
                  className={view === id ? "chip chip-on" : "chip"}
                >
                  {label}
                </button>
              ))}
              <input
                className="input ml-auto w-48 text-xs"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="divide-y divide-line">
              {visible.slice(0, shown).map((row) => (
                <AccountRow
                  key={row.account.handle}
                  row={row}
                  now={ctx!.now}
                  ticked={isTicked(row)}
                  kept={data.keep.includes(row.account.handle.toLowerCase())}
                  onTick={(on) => setOverrides({ ...overrides, [row.account.handle.toLowerCase()]: on })}
                  onKeep={(keep) => setKeep(row.account.handle, keep)}
                />
              ))}
              {visible.length === 0 && (
                <div className="py-6 text-center text-xs text-muted">
                  {view === "suggested" ? "Nobody matches the rules above." : "Nobody here."}
                </div>
              )}
            </div>
            {visible.length > shown && (
              <button onClick={() => setShown(shown + PAGE_SIZE)} className="btn-ghost w-full text-xs">
                Show more ({visible.length - shown})
              </button>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
              <button onClick={unfollowTicked} disabled={disabled || ticked.length === 0} className="btn-danger text-sm">
                {running && job?.kind === "unfollow"
                  ? "Unfollowing…"
                  : `Unfollow ${Math.min(ticked.length, MAX_PER_RUN)}${ticked.length > MAX_PER_RUN ? ` of ${ticked.length}` : ""}`}
              </button>
              <span className="text-[11px] text-muted">
                Up to {MAX_PER_RUN} a run and 300 a day, a few seconds apart, so X doesn&apos;t flag the account.
              </span>
            </div>
          </section>
        </>
      )}

      {history.length > 0 && (
        <section className="section space-y-2">
          <div className="text-sm font-medium text-fg">History</div>
          <div className="divide-y divide-line">
            {history.map((change, i) => (
              <div key={`${change.handle}-${change.at}-${i}`} className="flex items-center gap-3 py-2 text-xs">
                <span className={change.action === "unfollowed" ? "text-error" : "text-success"}>
                  {change.action === "unfollowed" ? "Unfollowed" : "Followed again"}
                </span>
                <button onClick={() => openExternal(`https://x.com/${change.handle}`)} className="text-fg hover:underline">
                  @{change.handle}
                </button>
                <span className="flex-1 truncate text-muted">{change.reasons.join(" · ")}</span>
                <span className="text-muted">{new Date(change.at).toLocaleDateString()}</span>
                {change.action === "unfollowed" && isLatest(data!, change) && (
                  <button
                    onClick={() => start({ action: "refollow", handles: [change.handle] })}
                    disabled={disabled}
                    className="btn-ghost px-2 py-0.5 text-[11px]"
                  >
                    Follow again
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const JOB_LABELS: Record<UnfollowJob["kind"], string> = {
  scan: "Scanning who you follow",
  activity: "Checking when accounts last posted",
  unfollow: "Unfollowing",
  refollow: "Following again",
};

/** Only the latest change for a handle can be undone. */
function isLatest(data: UnfollowData, change: UnfollowData["history"][number]): boolean {
  return data.history.findLast((c) => c.handle.toLowerCase() === change.handle.toLowerCase()) === change;
}

function RuleToggle({
  on,
  onChange,
  title,
  detail,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  title: string;
  detail: React.ReactNode;
}) {
  return (
    <label
      className={
        "flex cursor-pointer items-start gap-2 rounded-md border p-3 text-xs " +
        (on ? "border-primary/60 bg-primary/5" : "border-line")
      }
    >
      <input type="checkbox" className="mt-0.5 accent-primary" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-fg">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-muted">{detail}</span>
      </span>
    </label>
  );
}

function AccountRow({
  row,
  now,
  ticked,
  kept,
  onTick,
  onKeep,
}: {
  row: Row;
  now: Date;
  ticked: boolean;
  kept: boolean;
  onTick: (on: boolean) => void;
  onKeep: (keep: boolean) => void;
}) {
  const a = row.account;
  const n = (v?: number) => (v === undefined ? "?" : v.toLocaleString("en-US"));
  const daysAgo = (iso: string) => (now.getTime() - new Date(iso).getTime()) / 86_400_000;
  const stats = [
    `${n(a.followers)} followers`,
    `follows ${n(a.following)}`,
    `${n(a.posts)} posts`,
    a.createdAt ? `joined ${new Date(a.createdAt).getFullYear()}` : null,
    a.lastPostAt ? `last post ${describeDays(daysAgo(a.lastPostAt))} ago` : a.lastPostAt === null ? "no posts" : null,
    a.followsYou ? "follows you" : null,
  ].filter(Boolean);

  return (
    <div className="flex items-start gap-3 py-2.5">
      <input
        type="checkbox"
        className="mt-1 accent-primary"
        checked={ticked}
        disabled={!!row.protectedBecause}
        onChange={(e) => onTick(e.target.checked)}
        title={row.protectedBecause ? `Kept: ${row.protectedBecause}` : undefined}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <button
            onClick={() => openExternal(`https://x.com/${a.handle}`)}
            className="truncate text-sm font-medium text-fg hover:underline"
          >
            {a.name}
          </button>
          <span className="truncate text-xs text-muted">@{a.handle}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-muted">{stats.join(" · ")}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {row.protectedBecause ? (
            <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] text-success">kept: {row.protectedBecause}</span>
          ) : (
            row.reasons.map((reason) => (
              <span key={reason} className="rounded bg-error/10 px-1.5 py-0.5 text-[10px] text-error">
                {reason}
              </span>
            ))
          )}
        </div>
      </div>
      <button
        onClick={() => onKeep(!kept)}
        className="btn-ghost shrink-0 px-2 py-0.5 text-[11px]"
        title={kept ? "Remove from your keep list" : "Never suggest unfollowing this account"}
      >
        {kept ? "Unkeep" : "Keep"}
      </button>
    </div>
  );
}
