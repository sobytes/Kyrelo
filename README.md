# Kyrelo — Community Driven Buffer Alternative

A local desktop app, iPhone companion and marketing site for **Kyrelo**, the open-source, community-driven Buffer alternative for X, Bluesky, Mastodon and Threads.

- **Publish:** schedule posts to X, Bluesky, Mastodon and Threads, or let an AI auto campaign research, write and space out a series of X posts.
- **Engage:** watch X handles in the Monitor; Autopilot drafts replies under new posts for you to pick, edit and send yourself.
- **Clean up:** bulk delete posts, replies and reposts, unlike likes, and unfollow dead, bot-like or never-engaging accounts with a reason for each.

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
| [`desktop/`](./desktop) | The Electron + Next.js + Playwright app, organised by service (X, Bluesky, Mastodon, Threads), each with its own sections: Scheduler, auto campaigns, Monitor + Autopilot, Deleter and Unfollow. Built for macOS first. |
| [`mobile/ios/`](./mobile/ios) | Native iPhone app (SwiftUI), paired with the desktop app, which does the work: the Monitor feed and reply drafts, the Scheduler with photos, and auto campaigns. Xcode project generated from `project.yml` by XcodeGen and committed. |
| [`contracts/`](./contracts) | Rules the desktop and iOS apps must agree on, as test fixtures both apps' tests read. |
| [`website/`](./website) | The marketing site at [kyrelo.com](https://kyrelo.com). Plain Next.js + Tailwind, deploys to Vercel with **Root Directory = `website`**. |

## Running it

You need **Node.js 20+**, **npm** and **Google Chrome**. You log in to X through Chrome, and Kyrelo drives it to post and scrape. Bluesky connects with an app password.

```bash
git clone https://github.com/sobytes/Kyrelo.git
cd Kyrelo
./build.sh desktop run
```

The first run installs dependencies and downloads Playwright's Chromium, so give it a minute. The app window opens on its own.

The app opens on a home screen of services: X, Bluesky, Mastodon and Threads. Pick one to use its sections; Settings are shared by all of them. In the app:

1. **A service → Accounts** → connect it:
   - **X**: log in through a normal Chrome window.
   - **Bluesky**: your handle and an app password.
   - **Mastodon**: just your server's name; your browser asks you to approve Kyrelo.
   - **Threads**: a token from a Meta developer app (Meta requires it; the screen walks you through it, about five minutes, once). Threads posts are text only.
2. **Settings → API keys** → add a Claude or OpenAI key for AI replies, rewrites and auto campaigns. The page has step-by-step instructions for getting one.
3. **A service → Scheduler** → write and schedule posts, to that service and your other accounts too. On X, **Auto-generate campaign** plans a whole series.

Which sections each service has is set in [`contracts/services.json`](./contracts/services.json): X has Monitor, Scheduler, Deleter, Unfollow and Accounts; the others Scheduler and Accounts for now.

Your data (keys, X session, scheduled posts, uploads) stays on your machine in the app's data folder and is never committed.

### build.sh

Everything goes through `build.sh` at the repo root. Run it with no arguments for the full list.

| Command | What it does |
|---|---|
| `./build.sh desktop run` | Launch the desktop app in dev mode |
| `./build.sh website run` | Website on http://localhost:3000 |
| `./build.sh desktop` | Production build of the desktop app |
| `./build.sh website` | Production build of the website |
| `./build.sh ios` / `./build.sh ios run` | Build the iPhone app / run it in the simulator |
| `./build.sh check` | Type-check both apps, run the desktop and iOS tests, scan for committed secrets |
| `./build.sh desktop pack` | Unsigned `.app` / `.exe` in `desktop/dist/` to try locally |
| `./build.sh desktop release test` | Dry run of the release build (no notarising, push or upload) |
| `./build.sh desktop release` | Maintainers only: publish a signed release (below) |

On Windows, run `build.sh` from Git Bash.

### iPhone app

Turn on **Settings → Phone app** in the desktop app, then scan the code in the iPhone app. The phone shows your Monitor feed and Autopilot's drafts; tap a draft, and it copies the reply and opens the tweet in X for you to send. You can also schedule posts (with photos) and run auto campaigns. Your computer keeps doing the work, so Kyrelo has to be running there. It works on the same Wi-Fi, or anywhere with [Tailscale](https://tailscale.com) on both devices (use Tailscale on public Wi-Fi: the plain-Wi-Fi connection isn't encrypted).

### Releasing (maintainers)

`./build.sh desktop release` runs `check` first and only starts from a clean `main`.

- **macOS** bumps the patch version, commits and tags it, builds, signs and notarises, pushes, and creates the GitHub release with the `.dmg`. Needs `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` in `desktop/.env.local`, a Developer ID certificate in the keychain, and `gh auth login`.
- **Windows**, run afterwards on a Windows machine, builds and signs the installer and attaches it to the same release. Needs `WINDOWS_CERT_THUMBPRINT` in `desktop/.env.local` and `gh auth login`.

See `desktop/.env.example` for every variable.

### Website

Plain Next.js + Tailwind. Vercel deploys it from `main` with **Root Directory = `website`**. See [`website/README.md`](./website/README.md).

## Disclaimer

Kyrelo is an independent, open-source experiment, provided as is under the [MIT license](./LICENSE). It isn't affiliated with, endorsed by or sponsored by X Corp., Bluesky, Buffer, TweetDelete, Anthropic or OpenAI; their names are used only to describe what Kyrelo works with or compares to, and remain their owners' trademarks.

You're responsible for how you use it, including following each platform's terms and automation rules. Kyrelo drives your own logged-in browser to post, delete, follow and read X, which X's terms restrict, and X may limit or suspend accounts it thinks are automated. Kyrelo never sends replies for you, and paces bulk actions, but use it at your own risk.

