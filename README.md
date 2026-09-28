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

## Quick start

`build.sh` at the repo root wraps the common tasks:

```bash
./build.sh desktop run          # launch the desktop app in dev mode
./build.sh website run          # website on http://localhost:3000
./build.sh check                # type-check both apps + secret scan
./build.sh desktop pack         # unsigned local build in desktop/dist/
./build.sh desktop release test # dry run of the release build
./build.sh desktop release      # checks, then sign, notarise and publish
```

Run `./build.sh` with no arguments for the full list. Or do it by hand:

### Desktop app

```bash
cd desktop
cp .env.example .env.local      # set ANTHROPIC_API_KEY
npm install
npx playwright install chromium
npm run desktop
```

See [`desktop/`](./desktop) for the full guide, release process, and architecture.

### Website

```bash
cd website
npm install
npm run dev                     # http://localhost:3001
```
