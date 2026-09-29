"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Account } from "@/lib/types";
import { JobLog, JobStatus } from "./JobLog";

type DeleteTarget = "posts" | "replies" | "likes";

// Wording for each kind of thing the Deleter removes.
const TARGETS: Record<DeleteTarget, { label: string; noun: string; button: string; keep: string; how: string }> = {
  posts: {
    label: "Posts",
    noun: "posts",
    button: "Delete posts",
    keep: "Keep this many of your newest posts. 0 starts from the newest.",
    how: "Kyrelo opens your X profile in Chrome, scrolls to load enough posts to cover your skip + count, then picks Delete from each post's menu. Pinned posts are always skipped. Reposts are skipped unless Include reposts is on.",
  },
  replies: {
    label: "Replies",
    noun: "replies",
    button: "Delete replies",
    keep: "Keep this many of your newest replies. 0 starts from the newest.",
    how: "Kyrelo opens your Replies tab and deletes only your replies to other people, going by X's own data for the page. Replies in your own threads are kept, so your threads stay intact.",
  },
  likes: {
    label: "Likes",
    noun: "likes",
    button: "Unlike",
    keep: "Keep this many of your most recent likes. 0 starts from the newest.",
    how: "Kyrelo opens your likes history and presses Unlike on each post, newest first. Unliking can be undone by liking the post again.",
  },
};

interface DeleterJob {
  id: string;
  accountId: string;
  handle: string;
  target?: DeleteTarget;
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
  accounts: Account[];
}

export function DeleterPanel() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  // Until the first load, show "Loading" rather than the "connect an account" prompt.
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [accountId, setAccountId] = useState<string>("");
  const [count, setCount] = useState(10);
  const [startingAt, setStartingAt] = useState(0);
  const [target, setTarget] = useState<DeleteTarget>("posts");
  const [includeReposts, setIncludeReposts] = useState(false);
  const [job, setJob] = useState<DeleterJob | null>(null);
  const [starting, setStarting] = useState(false);
  // Server keeps the last finished job for a while — remember the id the user
  // dismissed so polling doesn't resurface it.
  const dismissedJobId = useRef<string | null>(null);

  async function loadAccounts() {
    const r = (await fetch("/api/accounts").then((r) => r.json())) as ConnectStatus;
    // The Deleter works on X only.
    const list = (r.accounts ?? []).filter((a) => a.platform === "twitter");
    setAccounts(list);
    setAccountsLoaded(true);
    setAccountId((curr) => {
      if (curr && list.some((a) => a.id === curr)) return curr;
      return list[0]?.id ?? "";
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
    const scopeLabel = target === "posts" && includeReposts ? "posts and reposts" : TARGETS[target].noun;
    const warning =
      target === "likes"
        ? "You can like any of them again later."
        : "Deleted posts and replies can't be recovered." +
          (target === "posts" && includeReposts ? " Undone reposts can be reposted from the original." : "");
    const ok = confirm(
      `${target === "likes" ? "Unlike" : "Remove"} up to ${count} ${scopeLabel} from @${acct?.handle}, skipping the ${startingAt} newest?\n\n${warning}`,
    );
    if (!ok) return;
    setStarting(true);
    try {
      const r = await fetch("/api/deleter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, target, count, startingAt, includeReposts: target === "posts" && includeReposts }),
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

  if (!accountsLoaded) {
    return <div className="py-6 text-sm text-muted">Loading…</div>;
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 border-y border-line py-12 text-center">
        <div className="text-sm text-fg">No X accounts connected yet.</div>
        <div className="text-xs text-muted">
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
      <section className="section space-y-4">
        <div>
          <div className="label">Account</div>
          <select
            className="rounded-md border border-line bg-canvas px-2 py-2 text-sm w-full"
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

        <div>
          <div className="label">What to delete</div>
          <div className="flex gap-2">
            {(Object.keys(TARGETS) as DeleteTarget[]).map((t) => (
              <button
                key={t}
                onClick={() => setTarget(t)}
                disabled={disabled}
                className={"btn-ghost " + (target === t ? "border-fg font-semibold" : "text-muted")}
              >
                {TARGETS[t].label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="label">How many {target === "likes" ? "to unlike" : "to delete"}</div>
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
            <div className="mt-1 text-[10px] text-muted">1 – 100 {TARGETS[target].noun}.</div>
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
            <div className="mt-1 text-[10px] text-muted">
              {TARGETS[target].keep}
            </div>
          </div>
        </div>

        {target === "posts" && (
        <label className="flex items-start gap-2 text-xs text-fg">
          <input
            type="checkbox"
            className="mt-0.5 accent-primary"
            checked={includeReposts}
            onChange={(e) => setIncludeReposts(e.target.checked)}
            disabled={disabled}
          />
          <span>
            <span className="text-fg">Include reposts (undo retweets)</span>
            <span className="mt-0.5 block text-[10px] text-muted">
              When on, reposts count toward the total and are removed with &ldquo;Undo repost&rdquo;.
              When off, only your own tweets are removed and reposts are skipped.
            </span>
          </span>
        </label>
        )}

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
                : target === "posts" && includeReposts
                  ? "Delete posts & reposts"
                  : TARGETS[target].button}
          </button>
          <span className="text-[11px] text-muted">
            Opens Chrome and removes them one at a time, a second or two apart.
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

      <div className="section text-xs leading-relaxed text-muted">
        <strong className="text-fg">How this works.</strong> {TARGETS[target].how} DMs
        aren&apos;t covered: X now keeps them in its end-to-end encrypted Chat, behind a passcode.
      </div>
    </div>
  );
}

function JobPanel({ job, onDismiss }: { job: DeleterJob; onDismiss: () => void }) {
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <JobStatus running={job.running} error={job.error} />
          <span className="text-fg">
            @{job.handle} · {TARGETS[job.target ?? "posts"].noun} · skip {job.startingAt} · up to {job.count}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[11px] tabular-nums text-muted">
            {job.deleted.length} {job.target === "likes" ? "unliked" : "deleted"} · {job.skipped.length} skipped
          </div>
          {!job.running && (
            <button
              onClick={onDismiss}
              className="rounded-sm px-2 py-0.5 text-muted hover:bg-canvas hover:text-fg"
              title="Clear"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <JobLog log={job.log} error={job.error} />
    </section>
  );
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
