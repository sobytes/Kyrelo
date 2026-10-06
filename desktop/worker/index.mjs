#!/usr/bin/env node
// Background poller started by electron/main.cjs. Hits /api/cron/watch-grok
// (the Monitor), /api/cron/scheduler (due posts), /api/cron/comments
// (comments on your posts), /api/cron/feeds (RSS auto-posting) and
// /api/cron/stats (likes and views of sent posts) on timers,
// and pops native macOS notifications for new tweets, new comments and posts
// sent or failed.

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

function loadEnvFile(file) {
  try {
    const content = readFileSync(path.join(process.cwd(), file), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // file missing — fine
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
// The Monitor browses X, so it checks at uneven times (3 to 6 minutes apart
// by default) rather than on a fixed beat, which reads as a bot. It also
// pauses overnight (lib/pacing.ts).
const intervalMs = Number(process.env.WORKER_GROK_INTERVAL_MS ?? 180_000);
const intervalJitterMs = Number(process.env.WORKER_GROK_JITTER_MS ?? 180_000);
const schedulerIntervalMs = Number(process.env.WORKER_SCHEDULER_INTERVAL_MS ?? 30_000);
const commentsIntervalMs = Number(process.env.WORKER_COMMENTS_INTERVAL_MS ?? 300_000);
const feedsIntervalMs = Number(process.env.WORKER_FEEDS_INTERVAL_MS ?? 600_000);
// Each post is refreshed at most hourly anyway (lib/stats.ts).
const statsIntervalMs = Number(process.env.WORKER_STATS_INTERVAL_MS ?? 15 * 60_000);

async function hit(path) {
  const res = await fetch(`${baseUrl}${path}`);
  const body = await res.text();
  console.log(`[${new Date().toISOString()}] ${path} → ${res.status} ${body.slice(0, 200)}`);
  return { status: res.status, body };
}

function macNotify(title, body) {
  if (process.platform !== "darwin") return;
  const esc = (s) =>
    String(s ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
  const script = `display notification "${esc(body)}" with title "${esc(title)}" sound name "Glass"`;
  const child = spawn("osascript", ["-e", script], { stdio: "ignore" });
  child.on("error", () => {});
}

// A watch scrape can take minutes (several handles, one shared browser per
// account), longer than the interval. Without these guards setInterval starts
// new requests while the last is still running, they queue on the browser
// lock, each takes longer than the last, and fetch gives up at undici's 300s
// headers timeout (UND_ERR_HEADERS_TIMEOUT) and drops that tick's results.
let watchInFlight = false;
let schedulerInFlight = false;
let commentsInFlight = false;
let feedsInFlight = false;
let statsInFlight = false;

async function tick() {
  if (watchInFlight) return;
  watchInFlight = true;
  try {
    const { body } = await hit("/api/cron/watch-grok");
    const json = JSON.parse(body);
    const tweets = Array.isArray(json.newTweets) ? json.newTweets : [];
    for (const t of tweets) {
      macNotify(`@${t.handle} ${t.isReply ? "replied" : "posted"}`, (t.text ?? "").slice(0, 100));
    }
    if (tweets.length > 0) {
      console.log(`[${new Date().toISOString()}] notified on ${tweets.length} new tweets`);
    }
  } catch (err) {
    console.error("watch-grok tick failed", err);
  } finally {
    watchInFlight = false;
  }
}

async function schedulerTick() {
  if (schedulerInFlight) return;
  schedulerInFlight = true;
  try {
    const { body } = await hit("/api/cron/scheduler");
    const json = JSON.parse(body);
    if (json.posted > 0) {
      macNotify("Scheduled post sent", `${json.posted} post${json.posted === 1 ? "" : "s"} posted to X.`);
    }
    if (json.failed > 0) {
      macNotify("Scheduled post failed", `${json.failed} post${json.failed === 1 ? "" : "s"} failed.`);
    }
  } catch (err) {
    console.error("scheduler tick failed", err);
  } finally {
    schedulerInFlight = false;
  }
  await armNextPost();
}

async function commentsTick() {
  if (commentsInFlight) return;
  commentsInFlight = true;
  try {
    const { body } = await hit("/api/cron/comments");
    const json = JSON.parse(body);
    if (json.newComments > 0) {
      macNotify("New comments", `${json.newComments} new comment${json.newComments === 1 ? "" : "s"} on your posts.`);
    }
  } catch (err) {
    console.error("comments tick failed", err);
  } finally {
    commentsInFlight = false;
  }
}

async function feedsTick() {
  if (feedsInFlight) return;
  feedsInFlight = true;
  try {
    // New posts are queued like any other; the scheduler sends and notifies.
    await hit("/api/cron/feeds");
  } catch (err) {
    console.error("feeds tick failed", err);
  } finally {
    feedsInFlight = false;
  }
}

async function statsTick() {
  if (statsInFlight) return;
  statsInFlight = true;
  try {
    await hit("/api/cron/stats");
  } catch (err) {
    console.error("stats tick failed", err);
  } finally {
    statsInFlight = false;
  }
}

// The 30s interval alone lets a post start up to 30s late. After each tick,
// if the next pending post is due before the next interval tick, set a timer
// for its exact time. The interval stays as the safety net (and picks up
// posts scheduled from the UI in the meantime).
let nextPostTimer = null;

async function armNextPost() {
  try {
    const res = await fetch(`${baseUrl}/api/scheduler/posts`);
    const { posts } = await res.json();
    const now = Date.now();
    const next = (posts ?? [])
      .filter((p) => p.status === "pending")
      .map((p) => new Date(p.scheduledFor).getTime())
      .sort((a, b) => a - b)[0];
    clearTimeout(nextPostTimer);
    if (next === undefined || next - now >= schedulerIntervalMs) return;
    // Already due (e.g. it arrived while a tick was running): go again soon,
    // but not instantly, so a post that can't be sent yet doesn't spin.
    const delay = next > now ? next - now + 250 : 5_000;
    nextPostTimer = setTimeout(schedulerTick, delay);
  } catch (err) {
    console.error("couldn't read upcoming posts", err);
  }
}

console.log(
  `Worker started. watch-grok every ${intervalMs / 1000}-${(intervalMs + intervalJitterMs) / 1000}s, scheduler every ${schedulerIntervalMs / 1000}s, comments every ${commentsIntervalMs / 1000}s, feeds every ${feedsIntervalMs / 1000}s, stats every ${statsIntervalMs / 1000}s.`,
);
// Fire the first ticks in parallel so a slow watch-grok scrape can't block
// the scheduler from picking up due posts.
void tick();
void schedulerTick();
void commentsTick();
void feedsTick();
void statsTick();
// Each check schedules the next after it finishes, a random time later.
async function tickThenWait() {
  await tick();
  setTimeout(tickThenWait, intervalMs + Math.random() * intervalJitterMs);
}
setTimeout(tickThenWait, intervalMs + Math.random() * intervalJitterMs);
setInterval(schedulerTick, schedulerIntervalMs);
setInterval(commentsTick, commentsIntervalMs);
setInterval(feedsTick, feedsIntervalMs);
setInterval(statsTick, statsIntervalMs);
