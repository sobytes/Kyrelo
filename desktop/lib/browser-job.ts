import { Page } from "playwright";
import { aiErrorMessage } from "./ai";
import { openBrowser, postWaitingForBrowser, warmup } from "./browser/session";
import { listAccounts } from "./storage";
import { Account } from "./types";

// Long jobs the user starts on an X account in a visible Chrome (Unfollow,
// the handle finder), one at a time per feature. The route starts one and
// returns at once; the page polls the job for progress and its log.

export interface BrowserJob<Kind extends string = string> {
  id: string;
  kind: Kind;
  accountId: string;
  handle: string;
  startedAt: string;
  finishedAt?: string;
  running: boolean;
  /** Accounts to go through (0 when not known up front). */
  total: number;
  done: number;
  failed: number;
  log: string[];
  error?: string;
}

export type JobResult<Kind extends string> = { job: BrowserJob<Kind> } | { error: string };
export type LogLine = (line: string) => void;

/** The job's Chrome, which it can put down while it doesn't need it. */
export interface JobSession {
  /** The current page (a new one after withoutBrowser). */
  readonly page: Page;
  /**
   * Closes Chrome, runs `fn`, then opens it again, queueing behind anything
   * that took the browser meanwhile (a due post goes first). For slow work
   * that doesn't need the browser, like AI research, and for pausing.
   */
  withoutBrowser<T>(fn: () => Promise<T>): Promise<T>;
}

export async function findXAccount(accountId: string): Promise<Account | undefined> {
  return (await listAccounts("twitter")).find((a) => a.id === accountId);
}

/** True (and logged) when a post is waiting for this account's browser. */
export function yieldToPosts(job: BrowserJob, record: LogLine): boolean {
  if (!postWaitingForBrowser("twitter", job.accountId)) return false;
  record("Stopping early so a scheduled post can go out. Run it again to carry on.");
  return true;
}

/** Lets a waiting post use the browser, then carries on (logged). */
export async function pauseForPosts(job: BrowserJob, session: JobSession, record: LogLine): Promise<void> {
  if (!postWaitingForBrowser("twitter", job.accountId)) return;
  record("Pausing so a scheduled post can go out…");
  await session.withoutBrowser(async () => {});
  record("Carrying on.");
}

/**
 * One feature's job slot. Kept on globalThis so Next dev hot-reload doesn't
 * lose a running job.
 */
export function jobSlot<Kind extends string>(name: string, busyMessage: string) {
  const key = `__kyreloJob_${name}`;
  const G = globalThis as unknown as { [k: string]: BrowserJob<Kind> | null | undefined };

  function current(): BrowserJob<Kind> | null {
    return G[key] ?? null;
  }

  /** Starts `work` in the account's Chrome after a short warmup, and returns the job at once. */
  function run(
    kind: Kind,
    account: Account,
    total: number,
    work: (session: JobSession, job: BrowserJob<Kind>, record: LogLine) => Promise<void>,
  ): JobResult<Kind> {
    if (current()?.running) return { error: busyMessage };
    const job: BrowserJob<Kind> = {
      id: crypto.randomUUID(),
      kind,
      accountId: account.id,
      handle: account.handle,
      startedAt: new Date().toISOString(),
      running: true,
      total,
      done: 0,
      failed: 0,
      log: [],
    };
    G[key] = job;
    const record: LogLine = (line) => {
      job.log.push(`[${new Date().toISOString()}] ${line}`);
      if (job.log.length > 300) job.log.splice(0, job.log.length - 300);
    };

    const open = () => openBrowser("twitter", { purpose: `${name}-${kind}`, headless: false, accountId: account.id });
    (async () => {
      try {
        let browser = await open();
        const session: JobSession = {
          get page() {
            return browser.page;
          },
          async withoutBrowser(fn) {
            await browser.close();
            try {
              return await fn();
            } finally {
              browser = await open();
            }
          },
        };
        try {
          await warmup(browser.page, "https://x.com/home").catch((err) => console.warn(`[${name}] warmup skipped:`, err));
          await work(session, job, record);
        } finally {
          await browser.close();
        }
      } catch (err) {
        // Jobs that research (the handle finder) fail on AI errors too.
        job.error = aiErrorMessage(err);
        record(`error: ${job.error}`);
      } finally {
        job.running = false;
        job.finishedAt = new Date().toISOString();
      }
    })();
    return { job };
  }

  return { current, run };
}
