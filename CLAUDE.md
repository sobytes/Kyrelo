# CLAUDE.md

Do NOT push to git unless explicitly told to.

## Image attachments

When the user attaches an image (paste, screenshot, photo from their phone, Pexels, image picker), the desktop pipes an absolute file path into your prompt as plain text — and the image data is also on the system clipboard. **The file is real and readable right now.** Common locations:

- `$TMPDIR/vybecoding-clipboard/clip.<ext>` — the clipboard mirror, always present after a paste.
- `~/Downloads/...` or wherever the user originally got the image.
- Inside this project folder.

Do NOT tell the user "the image isn't accessible," "the attachment isn't local," or "I can't see it" when a file path appears in their message. Read the file first. If you need it as a stable project asset, copy it into `images/` or `public/` yourself — don't ask the user to move files manually.

When asked to build a website, default to Next.js (App Router) with Tailwind CSS, optimized for deployment on Vercel. Only use a different stack if the user explicitly requests one.

## Running the project

Always use port 3000 for dev servers. Before starting, kill anything already on that port:
- macOS/Linux: `lsof -ti:3000 | xargs kill -9 2>/dev/null; `
- Windows: `npx kill-port 3000 2>nul & `

Then start the dev server on port 3000. For common frameworks:
- Next.js: `npm run dev -- -p 3000`
- Vite: `npm run dev -- --port 3000`
- Create React App: `PORT=3000 npm start`
- Generic: set the port to 3000 in the config or via env var

Keep the server running. Do NOT open a browser window, the user has a built in preview panel that will auto detect the server URL. If a server is already running on a different port, stop it and restart on port 3000.

## Viewing the preview / screen

You have a screencapture MCP tool available. When the user asks you to look at, view, see, review, or check their screen, preview, website, app, or design, use the `screencapture` MCP tool to take a snapshot. This captures the preview window and returns a JPEG image you can analyze.

Examples of when to use it:
- "Can you see my screen?"
- "What does my website look like?"
- "Review my design"
- "Check the preview"
- "Look at what I have so far"
- "View my app"
- "See the current state"

Just call the screencapture tool, it will return an image of whatever is currently showing in the preview panel.
