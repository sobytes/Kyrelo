#!/usr/bin/env node
// Background poller started by electron/main.cjs. Hits /api/cron/watch-grok
// (the Monitor) and /api/cron/scheduler (due posts) on timers, and pops native
// macOS notifications for new tweets and for posts sent or failed.

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
const intervalMs = Number(process.env.WORKER_GROK_INTERVAL_MS ?? 90_000);
const schedulerIntervalMs = Number(process.env.WORKER_SCHEDULER_INTERVAL_MS ?? 30_000);

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
}

console.log(
  `Worker started. watch-grok every ${intervalMs / 1000}s, scheduler every ${schedulerIntervalMs / 1000}s.`,
);
// Fire the first ticks in parallel so a slow watch-grok scrape can't block
// the scheduler from picking up due posts.
void tick();
void schedulerTick();
setInterval(tick, intervalMs);
setInterval(schedulerTick, schedulerIntervalMs);
