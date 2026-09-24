// Electron main. In dev: spawns `next dev` + worker. In packaged builds:
// spawns the Next standalone server + worker via ELECTRON_RUN_AS_NODE so we
// don't need a separate Node runtime.
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");

const isDev = !app.isPackaged;
// On Windows `npm` is a `.cmd` script, which Node refuses to spawn without a
// shell (EINVAL since the CVE-2024-27980 fix). Run npm through a shell on
// Windows; the macOS/Linux path is unchanged.
const NPM_VIA_SHELL = process.platform === "win32";
// In dev we run from the repo. In packaged builds files live in
// Contents/Resources/app/ (asar disabled), siblings to extraResources.
const ROOT = isDev
  ? path.resolve(__dirname, "..")
  : path.join(process.resourcesPath, "app");

let mainWindow = null;
let nextProc = null;
let workerProc = null;
let appUrl = null;

function logTag(tag) {
  return (chunk) => {
    const text = chunk.toString();
    for (const line of text.split("\n")) {
      if (line) console.log(`[${tag}] ${line}`);
    }
  };
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function baseEnv(port) {
  const userData = app.getPath("userData");
  const storageDir = path.join(userData, "data");
  fs.mkdirSync(storageDir, { recursive: true });

  return {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    APP_URL: `http://127.0.0.1:${port}`,
    STORAGE_DIR: storageDir,
    PLAYWRIGHT_BROWSERS_PATH: isDev
      ? process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(ROOT, "build", "pw-browsers")
      : path.join(process.resourcesPath, "pw-browsers"),
    NODE_ENV: isDev ? "development" : "production",
  };
}

function spawnNext(port) {
  console.log(`[electron] starting next (${isDev ? "dev" : "production"}) on :${port}`);
  if (isDev) {
    nextProc = spawn("npm", ["run", "dev"], {
      cwd: ROOT,
      env: baseEnv(port),
      stdio: ["ignore", "pipe", "pipe"],
      shell: NPM_VIA_SHELL,
    });
  } else {
    const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
    nextProc = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
      cwd: ROOT,
      env: { ...baseEnv(port), ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  nextProc.stdout.on("data", logTag("next"));
  nextProc.stderr.on("data", logTag("next!"));
  nextProc.on("exit", (code) => {
    console.log(`[electron] next exited ${code}`);
    nextProc = null;
  });
}

function spawnWorker(port) {
  console.log("[electron] starting worker");
  if (isDev) {
    workerProc = spawn("npm", ["run", "worker"], {
      cwd: ROOT,
      env: baseEnv(port),
      stdio: ["ignore", "pipe", "pipe"],
      shell: NPM_VIA_SHELL,
    });
  } else {
    const workerJs = path.join(ROOT, "worker", "index.mjs");
    workerProc = spawn(process.execPath, [workerJs], {
      cwd: ROOT,
      env: { ...baseEnv(port), ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  workerProc.stdout.on("data", logTag("worker"));
  workerProc.stderr.on("data", logTag("worker!"));
  workerProc.on("exit", (code) => {
    console.log(`[electron] worker exited ${code}`);
    workerProc = null;
  });
}

function waitForPort(port, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const req = http
        .get(`http://127.0.0.1:${port}`, (res) => {
          res.destroy();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - start > timeoutMs) reject(new Error("timeout"));
          else setTimeout(tick, 600);
        });
      req.setTimeout(2000, () => req.destroy());
    };
    tick();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: "Kyrelo",
    backgroundColor: "#0b0d12",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 14, y: 14 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(`${appUrl}/detector`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only ever let http(s) URLs escape to the OS; refuse file://, javascript:,
    // mailto:, etc. in case any user-facing copy ends up containing one.
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("shell:openExternal", async (_event, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  // Prefer Chrome on macOS — that's typically where the user's X session is
  // logged in. Fall back to the system default if Chrome isn't installed.
  if (process.platform === "darwin") {
    const ok = await new Promise((resolve) => {
      const proc = spawn("open", ["-a", "Google Chrome", url], { stdio: "ignore" });
      proc.on("exit", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
    });
    if (ok) return true;
  }
  await shell.openExternal(url);
  return true;
});

app.whenReady().then(async () => {
  const port = isDev ? 3000 : await findFreePort();
  appUrl = `http://127.0.0.1:${port}`;

  spawnNext(port);
  try {
    await waitForPort(port);
  } catch (err) {
    console.error("[electron] next failed to come up:", err);
  }
  // Worker only starts after Next is up so the first tick doesn't ECONNREFUSED.
  spawnWorker(port);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => app.quit());

app.on("before-quit", () => {
  for (const p of [workerProc, nextProc]) {
    if (p) {
      try {
        p.kill("SIGTERM");
      } catch {}
    }
  }
  // Killing nextProc doesn't cascade to the headless browsers Playwright
  // spawned under it — they'd linger and lock the profile dir. Sweep them.
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/F", "/T", "/IM", "chrome-headless-shell.exe"], {
        stdio: "ignore",
      });
    } else {
      spawn("pkill", ["-f", "chrome-headless-shell"], { stdio: "ignore" });
    }
  } catch {}
});
