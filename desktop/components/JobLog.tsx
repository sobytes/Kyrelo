"use client";

// The status badge and live log shared by the Deleter and Unfollow jobs.

const STATUS_STYLES = {
  running: "bg-amber-500/10 text-amber-300",
  done: "bg-live/10 text-emerald-300",
  failed: "bg-rose-500/10 text-rose-300",
};

export function JobStatus({ running, error }: { running: boolean; error?: string }) {
  const status = error ? "failed" : running ? "running" : "done";
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
        STATUS_STYLES[status]
      }
    >
      {status}
    </span>
  );
}

export function JobLog({ log, error }: { log: string[]; error?: string }) {
  return (
    <>
      {error && (
        <div className="rounded-md border border-rose-900/50 bg-rose-950/30 p-2 text-[11px] text-rose-300">{error}</div>
      )}
      <div className="max-h-64 overflow-y-auto rounded-md border border-line bg-ink p-2 font-mono text-[11px] leading-relaxed text-zinc-400">
        {log.length === 0 ? (
          <div className="text-zinc-600">Waiting for the browser to open…</div>
        ) : (
          log.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-words">
              {line}
            </div>
          ))
        )}
      </div>
    </>
  );
}
