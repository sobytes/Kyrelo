"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { XAccount } from "@/lib/types";

interface DeleterJob {
  id: string;
  accountId: string;
  handle: string;
  count: number;
  startingAt: number;
  includeReposts: boolean;
  startedAt: string;
  finishedAt?: string;
  running: boolean;
  deleted: string[];
  skipped: string[];
  log: string[];
  error?: string;
}

interface ConnectStatus {
  accounts: XAccount[];
}

export function DeleterPanel() {
  const [accounts, setAccounts] = useState<XAccount[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [count, setCount] = useState(10);
  const [startingAt, setStartingAt] = useState(0);
  const [includeReposts, setIncludeReposts] = useState(false);
  const [job, setJob] = useState<DeleterJob | null>(null);
  const [starting, setStarting] = useState(false);
  // Server keeps the last finished job for a while — remember the id the user
  // dismissed so polling doesn't resurface it.
  const dismissedJobId = useRef<string | null>(null);

  async function loadAccounts() {
    const r = (await fetch("/api/twitter-connect").then((r) => r.json())) as ConnectStatus;
    setAccounts(r.accounts ?? []);
    setAccountId((curr) => {
      if (curr && r.accounts.some((a) => a.id === curr)) return curr;
      return r.accounts[0]?.id ?? "";
    });
  }

  async function loadJob() {
    const r = await fetch("/api/deleter").then((r) => r.json());
    const incoming: DeleterJob | null = r.job ?? null;
    if (incoming && !incoming.running && dismissedJobId.current === incoming.id) {
      setJob(null);
      return;
    }
    setJob(incoming);
  }

  useEffect(() => {
    loadAccounts();
    loadJob();
  }, []);

  useEffect(() => {
    // Poll faster while a job is running so the log feels live.
    const interval = job?.running ? 1500 : 5000;
    const id = setInterval(loadJob, interval);
    return () => clearInterval(id);
  }, [job?.running]);

  async function start() {
    if (!accountId) return;
    const acct = accounts.find((a) => a.id === accountId);
    const scopeLabel = includeReposts ? "tweets and reposts" : "tweets";
    const ok = confirm(
      `Remove up to ${count} ${scopeLabel} from @${acct?.handle}, skipping the first ${startingAt}?\n\n` +
        `Deleted tweets cannot be recovered. Un-reposted tweets can be reposted again from the original.`,
    );
    if (!ok) return;
    setStarting(true);
    try {
      const r = await fetch("/api/deleter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, count, startingAt, includeReposts }),
      }).then((r) => r.json());
      if (r.error) {
        alert(r.error);
      } else {
        setJob(r.job);
      }
    } finally {
      setStarting(false);
    }
  }

  if (accounts.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center gap-2 py-10 text-center">
        <div className="text-sm text-zinc-300">No X accounts connected yet.</div>
        <div className="text-xs text-zinc-500">
          Connect one to delete tweets from its timeline.
        </div>
        <Link href="/connected" className="btn-primary mt-2 text-sm">
          Connect an account
        </Link>
      </div>
    );
  }

  const jobIsForCurrent = job && job.accountId === accountId;
  const showJob = job && (job.running || jobIsForCurrent);
  const disabled = starting || (job?.running ?? false);

  return (
    <div className="space-y-5">
      <section className="card space-y-4">
        <div>
          <div className="label">Account</div>
          <select
            className="rounded-md border border-line bg-ink px-2 py-2 text-sm w-full"
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="label">How many to delete</div>
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              className="input text-sm"
              value={count}
              onChange={(e) => setCount(clampInt(e.target.value, 1, 100, 10))}
              disabled={disabled}
            />
            <div className="mt-1 text-[10px] text-zinc-500">1 – 100 tweets.</div>
          </div>

          <div>
            <div className="label">Starting at</div>
            <input
              type="number"
              min={0}
              max={1000}
              step={1}
              className="input text-sm"
              value={startingAt}
              onChange={(e) => setStartingAt(clampInt(e.target.value, 0, 1000, 0))}
              disabled={disabled}
            />
            <div className="mt-1 text-[10px] text-zinc-500">
              Keep this many items at the top of your timeline. 0 removes from the newest.
            </div>
          </div>
        </div>

        <label className="flex items-start gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            className="mt-0.5 accent-accent"
            checked={includeReposts}
            onChange={(e) => setIncludeReposts(e.target.checked)}
            disabled={disabled}
          />
          <span>
            <span className="text-zinc-200">Include reposts (undo retweets)</span>
            <span className="mt-0.5 block text-[10px] text-zinc-500">
              When on, reposts count toward the total and are removed with &ldquo;Undo repost&rdquo;.
              When off, only your own tweets are removed and reposts are skipped.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={start}
            disabled={disabled || !accountId}
            className="btn-danger text-sm"
          >
            {job?.running
              ? "Running…"
              : starting
                ? "Starting…"
                : includeReposts
                  ? "Remove tweets & reposts"
                  : "Delete tweets"}
          </button>
          <span className="text-[11px] text-zinc-500">
            Opens Chrome to x.com/{accounts.find((a) => a.id === accountId)?.handle ?? ""},
            scrolls, and removes items one at a time.
          </span>
        </div>
      </section>

      {showJob && job && (
        <JobPanel
          job={job}
          onDismiss={() => {
            dismissedJobId.current = job.id;
            setJob(null);
          }}
        />
      )}

      <div className="card text-xs leading-relaxed text-zinc-500">
        <strong className="text-zinc-300">How this works.</strong> Kyrelo opens the
        account&apos;s own X profile in Chrome, scrolls to load enough tweets to cover
        your skip + count, then walks each one and picks Delete from the tweet menu.
        Retweets and pinned tweets are skipped automatically.
      </div>
    </div>
  );
}

function JobPanel({ job, onDismiss }: { job: DeleterJob; onDismiss: () => void }) {
  const status = job.error
    ? "failed"
    : job.running
      ? "running"
      : "done";
  const statusStyles: Record<string, string> = {
    running: "bg-amber-500/10 text-amber-300",
    done: "bg-live/10 text-emerald-300",
    failed: "bg-rose-500/10 text-rose-300",
  };
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
              statusStyles[status]
            }
          >
            {status}
          </span>
          <span className="text-zinc-300">
            @{job.handle} · skip {job.startingAt} · up to {job.count}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[11px] tabular-nums text-zinc-500">
            {job.deleted.length} deleted · {job.skipped.length} skipped
          </div>
          {!job.running && (
            <button
              onClick={onDismiss}
              className="rounded-full px-2 py-0.5 text-zinc-500 hover:bg-panel2 hover:text-zinc-200"
              title="Clear"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {job.error && (
        <div className="rounded-md border border-rose-900/50 bg-rose-950/30 p-2 text-[11px] text-rose-300">
          {job.error}
        </div>
      )}

      <div className="max-h-64 overflow-y-auto rounded-md border border-line bg-ink p-2 font-mono text-[11px] leading-relaxed text-zinc-400">
        {job.log.length === 0 ? (
          <div className="text-zinc-600">Waiting for the browser to open…</div>
        ) : (
          job.log.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-words">
              {line}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
