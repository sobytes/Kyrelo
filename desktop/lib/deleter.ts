import { deleteTweets, DeleteEvent } from "./browser/twitter-delete";
import { listXAccounts } from "./storage";

export interface DeleterJob {
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

// Store on globalThis so Next dev HMR (which reloads this module whenever we
// edit unrelated files) doesn't wipe the running job. In packaged builds this
// is equivalent to a plain module-level `let`.
const G = globalThis as { __kyreloDeleterJob?: DeleterJob | null };

function setCurrent(job: DeleterJob | null): void {
  G.__kyreloDeleterJob = job;
}

export function getJob(): DeleterJob | null {
  return G.__kyreloDeleterJob ?? null;
}

export interface StartOptions {
  accountId: string;
  count: number;
  startingAt: number;
  includeReposts: boolean;
}

export async function startJob(opts: StartOptions): Promise<{ job: DeleterJob } | { error: string }> {
  if (getJob()?.running) return { error: "Another delete job is already running." };

  const accounts = await listXAccounts();
  const account = accounts.find((a) => a.id === opts.accountId);
  if (!account) return { error: "Account not found." };

  if (!Number.isInteger(opts.count) || opts.count < 1 || opts.count > 100) {
    return { error: "Count must be an integer between 1 and 100." };
  }
  if (!Number.isInteger(opts.startingAt) || opts.startingAt < 0 || opts.startingAt > 1000) {
    return { error: "Starting-at must be an integer between 0 and 1000." };
  }

  const job: DeleterJob = {
    id: crypto.randomUUID(),
    accountId: account.id,
    handle: account.handle,
    count: opts.count,
    startingAt: opts.startingAt,
    includeReposts: opts.includeReposts,
    startedAt: new Date().toISOString(),
    running: true,
    deleted: [],
    skipped: [],
    log: [],
  };
  setCurrent(job);

  const record = (line: string) => {
    job.log.push(`[${new Date().toISOString()}] ${line}`);
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
  };

  const onProgress = (event: DeleteEvent) => {
    if (event.kind === "log") record(event.message);
    else if (event.kind === "deleted") {
      job.deleted.push(event.id);
      const verb = event.itemKind === "repost" ? "un-reposted" : "deleted";
      record(`${verb} ${event.url}`);
    } else if (event.kind === "skipped") {
      job.skipped.push(event.id);
      record(`skipped ${event.id}: ${event.reason}`);
    }
  };

  // Fire-and-forget. Client polls GET /api/deleter for state.
  (async () => {
    try {
      await deleteTweets({
        accountId: account.id,
        handle: account.handle,
        count: opts.count,
        startingAt: opts.startingAt,
        includeReposts: opts.includeReposts,
        onProgress,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      job.error = msg;
      record(`error: ${msg}`);
    } finally {
      job.running = false;
      job.finishedAt = new Date().toISOString();
    }
  })();

  return { job };
}
