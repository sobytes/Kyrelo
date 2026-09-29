"use client";

// The status badge and live log shared by the Deleter and Unfollow jobs.

const STATUS_STYLES = {
  running: "bg-warning/10 text-warning",
  done: "bg-success/10 text-success",
  failed: "bg-error/10 text-error",
};

export function JobStatus({ running, error }: { running: boolean; error?: string }) {
  const status = error ? "failed" : running ? "running" : "done";
  return (
    <span
      className={
        "inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
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
        <div className="rounded-md border border-error/30 bg-error/5 p-2 text-[11px] text-error">{error}</div>
      )}
      <div className="max-h-64 overflow-y-auto rounded-md border border-line bg-canvas p-2 font-mono text-[11px] leading-relaxed text-muted">
        {log.length === 0 ? (
          <div className="text-muted">Waiting for the browser to open…</div>
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
