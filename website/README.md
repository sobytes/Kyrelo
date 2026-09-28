# kyrelo.com website

Marketing site for [Kyrelo](https://kyrelo.com) — the local Buffer alternative for X.

```bash
./build.sh website run   # from the repo root: http://localhost:3000
```

## Deploy to Vercel

In Vercel project settings, set **Root Directory** to `website`. Vercel will pick up the standard `package.json` + `next.config.mjs` and deploy.

Domain: `kyrelo.com` → point at the Vercel deployment.
