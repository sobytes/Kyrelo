# Kyrelo — Community Driven Buffer Alternative

A local desktop app and marketing site for **Kyrelo** — the open-source, community-driven Buffer alternative for X.

**Website:** [kyrelo.com](https://kyrelo.com/)
**Download the app here:** [GitHub Releases](https://github.com/sobytes/Kyrelo/releases/)

![Kyrelo desktop app](./website/public/screenshot.png)

## Why?

<img src="./website/public/buffer-status.png" alt="Buffer status page showing 17h ongoing outage and ~97% uptime" width="520" />

Buffer's status page is a working-day fixture. Multi-hour outages, ~97% uptime over the last quarter. When the scheduling layer is someone else's cloud, it breaks at exactly the moments you need it up.

Kyrelo runs entirely on your machine. No backend, no SaaS account, no shared infrastructure.

## Repo layout

| Folder | What it is |
|---|---|
| [`desktop/`](./desktop) | The Electron + Next.js + Playwright app. Schedule X posts, watch handles, generate AI replies. Built for macOS first. |
| [`website/`](./website) | The marketing site at [kyrelo.com](https://kyrelo.com). Plain Next.js + Tailwind, deploys to Vercel with **Root Directory = `website`**. |

## Running it

You need **Node.js 20+**, **npm** and **Google Chrome**. You log in to X through Chrome, and Kyrelo drives it to post and scrape.

```bash
git clone https://github.com/sobytes/Kyrelo.git
cd Kyrelo
./build.sh desktop run
```

The first run installs dependencies and downloads Playwright's Chromium, so give it a minute. The app window opens on its own.

Then, in the app:

1. **Connected** → connect your X account (you log in to X in a normal Chrome window).
2. **Settings → API keys** → add a Claude or OpenAI key for AI replies, rewrites and auto campaigns. The page has step-by-step instructions for getting one.
3. **Scheduler** → write and schedule posts, or use **✨ Auto-generate campaign**.

Your data (keys, X session, scheduled posts, uploads) stays on your machine in the app's data folder and is never committed.

### build.sh

Everything goes through `build.sh` at the repo root. Run it with no arguments for the full list.

| Command | What it does |
|---|---|
| `./build.sh desktop run` | Launch the desktop app in dev mode |
| `./build.sh website run` | Website on http://localhost:3000 |
| `./build.sh desktop` | Production build of the desktop app |
| `./build.sh website` | Production build of the website |
| `./build.sh check` | Type-check both apps and scan for committed secrets |
| `./build.sh desktop pack` | Unsigned `.app` / `.exe` in `desktop/dist/` to try locally |
| `./build.sh desktop release test` | Dry run of the release build (no notarising, push or upload) |
| `./build.sh desktop release` | Maintainers only: publish a signed release (below) |

On Windows, run `build.sh` from Git Bash.

### Releasing (maintainers)

`./build.sh desktop release` runs `check` first and only starts from a clean `main`.

- **macOS** bumps the patch version, commits and tags it, builds, signs and notarises, pushes, and creates the GitHub release with the `.dmg`. Needs `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` in `desktop/.env.local`, a Developer ID certificate in the keychain, and `gh auth login`.
- **Windows**, run afterwards on a Windows machine, builds and signs the installer and attaches it to the same release. Needs `WINDOWS_CERT_THUMBPRINT` in `desktop/.env.local` and `gh auth login`.

See `desktop/.env.example` for every variable.

### Website

Plain Next.js + Tailwind. Vercel deploys it from `main` with **Root Directory = `website`**. See [`website/README.md`](./website/README.md).
