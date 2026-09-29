"use client";
import { useEffect, useRef, useState } from "react";
import { REPLY_MAX_LENGTH, tweetLength } from "@/lib/tweet";
import {
  AutopilotSettings,
  GrokSettings,
  GrokState,
  REPLY_STYLES,
  REPLY_TONES,
  ReplyDraft,
  ReplyStyle,
  SeenTweet,
} from "@/lib/types";
import { MAX_KEYWORD_LENGTH, MAX_KEYWORDS } from "@/lib/keywords";
import { HandleFinderModal } from "./HandleFinderModal";
import { openExternal, useAccounts } from "./useAccounts";

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

/** The Monitor reads timelines through an X account. */
function hasXAccount(connect: ReturnType<typeof useAccounts>): boolean {
  return connect.status?.accounts.some((a) => a.platform === "twitter") ?? false;
}

// --- Main panel -------------------------------------------------------------

export function DetectorPanel() {
  const [settings, setSettings] = useState<GrokSettings | null>(null);
  const [state, setState] = useState<GrokState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // The tweet being replied to, and the draft it starts from (if one was picked).
  const [replying, setReplying] = useState<{ tweet: SeenTweet; text?: string } | null>(null);
  const [handleInput, setHandleInput] = useState("");
  const [showSuggested, setShowSuggested] = useState(false);
  const [finding, setFinding] = useState(false);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const connect = useAccounts();
  const connected = hasXAccount(connect);

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
        // On macOS the background worker already shows a native notification
        // for each new tweet (worker/index.mjs); only notify here elsewhere.
        if (!navigator.userAgent.includes("Mac")) {
          for (const t of fresh) fireBrowserNotification(t);
        }
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
    return <div className="py-6 text-sm text-muted">Loading…</div>;
  }

  async function save(next: GrokSettings) {
    setSettings(next);
    const r = await fetch("/api/grok-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).then((r) => r.json());
    if (r.error) alert(r.error);
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

  /** From the handle finder: watch or stop watching several handles at once. */
  function setWatched(handles: string[], watch: boolean) {
    const lower = handles.map((h) => h.toLowerCase());
    const current = settings!.handles;
    save({
      ...settings!,
      handles: watch
        ? [...current, ...lower.filter((h) => !current.some((x) => x.toLowerCase() === h))]
        : current.filter((x) => !lower.includes(x.toLowerCase())),
    });
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

  function openReply(tweet: SeenTweet, text?: string) {
    setReplying({ tweet, text });
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
            onFind={connected ? () => setFinding(true) : undefined}
          />
          <KeywordsCard
            keywords={settings.keywords}
            tweets={state.tweets}
            onChange={(keywords) => save({ ...settings, keywords })}
          />
          <AutopilotCard
            autopilot={settings.autopilot}
            onChange={(autopilot) => save({ ...settings, autopilot })}
          />
        </aside>

        <section className="min-h-[200px]">
          <Feed
            tweets={tweets}
            onReply={openReply}
            settings={settings}
            connected={connected}
          />
        </section>
      </div>

      {finding && (
        <HandleFinderModal
          accounts={connect.status?.accounts.filter((a) => a.platform === "twitter") ?? []}
          watched={settings.handles.map((h) => h.toLowerCase())}
          onWatch={setWatched}
          onClose={() => setFinding(false)}
        />
      )}

      {replying && (
        <ReplyModal
          tweet={replying.tweet}
          initialText={replying.text}
          aiProvider={settings.aiProvider}
          onClose={() => setReplying(null)}
          onMarked={() => {
            setReplying(null);
            load();
          }}
          onDrafted={load}
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
  connect: ReturnType<typeof useAccounts>;
  refreshing: boolean;
  onToggleWatching: () => void;
  onRefreshNow: () => void;
}) {
  // Decide phase
  const connected = hasXAccount(connect);
  const needsConnect = !connected && connect.phase === "idle";
  // Only an X login matters here, not another platform's elsewhere.
  const inLogin = connect.phase !== "idle" && connect.phasePlatform === "twitter";
  const needsHandles = settings.handles.length === 0 && settings.keywords.length === 0;
  const watching = settings.enabled && !needsConnect && !needsHandles && !inLogin;

  const lastCheckAgo = state.lastCheckedAt
    ? timeAgo(state.lastCheckedAt)
    : null;

  return (
    <div
      className="pb-2"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <StatusDot watching={watching} inLogin={inLogin} />
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
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
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-fg">
              {watching && `Monitoring ${watchingSummary(settings)} on X`}
              {!watching && inLogin && connect.phase === "saving" && "Saving session…"}
              {!watching && inLogin && connect.phase === "starting" && "Opening Chrome…"}
              {!watching && inLogin && connect.phase === "connecting" &&
                "Log in to X in the Chrome window"}
              {!watching && !inLogin && needsConnect && "Connect your X account"}
              {!watching && !inLogin && !needsConnect && needsHandles &&
                "Add handles or keywords to watch"}
              {!watching && !inLogin && !needsConnect && !needsHandles &&
                "Ready to watch"}
            </h1>
            <p className="mt-0.5 text-sm text-muted">
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
                "Pick a handle or add a keyword in the sidebar to start."}
              {!watching && !inLogin && !needsConnect && !needsHandles &&
                "Click Start Watching to begin polling every 90 seconds."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {needsConnect && (
            <button onClick={() => connect.start("twitter")} className="btn-primary">
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

    </div>
  );
}

function StatusDot({ watching, inLogin }: { watching: boolean; inLogin: boolean }) {
  const colour = watching ? "bg-success" : inLogin ? "bg-warning" : "bg-muted";
  return <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${colour}`} />;
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
  onFind,
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
  /** Opens the handle finder; missing until an X account is connected. */
  onFind?: () => void;
}) {
  return (
    <div className="section space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="label !mb-0">Watching</div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted">
            {settings.handles.length} handle{settings.handles.length !== 1 && "s"}
          </span>
          {settings.handles.length > 0 && (
            <button
              onClick={onRemoveAll}
              className="text-[10px] text-muted underline-offset-2 hover:text-error hover:underline"
            >
              Remove all
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {settings.handles.length === 0 ? (
          <span className="text-xs text-muted">None yet.</span>
        ) : (
          settings.handles.map((h) => (
            <span key={h} className="chip-on">
              @{h}
              <button
                onClick={() => onRemove(h)}
                className="-mr-1 ml-0.5 rounded-sm px-1 text-muted hover:text-error"
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

      {onFind && (
        <button onClick={onFind} className="btn-ghost w-full text-xs">
          Find accounts for my brand
        </button>
      )}

      <button
        onClick={() => setShowSuggested(!showSuggested)}
        className="w-full rounded-md border border-line py-1.5 text-xs text-muted hover:border-muted hover:text-fg"
      >
        {showSuggested ? "Hide popular handles" : "Popular tech handles ▾"}
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
                  <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
                    {group.group}
                  </div>
                  {!allOn && (
                    <button
                      onClick={() => onAddGroup(group.handles)}
                      className="text-[10px] text-muted underline-offset-2 hover:text-primary hover:underline"
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

/** "3 handles and 2 keywords". */
function watchingSummary(settings: GrokSettings): string {
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  return [
    settings.handles.length ? count(settings.handles.length, "handle") : null,
    settings.keywords.length ? count(settings.keywords.length, "keyword") : null,
  ]
    .filter(Boolean)
    .join(" and ");
}

/** Words or phrases the Monitor searches X for, next to the watched handles. */
function KeywordsCard({
  keywords,
  tweets,
  onChange,
}: {
  keywords: string[];
  /** Everything the Monitor has seen, including matches too old to show. */
  tweets: SeenTweet[];
  onChange: (keywords: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const full = keywords.length >= MAX_KEYWORDS;

  // So a quiet keyword visibly works: when X last had a post mentioning it.
  function latestMatch(keyword: string): string | null {
    const dates = tweets
      .filter((t) => t.keyword?.toLowerCase() === keyword.toLowerCase())
      .map((t) => t.postedAt ?? t.seenAt);
    return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  }

  function add() {
    const k = input.replace(/\s+/g, " ").trim();
    setInput("");
    if (!k || keywords.some((x) => x.toLowerCase() === k.toLowerCase())) return;
    onChange([...keywords, k]);
  }

  return (
    <div className="section space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="label !mb-0">Keywords</div>
        <span className="text-[10px] text-muted">
          {keywords.length} / {MAX_KEYWORDS}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {keywords.length === 0 ? (
          <span className="text-xs text-muted">None yet.</span>
        ) : (
          keywords.map((k) => (
            <span key={k} className="chip-on">
              {k}
              <button
                onClick={() => onChange(keywords.filter((x) => x !== k))}
                className="-mr-1 ml-0.5 rounded-sm px-1 text-muted hover:text-error"
                title="Remove"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      {keywords.length > 0 && (
        <ul className="space-y-0.5 text-[10px] text-muted">
          {keywords.map((k) => {
            const latest = latestMatch(k);
            return (
              <li key={k}>
                “{k}”: {latest ? `latest post ${timeAgo(latest)}` : "no posts found yet"}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder={full ? `Up to ${MAX_KEYWORDS} keywords` : "e.g. buffer alternative"}
          value={input}
          maxLength={MAX_KEYWORD_LENGTH}
          disabled={full}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button onClick={add} disabled={full} className="btn-ghost">
          Add
        </button>
      </div>
      <p className="text-[10px] leading-relaxed text-muted">
        Posts from anyone that mention these show in the feed for a day, labelled, and Autopilot drafts replies
        for them. Phrases match as written; X search syntax works too (#tag, -word, lang:en). They don&apos;t send
        desktop notifications, since popular keywords match often.
      </p>
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
  onReply: (t: SeenTweet, text?: string) => void;
  settings: GrokSettings;
  connected: boolean;
}) {
  if (!connected) {
    return (
      <div className="flex h-48 rounded-lg border border-dashed border-line items-center justify-center text-sm text-muted">
        Connect X to populate the feed.
      </div>
    );
  }

  if (settings.handles.length === 0 && settings.keywords.length === 0) {
    return (
      <div className="flex h-48 rounded-lg border border-dashed border-line items-center justify-center text-sm text-muted">
        Add a handle or keyword to start watching.
      </div>
    );
  }

  if (tweets.length === 0) {
    return (
      <div className="flex h-48 rounded-lg border border-dashed border-line flex-col items-center justify-center gap-1 text-sm text-muted">
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
        <TweetCard key={t.id} tweet={t} onReply={(text) => onReply(t, text)} />
      ))}
    </div>
  );
}

function TweetCard({
  tweet,
  onReply,
}: {
  tweet: SeenTweet;
  /** Opens the reply window, starting from `text` when a draft was picked. */
  onReply: (text?: string) => void;
}) {
  const when = tweet.postedAt ?? tweet.seenAt;
  return (
    <article className="group card-tight transition-colors hover:border-muted">
      <div className="flex gap-3">
        <div className="avatar">
          {(tweet.handle[0] ?? "?").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 text-sm">
            <a
              href={`https://x.com/${tweet.handle}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-fg hover:underline"
            >
              @{tweet.handle}
            </a>
            <span className="text-xs text-muted">
              {tweet.isReply ? "replied" : "posted"} {timeAgo(when)}
            </span>
            {tweet.keyword && (
              <span className="rounded-sm bg-accent/30 px-1.5 py-0.5 font-mono text-[11px] text-fg" title="Found by a keyword search">
                “{tweet.keyword}”
              </span>
            )}
          </div>

          <div className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-fg">
            {tweet.text}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <a
              href={tweet.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted hover:text-fg"
            >
              open on X ↗
            </a>

            {tweet.repliedAt ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                replied {new Date(tweet.repliedAt).toLocaleTimeString()}
              </span>
            ) : (
              <button onClick={() => onReply()} className="btn-ghost text-xs">
                Reply
              </button>
            )}
          </div>

          {tweet.draft && !tweet.repliedAt && <DraftSuggestions draft={tweet.draft} onUse={onReply} />}

          {tweet.replyText && (
            <div className="mt-3 rounded-md border border-success/30 bg-success/5 p-2.5 text-sm leading-snug text-success">
              {tweet.replyText}
            </div>
          )}
          {tweet.replyError && (
            <div className="mt-3 rounded-md border border-error/30 bg-error/5 p-2.5 text-xs leading-snug text-error">
              {tweet.replyError}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** Autopilot's verdict on a tweet and its draft replies. */
function DraftSuggestions({ draft, onUse }: { draft: ReplyDraft; onUse: (text?: string) => void }) {
  if (draft.options.length === 0) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span>
          Autopilot skipped ({draft.score}/100): {draft.reason}
        </span>
        <button onClick={() => onUse()} className="text-muted underline hover:text-fg">
          Draft anyway
        </button>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-2 rounded-md border border-line bg-canvas p-2.5">
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <span className="rounded-sm bg-primary/10 px-2 py-0.5 font-semibold text-primary">{draft.score}/100</span>
        <span>{draft.reason}</span>
      </div>
      {draft.options.map((option, i) => (
        <div key={i} className="flex items-start justify-between gap-3">
          <p className="text-sm leading-snug text-fg">{option}</p>
          <button onClick={() => onUse(option)} className="btn-ghost shrink-0 text-xs">
            Use
          </button>
        </div>
      ))}
    </div>
  );
}

// --- Autopilot ----------------------------------------------------------------

const STYLE_LABELS: Record<ReplyStyle, string> = {
  grok: "Ask @grok",
  direct: "Direct reply",
  mix: "Mix",
};

function AutopilotCard({
  autopilot,
  onChange,
}: {
  autopilot: AutopilotSettings;
  onChange: (next: AutopilotSettings) => void;
}) {
  // Sliders and text fields edit a local copy and save when released / left,
  // so dragging or typing doesn't send a request per step.
  const [draft, setDraft] = useState(autopilot);
  useEffect(() => setDraft(autopilot), [autopilot]);
  const commit = (patch: Partial<AutopilotSettings> = {}) => onChange({ ...draft, ...patch });

  return (
    <div className="section space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="label !mb-0">Autopilot</div>
        <label className="flex items-center gap-2 text-xs text-fg">
          <input type="checkbox" checked={autopilot.enabled} onChange={(e) => commit({ enabled: e.target.checked })} />
          {autopilot.enabled ? "On" : "Off"}
        </label>
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        Scores each new tweet and drafts replies under it. Nothing is posted automatically: you pick a draft
        and send it from X.
      </p>

      <div>
        <div className="label">Tone</div>
        <div className="flex flex-wrap gap-1.5">
          {REPLY_TONES.map((tone) => (
            <button
              key={tone}
              onClick={() => commit({ tone })}
              className={
                "rounded-sm border px-2.5 py-1 text-[11px] capitalize transition " +
                (draft.tone === tone ? "border-primary text-fg" : "border-line text-muted hover:text-fg")
              }
            >
              {tone}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="label">Reply style</div>
        <div className="flex gap-1.5">
          {REPLY_STYLES.map((style) => (
            <button
              key={style}
              onClick={() => commit({ style })}
              className={
                "flex-1 rounded-md border px-2 py-1.5 text-[11px] transition " +
                (draft.style === style ? "border-primary text-fg" : "border-line text-muted hover:text-fg")
              }
            >
              {STYLE_LABELS[style]}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <div className="label">Only draft when worth it: {draft.minScore}+</div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={draft.minScore}
          onChange={(e) => setDraft({ ...draft, minScore: Number(e.target.value) })}
          onPointerUp={() => commit()}
          onKeyUp={() => commit()}
          className="w-full"
        />
      </label>

      <label className="block">
        <div className="label">Creativity: {draft.creativity < 0.4 ? "focused" : draft.creativity > 0.8 ? "adventurous" : "balanced"}</div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={draft.creativity}
          onChange={(e) => setDraft({ ...draft, creativity: Number(e.target.value) })}
          onPointerUp={() => commit()}
          onKeyUp={() => commit()}
          className="w-full"
        />
      </label>

      <label className="block">
        <div className="label">Topics you care about</div>
        <input
          className="input text-xs"
          placeholder="AI agents, dev tools, startups"
          value={draft.topics}
          onChange={(e) => setDraft({ ...draft, topics: e.target.value })}
          onBlur={() => draft.topics !== autopilot.topics && commit()}
        />
      </label>
      <label className="block">
        <div className="label">Stay away from</div>
        <input
          className="input text-xs"
          placeholder="politics, giveaways"
          value={draft.avoid}
          onChange={(e) => setDraft({ ...draft, avoid: e.target.value })}
          onBlur={() => draft.avoid !== autopilot.avoid && commit()}
        />
      </label>

      <p className="text-[10px] leading-relaxed text-muted">
        Uses your Reply tone from Settings as voice notes. One AI call per drafted tweet, up to 5 per check,
        only for tweets under an hour old.
      </p>
    </div>
  );
}

// --- Reply modal ------------------------------------------------------------

function ReplyModal({
  tweet,
  initialText,
  aiProvider,
  onClose,
  onMarked,
  onDrafted,
}: {
  tweet: SeenTweet;
  initialText?: string;
  aiProvider: "claude" | "openai";
  onClose: () => void;
  onMarked: () => void;
  /** Called after new drafts are saved on the tweet, so the feed can refresh. */
  onDrafted: () => void;
}) {
  const [replyText, setReplyText] = useState(initialText ?? tweet.replyText ?? tweet.draft?.options[0] ?? "");
  const [options, setOptions] = useState<string[]>(tweet.draft?.options ?? []);
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
        body: JSON.stringify({ action: "draft", tweetId: tweet.id }),
      }).then((r) => r.json());
      const drafted: string[] = r.draft?.options ?? [];
      if (drafted.length > 0) {
        setOptions(drafted);
        setReplyText(drafted[0]);
        onDrafted();
      } else {
        setError(r.error ?? "No draft came back. Try again.");
      }
    } finally {
      setGenerating(false);
    }
  }

  // Nothing to start from (no Autopilot drafts, no earlier reply): draft
  // straight away. The ref stops React's dev double-mount drafting twice.
  const autoDrafted = useRef(false);
  useEffect(() => {
    if (autoDrafted.current || replyText || options.length > 0) return;
    autoDrafted.current = true;
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const r = await fetch("/api/grok-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark", tweetId: tweet.id, replyText }),
    }).then((r) => r.json());
    if (r.error) alert(`Opened on X, but couldn't mark it as replied: ${r.error}`);
    onMarked();
  }

  const providerName = aiProvider === "openai" ? "OpenAI" : "Claude";
  const overLimit = tweetLength(replyText) > REPLY_MAX_LENGTH;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-line bg-surface p-5 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="label !mb-0">Reply to @{tweet.handle}</div>
            <p className="mt-1 text-xs text-muted">
              Pick a draft or ask {providerName} for some, edit if you like, then open on X to paste.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm px-2 py-0.5 text-muted hover:bg-canvas hover:text-fg"
          >
            ✕
          </button>
        </div>

        <div className="mb-3 max-h-24 overflow-y-auto rounded-md border border-line bg-canvas p-2.5 text-sm leading-snug text-fg">
          {tweet.text}
        </div>

        {options.length > 1 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {options.map((option, i) => (
              <button
                key={i}
                onClick={() => setReplyText(option)}
                className={
                  "rounded-sm border px-2.5 py-1 text-[11px] transition " +
                  (replyText === option ? "border-primary text-fg" : "border-line text-muted hover:text-fg")
                }
              >
                Option {i + 1}
              </button>
            ))}
          </div>
        )}
        <textarea
          className="textarea h-32 resize-none"
          placeholder={generating ? "Drafting…" : "Write a reply, or draft some."}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          disabled={generating}
        />
        <div className="mt-1 flex items-center justify-between text-[10px]">
          <span className={overLimit ? "text-error" : "text-muted"}>
            {tweetLength(replyText)} / {REPLY_MAX_LENGTH}
          </span>
          {error && <span className="text-error">{error}</span>}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={generate}
            disabled={generating}
            className="btn-ghost text-xs"
          >
            {generating
              ? "Drafting…"
              : options.length > 0
                ? `New drafts from ${providerName}`
                : `Draft replies with ${providerName}`}
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

        <p className="mt-2 text-[10px] leading-relaxed text-muted">
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
