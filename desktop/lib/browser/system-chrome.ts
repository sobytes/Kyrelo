// Launches the user's real installed Google Chrome with our isolated profile
// dir and attaches via the remote-debugging port over CDP. Used for the X
// Connect flow only — Google's OAuth bot-detection rejects Playwright's
// auto-flagged Chromium even with stealth scripts, but lets a normally-spawned
// Chrome through.
//
// Once the user finishes signing in, the session cookies are saved into the
// userdata dir, and the regular Playwright launchPersistentContext flow used
// for scraping/posting can reuse them.

import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import http from "node:http";
import { chromium, Browser, BrowserContext, Page } from "playwright";

// Locations Google Chrome installs to, per-OS. We probe the filesystem rather
// than assume one path — on Windows especially, Chrome is just as often a
// per-user install under %LOCALAPPDATA% as a machine-wide one.
function chromeCandidates(): string[] {
  if (process.platform === "darwin") {
    const home = process.env.HOME ?? "";
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      home && `${home}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    ].filter(Boolean) as string[];
  }
  if (process.platform === "win32") {
    const dirs = [
      process.env["LOCALAPPDATA"],
      process.env["ProgramFiles"],
      process.env["ProgramFiles(x86)"],
      "C:\\Program Files",
      "C:\\Program Files (x86)",
    ].filter(Boolean) as string[];
    return dirs.map((d) => `${d}\\Google\\Chrome\\Application\\chrome.exe`);
  }
  return [
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
}

// Path to an installed Chrome, or null if none can be found.
export function findChrome(): string | null {
  for (const p of chromeCandidates()) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // unreadable path — skip
    }
  }
  return null;
}

// Thrown by launchSystemChrome when no Chrome install can be located. Callers
// surface this to the user as an "install Chrome" prompt rather than a generic
// failure.
export class ChromeNotFoundError extends Error {
  constructor() {
    super(
      "Google Chrome isn't installed. Kyrelo signs in to X through your real " +
        "Chrome because Google blocks automated browsers. Install Chrome, then " +
        "try Connect again.",
    );
    this.name = "ChromeNotFoundError";
  }
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

function waitForCdp(port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const req = http
        .get(`http://127.0.0.1:${port}/json/version`, (res) => {
          res.destroy();
          if (res.statusCode === 200) resolve();
          else if (Date.now() - start > timeoutMs)
            reject(new Error("CDP did not come up in time"));
          else setTimeout(tick, 300);
        })
        .on("error", () => {
          if (Date.now() - start > timeoutMs) reject(new Error("CDP did not come up in time"));
          else setTimeout(tick, 300);
        });
      req.setTimeout(1500, () => req.destroy());
    };
    tick();
  });
}

// Killing the Chrome process directly (SIGTERM → TerminateProcess) on Windows
// orphans its child processes — GPU, network service, crashpad — which keep
// file handles open on the profile dir and block the post-login rename.
// taskkill /T tears down the whole tree.
function killChromeTree(proc: ChildProcess): void {
  if (process.platform === "win32" && proc.pid) {
    try {
      spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // fall through to a plain signal kill
    }
  }
  try {
    proc.kill("SIGTERM");
  } catch {
    // already gone
  }
}

export interface SystemChromeHandle {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  proc: ChildProcess;
  close(): Promise<void>;
}

export async function launchSystemChrome(
  userDataDir: string,
  startUrl: string,
): Promise<SystemChromeHandle> {
  const chromePath = findChrome();
  if (!chromePath) throw new ChromeNotFoundError();
  const port = await findFreePort();
  console.log(`[system-chrome] spawning Chrome (${chromePath}) → port=${port} dir=${userDataDir}`);

  const proc = spawn(
    chromePath,
    [
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${port}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=ChromeWhatsNewUI,InterestFeedContentSuggestions",
      "--password-store=basic",
      startUrl,
    ],
    { detached: false, stdio: "ignore" },
  );

  proc.on("error", (err) => {
    console.error("[system-chrome] spawn error:", err);
  });
  proc.on("exit", (code, signal) => {
    console.log(`[system-chrome] chrome exited code=${code} signal=${signal}`);
  });

  try {
    await waitForCdp(port, 15_000);
    console.log(`[system-chrome] CDP ready on :${port}`);
  } catch (err) {
    try {
      proc.kill("SIGTERM");
    } catch {}
    throw new Error(
      `Couldn't connect to Chrome's debug port. Is Google Chrome installed at ` +
        `${chromePath}? (${err instanceof Error ? err.message : err})`,
    );
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());
  console.log(`[system-chrome] attached: contexts=${browser.contexts().length} pages=${context.pages().length}`);

  return {
    browser,
    context,
    page,
    proc,
    async close() {
      console.log("[system-chrome] close() — disconnecting CDP");
      try {
        await browser.close();
      } catch (err) {
        console.warn("[system-chrome] CDP close errored:", err);
      }

      if (proc.exitCode === null) {
        console.log("[system-chrome] killing Chrome process tree, waiting for exit (up to 6s)");
        const start = Date.now();
        await new Promise<void>((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            console.log(`[system-chrome] chrome closed in ${Date.now() - start}ms`);
            resolve();
          };
          proc.once("exit", finish);
          killChromeTree(proc);
          setTimeout(() => {
            if (done) return;
            console.warn("[system-chrome] chrome didn't exit in 6s, SIGKILL");
            try {
              proc.kill("SIGKILL");
            } catch {}
            finish();
          }, 6000);
        });
      } else {
        console.log(`[system-chrome] chrome already exited (code=${proc.exitCode})`);
      }
    },
  };
}
