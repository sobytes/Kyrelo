"use client";
import { useEffect, useRef, useState } from "react";
import { GrokSettings, GrokState, SeenTweet } from "@/lib/types";

declare global {
  interface Window {
    electronAPI?: {
      isElectron: true;
      openExternal?: (url: string) => Promise<boolean>;
    };
  }
}

function openExternal(url: string) {
  if (window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

const POLL_MS = 8_000;

const SUGGESTED_HANDLES: { group: string; handles: string[] }[] = [
  {
    group: "AI labs & researchers",
    handles: [
      "sama",
      "gdb",
      "karpathy",
      "AnthropicAI",
      "OpenAI",
      "ylecun",
      "demishassabis",
      "GoogleDeepMind",
      "xai",
      "grok",
    ],
  },
  {
    group: "Founders & VC",
    handles: ["elonmusk", "pmarca", "paulg", "naval", "balajis", "tobi", "patrickc"],
  },
  { group: "Tech news", handles: ["TechCrunch", "TheVerge", "WIRED", "arstechnica", "Worldnewsapp"] },
  { group: "Workforce / business", handles: ["LinkedInNews", "WSJ", "business"] },
];

// --- Connect state, hoisted to top so the hero can drive it -----------------

type ConnectPhase = "idle" | "starting" | "connecting" | "saving";

interface ConnectState {
  connected: boolean;
  phase: ConnectPhase;
  start: () => void;
  done: () => void;
  cancel: () => void;
  refresh: () => void;
}

function useConnect(): ConnectState {
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<ConnectPhase>("idle");

  async function refresh() {
    const r = await fetch("/api/twitter-connect").then((r) => r.json());
    setConnected(Array.isArray(r.accounts) && r.accounts.length > 0);
    setPhase((p) => (r.connecting && p === "idle" ? "connecting" : p));
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setPhase("starting");
    const r = await fetch("/api/twitter-connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    }).then((r) => r.json());
    if (r.error) {
      if (r.chromeMissing) {
        if (confirm(`${r.error}\n\nOpen the Chrome download page now?`)) {
          openExternal("https://www.google.com/chrome/");
        }
      } else {
        alert(r.error);
      }
      setPhase("idle");
    } else {
      setPhase("connecting");
    }
  }

  async function done() {
    setPhase("saving");
    const r = await fetch("/api/twitter-connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "done" }),
    }).then((r) => r.json());
    if (r.error) {
      alert(r.error);
      setPhase("connecting");
      return;
    }
    setPhase("idle");
    refresh();
  }

  async function cancel() {
    await fetch("/api/twitter-connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    setPhase("idle");
    refresh();
  }

  return { connected, phase, start, done, cancel, refresh };
}

// --- Main panel -------------------------------------------------------------

export function DetectorPanel() {
  const [settings, setSettings] = useState<GrokSettings | null>(null);
  const [state, setState] = useState<GrokState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [replyingTweet, setReplyingTweet] = useState<SeenTweet | null>(null);
  const [handleInput, setHandleInput] = useState("");
  const [showSuggested, setShowSuggested] = useState(false);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const connect = useConnect();

  async function load() {
    const [s, st] = await Promise.all([
      fetch("/api/grok-settings").then((r) => r.json()),
      fetch("/api/grok-state").then((r) => r.json()),
    ]);
    setSettings(s.settings);
    setState(st.state);

    if (s.settings?.notifyDesktop && typeof Notification !== "undefined") {
      const ids: SeenTweet[] = st.state?.tweets ?? [];
      const prev = prevIdsRef.current;
      if (prev.size === 0 && ids.length > 0) {
        prevIdsRef.current = new Set(ids.map((t) => t.id));
      } else {
        const fresh = ids.filter((t) => !prev.has(t.id) && !t.skipped);
        if (fresh.length > 0) playChime();
        for (const t of fresh) fireBrowserNotification(t);
        prevIdsRef.current = new Set(ids.map((t) => t.id));
      }
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      settings?.notifyDesktop &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(() => {});
    }
  }, [settings?.notifyDesktop]);

  if (!settings || !state) {
    return <div className="card text-sm text-zinc-500">Loading…</div>;
  }

  async function save(next: GrokSettings) {
    setSettings(next);
    await fetch("/api/grok-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    // Settings change can wipe state — reload.
    fetch("/api/grok-state")
      .then((r) => r.json())
      .then((j) => setState(j.state));
  }

  function addHandle() {
    const h = handleInput.trim().replace(/^@/, "").toLowerCase();
    if (!h || settings!.handles.includes(h)) {
      setHandleInput("");
      return;
    }
    save({ ...settings!, handles: [...settings!.handles, h] });
    setHandleInput("");
  }

  function removeHandle(h: string) {
    save({ ...settings!, handles: settings!.handles.filter((x) => x !== h) });
  }

  function removeAllHandles() {
    if (!settings!.handles.length) return;
    if (!confirm(`Remove all ${settings!.handles.length} watched handles?`)) return;
    save({ ...settings!, handles: [] });
  }

  function addGroup(handles: string[]) {
    const existing = new Set(settings!.handles.map((h) => h.toLowerCase()));
    const additions = handles
      .map((h) => h.toLowerCase())
      .filter((h) => !existing.has(h));
    if (additions.length === 0) return;
    save({ ...settings!, handles: [...settings!.handles, ...additions] });
  }

  function toggleSuggested(h: string) {
    const lower = h.toLowerCase();
    const isOn = settings!.handles.some((x) => x.toLowerCase() === lower);
    save({
      ...settings!,
      handles: isOn
        ? settings!.handles.filter((x) => x.toLowerCase() !== lower)
        : [...settings!.handles, lower],
    });
  }

  async function refreshNow() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/grok-run", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) alert(`Run failed: ${json.error ?? res.status}`);
      else if (json.skipped) console.log(`Skipped: ${json.skipped}`);
    } finally {
      setRefreshing(false);
      load();
    }
  }

  function openReply(t: SeenTweet) {
    setReplyingTweet(t);
  }

  const tweets = [...state.tweets].sort((a, b) =>
    (b.postedAt ?? b.seenAt).localeCompare(a.postedAt ?? a.seenAt),
  );

  return (
    <div className="space-y-5">
      <Hero
        settings={settings}
        state={state}
        connect={connect}
        refreshing={refreshing}
        onToggleWatching={() => save({ ...settings, enabled: !settings.enabled })}
        onRefreshNow={refreshNow}
      />

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <HandlesCard
            settings={settings}
            handleInput={handleInput}
            setHandleInput={setHandleInput}
            onAdd={addHandle}
            onRemove={removeHandle}
            onRemoveAll={removeAllHandles}
            showSuggested={showSuggested}
            setShowSuggested={setShowSuggested}
            onToggleSuggested={toggleSuggested}
            onAddGroup={addGroup}
          />
        </aside>

        <section className="min-h-[200px]">
          <Feed
            tweets={tweets}
            onReply={openReply}
            settings={settings}
            connected={connect.connected}
          />
        </section>
      </div>

      {replyingTweet && (
        <ReplyModal
          tweet={replyingTweet}
          aiProvider={settings.aiProvider}
          onClose={() => setReplyingTweet(null)}
          onMarked={() => {
            setReplyingTweet(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// --- Hero -------------------------------------------------------------------

function Hero({
  settings,
  state,
  connect,
  refreshing,
  onToggleWatching,
  onRefreshNow,
}: {
  settings: GrokSettings;
  state: GrokState;
  connect: ConnectState;
  refreshing: boolean;
  onToggleWatching: () => void;
  onRefreshNow: () => void;
}) {
  // Decide phase
  const needsConnect = !connect.connected && connect.phase === "idle";
  const inLogin = connect.phase === "starting" || connect.phase === "connecting" || connect.phase === "saving";
  const needsHandles = settings.handles.length === 0;
  const watching = settings.enabled && !needsConnect && !needsHandles && !inLogin;

  const lastCheckAgo = state.lastCheckedAt
    ? timeAgo(state.lastCheckedAt)
    : null;

  return (
    <div
      className={
        "relative overflow-hidden rounded-2xl border p-5 transition-all " +
        (watching ? "border-live/40 hero-live" : "border-line hero")
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <StatusDot watching={watching} inLogin={inLogin} />
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
              {watching
                ? "Watching"
                : inLogin
                  ? "Connecting"
                  : needsConnect
                    ? "Setup"
                    : needsHandles
                      ? "Setup"
                      : "Paused"}
            </div>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-zinc-100">
              {watching && `Monitoring ${settings.handles.length} ${settings.handles.length === 1 ? "handle" : "handles"} on X`}
              {!watching && inLogin && connect.phase === "saving" && "Saving session…"}
              {!watching && inLogin && connect.phase === "starting" && "Opening Chrome…"}
              {!watching && inLogin && connect.phase === "connecting" &&
                "Log in to X in the Chrome window"}
              {!watching && !inLogin && needsConnect && "Connect your X account"}
              {!watching && !inLogin && !needsConnect && needsHandles &&
                "Add handles to watch"}
              {!watching && !inLogin && !needsConnect && !needsHandles &&
                "Ready to watch"}
            </h1>
            <p className="mt-0.5 text-sm text-zinc-400">
              {watching && (
                <>
                  Last check {lastCheckAgo ?? "never"} •{" "}
                  {state.tweets.filter((t) => !t.skipped).length} tweets tracked
                </>
              )}
              {!watching && inLogin && connect.phase === "connecting" &&
                "After you log in, come back and click I'm logged in."}
              {!watching && !inLogin && needsConnect &&
                "Sign in once — the session is saved for future scrapes and replies."}
              {!watching && !inLogin && !needsConnect && needsHandles &&
                "Pick at least one handle in the sidebar to start."}
              {!watching && !inLogin && !needsConnect && !needsHandles &&
                "Click Start Watching to begin polling every 90 seconds."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {needsConnect && (
            <button onClick={connect.start} className="btn-primary">
              Connect with X
            </button>
          )}

          {inLogin && connect.phase === "connecting" && (
            <>
              <button onClick={connect.done} className="btn-primary">
                I&apos;m logged in
              </button>
              <button onClick={connect.cancel} className="btn-ghost">
                Cancel
              </button>
            </>
          )}

          {!needsConnect && !inLogin && (
            <>
              <button
                onClick={onRefreshNow}
                disabled={refreshing}
                className="btn-ghost"
                title="Run one scrape now"
              >
                {refreshing ? "Checking…" : "Check now"}
              </button>
              <button
                onClick={onToggleWatching}
                disabled={needsHandles}
                className={watching ? "btn-live" : "btn-primary"}
              >
                {watching ? "Pause" : "Start watching"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Subtle bottom strip when watching */}
      {watching && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-live/40 to-transparent" />
      )}
    </div>
  );
}

function StatusDot({ watching, inLogin }: { watching: boolean; inLogin: boolean }) {
  if (watching) {
    return (
      <div className="mt-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-live/10">
        <span className="live-dot" />
      </div>
    );
  }
  if (inLogin) {
    return (
      <div className="mt-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10">
        <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />
      </div>
    );
  }
  return (
    <div className="mt-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800/50">
      <span className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-600" />
    </div>
  );
}

// --- Sidebar cards ----------------------------------------------------------

function HandlesCard({
  settings,
  handleInput,
  setHandleInput,
  onAdd,
  onRemove,
  onRemoveAll,
  showSuggested,
  setShowSuggested,
  onToggleSuggested,
  onAddGroup,
}: {
  settings: GrokSettings;
  handleInput: string;
  setHandleInput: (s: string) => void;
  onAdd: () => void;
  onRemove: (h: string) => void;
  onRemoveAll: () => void;
  showSuggested: boolean;
  setShowSuggested: (b: boolean) => void;
  onToggleSuggested: (h: string) => void;
  onAddGroup: (handles: string[]) => void;
}) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="label !mb-0">Watching</div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500">
            {settings.handles.length} handle{settings.handles.length !== 1 && "s"}
          </span>
          {settings.handles.length > 0 && (
            <button
              onClick={onRemoveAll}
              className="text-[10px] text-zinc-500 underline-offset-2 hover:text-rose-400 hover:underline"
            >
              Remove all
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {settings.handles.length === 0 ? (
          <span className="text-xs text-zinc-500">None yet.</span>
        ) : (
          settings.handles.map((h) => (
            <span key={h} className="chip-on">
              @{h}
              <button
                onClick={() => onRemove(h)}
                className="-mr-1 ml-0.5 rounded-full px-1 text-zinc-500 hover:text-rose-400"
                title="Remove"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="add handle (no @)"
          value={handleInput}
          onChange={(e) => setHandleInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
        />
        <button onClick={onAdd} className="btn-ghost">
          Add
        </button>
      </div>

      <button
        onClick={() => setShowSuggested(!showSuggested)}
        className="w-full rounded-md border border-line py-1.5 text-xs text-zinc-400 hover:border-line2 hover:text-zinc-200"
      >
        {showSuggested ? "Hide suggested" : "Suggested handles ▾"}
      </button>

      {showSuggested && (
        <div className="space-y-3 pt-1 animate-fade-in">
          {SUGGESTED_HANDLES.map((group) => {
            const allOn = group.handles.every((h) =>
              settings.handles.some((x) => x.toLowerCase() === h.toLowerCase()),
            );
            return (
              <div key={group.group}>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                    {group.group}
                  </div>
                  {!allOn && (
                    <button
                      onClick={() => onAddGroup(group.handles)}
                      className="text-[10px] text-zinc-500 underline-offset-2 hover:text-accent hover:underline"
                    >
                      Add all
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.handles.map((h) => {
                    const isOn = settings.handles.some(
                      (x) => x.toLowerCase() === h.toLowerCase(),
                    );
                    return (
                      <button
                        key={h}
                        onClick={() => onToggleSuggested(h)}
                        className={isOn ? "chip-on" : "chip-suggest"}
                      >
                        {isOn ? "−" : "+"} @{h}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Feed -------------------------------------------------------------------

function Feed({
  tweets,
  onReply,
  settings,
  connected,
}: {
  tweets: SeenTweet[];
  onReply: (t: SeenTweet) => void;
  settings: GrokSettings;
  connected: boolean;
}) {
  if (!connected) {
    return (
      <div className="card flex h-48 items-center justify-center text-sm text-zinc-500">
        Connect X to populate the feed.
      </div>
    );
  }

  if (settings.handles.length === 0) {
    return (
      <div className="card flex h-48 items-center justify-center text-sm text-zinc-500">
        Add a handle to start watching.
      </div>
    );
  }

  if (tweets.length === 0) {
    return (
      <div className="card flex h-48 flex-col items-center justify-center gap-1 text-sm text-zinc-500">
        <span>No tweets yet.</span>
        <span className="text-xs">
          {settings.enabled
            ? "Polling every 90 seconds. Hit Check now to scrape immediately."
            : "Start watching to begin polling."}
        </span>
      </div>
    );
  }

  return (
    <div className="feed space-y-3">
      {tweets.map((t) => (
        <TweetCard key={t.id} tweet={t} onReply={() => onReply(t)} />
      ))}
    </div>
  );
}

function TweetCard({
  tweet,
  onReply,
}: {
  tweet: SeenTweet;
  onReply: () => void;
}) {
  const when = tweet.postedAt ?? tweet.seenAt;
  const { bg, fg } = avatarColors(tweet.handle);
  return (
    <article className="group card-tight transition-colors hover:border-line2">
      <div className="flex gap-3">
        <div className="avatar" style={{ background: bg, color: fg }}>
          {(tweet.handle[0] ?? "?").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 text-sm">
            <a
              href={`https://x.com/${tweet.handle}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-zinc-100 hover:underline"
            >
              @{tweet.handle}
            </a>
            <span className="text-xs text-zinc-500">
              {tweet.isReply ? "replied" : "posted"} {timeAgo(when)}
            </span>
          </div>

          <div className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-zinc-200">
            {tweet.text}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <a
              href={tweet.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              open on X ↗
            </a>

            {tweet.repliedAt ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                replied {new Date(tweet.repliedAt).toLocaleTimeString()}
              </span>
            ) : (
              <button onClick={onReply} className="btn-primary text-xs">
                Reply with @grok
              </button>
            )}
          </div>

          {tweet.replyText && (
            <div className="mt-3 rounded-md border border-emerald-900/50 bg-emerald-950/30 p-2.5 text-sm leading-snug text-emerald-200">
              {tweet.replyText}
            </div>
          )}
          {tweet.replyError && (
            <div className="mt-3 rounded-md border border-rose-900/50 bg-rose-950/30 p-2.5 text-xs leading-snug text-rose-300">
              {tweet.replyError}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// --- Reply modal ------------------------------------------------------------

function ReplyModal({
  tweet,
  aiProvider,
  onClose,
  onMarked,
}: {
  tweet: SeenTweet;
  aiProvider: "claude" | "openai";
  onClose: () => void;
  onMarked: () => void;
}) {
  const [replyText, setReplyText] = useState(tweet.replyText ?? "");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch("/api/grok-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", tweetId: tweet.id }),
      }).then((r) => r.json());
      if (r.ok && r.reply) {
        setReplyText(r.reply);
      } else {
        setError(r.error ?? "Failed to generate");
      }
    } finally {
      setGenerating(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(replyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function openOnX() {
    if (!replyText.trim()) return;
    // Open first so the user-gesture timing isn't lost across awaits.
    openExternal(tweet.url);
    try {
      await navigator.clipboard.writeText(replyText);
    } catch {
      // clipboard may be denied — user can still copy manually
    }
    await fetch("/api/grok-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark", tweetId: tweet.id, replyText }),
    });
    onMarked();
  }

  const providerName = aiProvider === "openai" ? "OpenAI" : "Claude";
  const overLimit = replyText.length > 270;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-line bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="label !mb-0">Reply to @{tweet.handle}</div>
            <p className="mt-1 text-xs text-zinc-500">
              Generate with {providerName}, edit if you like, then open on X to paste.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full px-2 py-0.5 text-zinc-500 hover:bg-panel2 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        <div className="mb-3 max-h-24 overflow-y-auto rounded-md border border-line bg-ink/50 p-2.5 text-sm leading-snug text-zinc-300">
          {tweet.text}
        </div>

        <textarea
          className="textarea h-32 resize-none"
          placeholder={generating ? "Generating…" : "Click Generate reply, or write one yourself."}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          disabled={generating}
        />
        <div className="mt-1 flex items-center justify-between text-[10px]">
          <span className={overLimit ? "text-rose-400" : "text-zinc-500"}>
            {replyText.length} / 270
          </span>
          {error && <span className="text-rose-400">{error}</span>}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={generate}
            disabled={generating}
            className="btn-ghost text-xs"
          >
            {generating
              ? "Generating…"
              : replyText
                ? `Regenerate with ${providerName}`
                : `Generate reply with ${providerName}`}
          </button>
          <button
            onClick={copy}
            disabled={!replyText.trim()}
            className="btn-ghost text-xs"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <div className="ml-auto" />
          <button
            onClick={openOnX}
            disabled={!replyText.trim() || overLimit}
            className="btn-primary text-xs"
          >
            Open post on X (copies)
          </button>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
          Clicking Open will copy the reply to your clipboard, mark this tweet as replied, and open
          it in your browser. Paste with ⌘V.
        </p>
      </div>
    </div>
  );
}

// --- helpers ----------------------------------------------------------------

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const AVATAR_PALETTE = [
  { bg: "#7c5cff", fg: "#fff" },
  { bg: "#10b981", fg: "#062821" },
  { bg: "#f59e0b", fg: "#3b2400" },
  { bg: "#ef4444", fg: "#3a0d0d" },
  { bg: "#0ea5e9", fg: "#022134" },
  { bg: "#a855f7", fg: "#2c0d4c" },
  { bg: "#ec4899", fg: "#4a0a2a" },
  { bg: "#22c55e", fg: "#052e16" },
];

function avatarColors(handle: string) {
  let h = 0;
  for (let i = 0; i < handle.length; i++) {
    h = (h * 31 + handle.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function fireBrowserNotification(t: SeenTweet) {
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(`@${t.handle} ${t.isReply ? "replied" : "posted"}`, {
      body: t.text.slice(0, 140),
      tag: t.id,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // ignore
  }
}

// Synthesized two-tone futuristic chime + high shimmer — no asset file needed.
// Lives on a single shared AudioContext so we don't leak contexts on every poll.
let sharedAudioCtx: AudioContext | null = null;

function playChime() {
  try {
    type CtxCtor = typeof AudioContext;
    const Ctor: CtxCtor | undefined =
      (window as unknown as { AudioContext?: CtxCtor }).AudioContext ??
      (window as unknown as { webkitAudioContext?: CtxCtor }).webkitAudioContext;
    if (!Ctor) return;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctor();
    const ctx = sharedAudioCtx;
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);

    // E6 → A6, quick attack, gentle exponential decay
    for (const [freq, start] of [
      [1320, 0],
      [1760, 0.09],
    ] as [number, number][]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(1, now + start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.55);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now + start);
      osc.stop(now + start + 0.6);
    }

    // High triangle shimmer fades in slightly later for sparkle
    const shimmer = ctx.createOscillator();
    const shimmerGain = ctx.createGain();
    shimmer.type = "triangle";
    shimmer.frequency.value = 3520;
    shimmerGain.gain.setValueAtTime(0.0001, now + 0.18);
    shimmerGain.gain.exponentialRampToValueAtTime(0.18, now + 0.2);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(master);
    shimmer.start(now + 0.18);
    shimmer.stop(now + 0.85);
  } catch {
    // ignore — audio is best-effort
  }
}
