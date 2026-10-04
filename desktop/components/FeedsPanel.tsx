"use client";
import { useEffect, useState } from "react";
import { PLATFORMS } from "@/lib/platforms";
import { Account, FeedRule } from "@/lib/types";
import { PlatformBadge } from "./PlatformBadge";

// RSS and Atom auto-posting (lib/feeds.ts), in the Scheduler: the feeds being
// watched, and adding one.

type Feed = Omit<FeedRule, "seen"> & { seenCount: number };

const key = (a: { platform: string; id: string }) => `${a.platform}:${a.id}`;

export function FeedsPanel({ accounts }: { accounts: Account[] }) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [defaultTemplate, setDefaultTemplate] = useState("{title}\n\n{link}");
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [template, setTemplate] = useState<string | null>(null);
  const [useAi, setUseAi] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Video-only platforms can't take a text post.
  const postable = accounts.filter((a) => !PLATFORMS[a.platform].requiresVideo);

  async function load() {
    const r = await fetch("/api/feeds").then((res) => res.json());
    setFeeds(r.feeds ?? []);
    if (r.defaultTemplate) setDefaultTemplate(r.defaultTemplate);
  }

  useEffect(() => {
    void load();
  }, []);

  async function post(body: object) {
    const r = await fetch("/api/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => res.json());
    await load();
    return r as { error?: string; scheduled?: number };
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const targets = postable.filter((a) => picked.includes(key(a))).map((a) => ({ platform: a.platform, accountId: a.id }));
      const r = await post({ action: "add", url, template: template ?? defaultTemplate, useAi, targets });
      if (r.error) {
        setError(r.error);
      } else {
        setAdding(false);
        setUrl("");
        setTemplate(null);
        setUseAi(false);
        setPicked([]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(feed: Feed) {
    if (!confirm(`Stop posting from ${feed.title}?`)) return;
    await post({ action: "remove", id: feed.id });
  }

  const handle = (t: { platform: string; accountId: string }) =>
    accounts.find((a) => a.platform === t.platform && a.id === t.accountId)?.handle ?? t.accountId;

  return (
    <section className="section space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="label !mb-0">Auto-post from a feed</div>
          <p className="mt-1 text-xs text-muted">
            New articles in an RSS or Atom feed (your blog, newsletter or YouTube channel) are queued as posts to the
            accounts you pick.
          </p>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn-ghost shrink-0 text-xs">
            Add feed
          </button>
        )}
      </div>

      {feeds.map((f) => (
        <div key={f.id} className="card-tight space-y-1.5 text-xs">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-fg">{f.title}</div>
              <div className="truncate font-mono text-[11px] text-muted">{f.url}</div>
            </div>
            <button type="button" onClick={() => remove(f)} className="text-[11px] text-muted hover:text-error">
              Remove
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-muted">
            {f.targets.map((t) => (
              <span key={key({ platform: t.platform, id: t.accountId })} className="inline-flex items-center gap-1">
                <PlatformBadge platform={t.platform} />@{handle(t)}
              </span>
            ))}
            <span>· {f.useAi ? "written by AI for each platform" : "from the template"}</span>
            {f.lastCheckedAt && <span>· checked {new Date(f.lastCheckedAt).toLocaleTimeString()}</span>}
          </div>
          {f.error && <div className="text-error">{f.error}</div>}
        </div>
      ))}

      {adding && (
        <form onSubmit={add} className="card space-y-3">
          <input
            className="input text-sm"
            placeholder="https://example.com/feed.xml"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoComplete="off"
          />
          <div>
            <div className="label">Post to</div>
            <div className="flex flex-wrap gap-2">
              {postable.map((a) => {
                const on = picked.includes(key(a));
                return (
                  <button
                    key={key(a)}
                    type="button"
                    onClick={() => setPicked((p) => (on ? p.filter((k) => k !== key(a)) : [...p, key(a)]))}
                    className={
                      "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs transition " +
                      (on ? "border-primary bg-primary/10 text-fg" : "border-line text-muted hover:text-fg")
                    }
                  >
                    <PlatformBadge platform={a.platform} />@{a.handle}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-fg">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            Have the AI write each post for its platform (needs an API key; the template is the fallback)
          </label>
          <div>
            <div className="label">Template</div>
            <textarea
              className="textarea h-20 resize-y font-mono text-xs"
              value={template ?? defaultTemplate}
              onChange={(e) => setTemplate(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted">
              <code>{"{title}"}</code>, <code>{"{link}"}</code> and <code>{"{summary}"}</code> are filled in from each
              article. Articles already in the feed aren&apos;t posted, only new ones.
            </p>
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !url.trim() || picked.length === 0} className="btn-primary text-sm">
              {busy ? "Checking the feed…" : "Add feed"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn-ghost text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
