"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PLATFORMS } from "@/lib/platforms";
import { SERVICES } from "@/lib/services";
import { Account, CommentSettings, CommentsState, PlatformId, PostComment, REPLY_TONES } from "@/lib/types";
import { PlatformBadge } from "./PlatformBadge";
import { openExternal } from "./useAccounts";

const POLL_MS = 15_000;

type View = "waiting" | "replied" | "dismissed";

interface Data {
  state: CommentsState;
  accounts: Account[];
  /** Instagram and Facebook accounts that need an API token before Comments can read them. */
  needToken: Account[];
  platforms: PlatformId[];
}

async function post(body: object): Promise<{ error?: string; comment?: PostComment }> {
  const res = await fetch("/api/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ error: `HTTP ${res.status}` }));
}

export function CommentsPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [settings, setSettings] = useState<CommentSettings | null>(null);
  const [view, setView] = useState<View>("waiting");
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  async function load() {
    const [d, s] = await Promise.all([
      fetch("/api/comments").then((r) => r.json()),
      fetch("/api/comments/settings").then((r) => r.json()),
    ]);
    setData(d);
    setSettings(s.settings);
  }

  useEffect(() => {
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  async function saveSettings(next: CommentSettings) {
    setSettings(next);
    const r = await fetch("/api/comments/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).then((res) => res.json());
    if (r.settings) setSettings(r.settings);
  }

  async function checkNow() {
    setChecking(true);
    setCheckMessage(null);
    try {
      const r = await post({ action: "check" });
      setCheckMessage(r.error ?? null);
      await load();
    } finally {
      setChecking(false);
    }
  }

  if (!data || !settings) return <p className="text-sm text-muted">Loading…</p>;

  const all = [...data.state.comments].reverse();
  const lists: Record<View, PostComment[]> = {
    waiting: all.filter((c) => !c.repliedAt && !c.dismissedAt),
    replied: all.filter((c) => c.repliedAt),
    dismissed: all.filter((c) => !c.repliedAt && c.dismissedAt),
  };
  const errors = Object.entries(data.state.accountErrors);

  return (
    <div className="space-y-6">
      {data.accounts.length === 0 && data.needToken.length === 0 ? (
        <div className="card text-sm text-muted">
          Connect an account on {listNames(data.platforms.map((p) => PLATFORMS[p].label))} to answer comments on your
          posts.{" "}
          <Link href="/" className="text-fg underline">
            Go to services
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={checkNow} disabled={checking} className="btn-primary">
            {checking ? "Checking…" : "Check now"}
          </button>
          <span className="text-xs text-muted">
            {data.state.lastCheckedAt
              ? `Last checked ${new Date(data.state.lastCheckedAt).toLocaleTimeString()}`
              : "Not checked yet"}
            {" · "}
            {data.accounts.length} account{data.accounts.length === 1 ? "" : "s"}
          </span>
          {checkMessage && <span className="text-xs text-error">{checkMessage}</span>}
        </div>
      )}

      {data.needToken.map((a) => (
        <TokenCard key={`${a.platform}:${a.id}`} account={a} onSaved={load} />
      ))}

      {errors.map(([key, message]) => {
        const [platform, ...rest] = key.split(":");
        const slug = SERVICES.find((s) => s.id === platform)?.slug;
        return (
          <div key={key} className="card-tight flex items-start gap-3 border-error/40 text-xs">
            <PlatformBadge platform={platform as PlatformId} />
            <div className="flex-1">
              <span className="font-semibold text-fg">@{rest.join(":")}</span>: <span className="text-error">{message}</span>
            </div>
            {slug && (
              <Link href={`/${slug}/accounts`} className="btn-ghost shrink-0 text-xs">
                Accounts
              </Link>
            )}
          </div>
        );
      })}

      <div>
        <div className="mb-3 flex gap-1.5">
          {(["waiting", "replied", "dismissed"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={
                "rounded-sm border px-2.5 py-1 text-xs capitalize transition " +
                (view === v ? "border-primary text-fg" : "border-line text-muted hover:text-fg")
              }
            >
              {v} ({lists[v].length})
            </button>
          ))}
        </div>
        {lists[view].length === 0 ? (
          <p className="text-sm text-muted">
            {view === "waiting" ? "No comments waiting for an answer." : `Nothing ${view} yet.`}
          </p>
        ) : (
          <div className="space-y-3">
            {lists[view].map((c) => (
              <CommentCard key={c.id} comment={c} onChanged={load} />
            ))}
          </div>
        )}
      </div>

      <SettingsCard settings={settings} onChange={saveSettings} />
    </div>
  );
}

function CommentCard({ comment, onChanged }: { comment: PostComment; onChanged: () => Promise<void> }) {
  const [text, setText] = useState(comment.draft?.options[0] ?? "");
  const [busy, setBusy] = useState<"send" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(comment.replyError ?? null);
  const spec = PLATFORMS[comment.platform];

  // A draft that arrives while the card is open fills an empty reply box.
  useEffect(() => {
    if (!text && comment.draft?.options[0]) setText(comment.draft.options[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comment.draft?.generatedAt]);

  async function run(action: "send" | "draft") {
    setBusy(action);
    setError(null);
    try {
      const r = await post(action === "send" ? { action, id: comment.id, text } : { action, id: comment.id });
      if (r.error) setError(r.error);
      await onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(dismissed: boolean) {
    await post({ action: "dismiss", id: comment.id, dismissed });
    await onChanged();
  }

  const length = spec.length(text);
  return (
    <article className="card space-y-3">
      <div className="flex items-start gap-3">
        <PlatformBadge platform={comment.platform} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
            <span className="font-semibold text-fg">@{comment.author}</span>
            <button onClick={() => openExternal(comment.url)} className="hover:text-fg hover:underline">
              {timeAgo(comment.postedAt)}
            </button>
            <span>on @{comment.accountId}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-fg">{comment.text}</p>
          <p className="mt-2 line-clamp-2 border-l-2 border-line pl-2 text-xs text-muted">{comment.postText}</p>
        </div>
      </div>

      {comment.repliedAt ? (
        <div className="rounded-md border border-line bg-canvas p-2.5 text-sm text-fg">
          <div className="mb-1 text-[11px] text-muted">
            You replied {timeAgo(comment.repliedAt)}
            {comment.replyUrl && (
              <>
                {" · "}
                <button onClick={() => openExternal(comment.replyUrl!)} className="underline hover:text-fg">
                  View
                </button>
              </>
            )}
          </div>
          {comment.replyText}
        </div>
      ) : comment.dismissedAt ? (
        <button onClick={() => dismiss(false)} className="btn-ghost text-xs">
          Move back to waiting
        </button>
      ) : (
        <>
          {comment.draft && comment.draft.options.length === 0 && (
            <div className="text-[11px] text-muted">
              Skipped ({comment.draft.score}/100): {comment.draft.reason}
            </div>
          )}
          {comment.draft && comment.draft.options.length > 0 && (
            <div className="space-y-1.5 rounded-md border border-line bg-canvas p-2.5">
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <span className="rounded-sm bg-primary/10 px-2 py-0.5 font-semibold text-primary">{comment.draft.score}/100</span>
                <span>{comment.draft.reason}</span>
              </div>
              {comment.draft.options.map((option, i) => (
                <button
                  key={i}
                  onClick={() => setText(option)}
                  className={
                    "block w-full rounded-sm px-2 py-1 text-left text-sm leading-snug transition " +
                    (text === option ? "bg-primary/10 text-fg" : "text-fg hover:bg-surface")
                  }
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={comment.draft ? "Write your reply" : "Drafting… or write your own reply"}
            className="textarea"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => run("send")}
              disabled={busy !== null || !text.trim() || length > spec.maxLength}
              className="btn-primary text-xs"
            >
              {busy === "send" ? "Sending…" : `Reply on ${spec.label}`}
            </button>
            <button onClick={() => run("draft")} disabled={busy !== null} className="btn-ghost text-xs">
              {busy === "draft" ? "Drafting…" : comment.draft ? "Draft again" : "Draft replies"}
            </button>
            <button onClick={() => dismiss(true)} disabled={busy !== null} className="btn-ghost text-xs">
              Dismiss
            </button>
            <span className={"ml-auto font-mono text-[11px] " + (length > spec.maxLength ? "text-error" : "text-muted")}>
              {length}/{spec.maxLength}
            </span>
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
        </>
      )}
    </article>
  );
}

// Where to get a token for comments, step by step.
const TOKEN_GUIDES: Partial<Record<PlatformId, React.ReactNode>> = {
  instagram: (
    <ol className="list-decimal space-y-1 pl-5">
      <li>Switch the account to a Business or Creator account in the Instagram app, if it isn&apos;t one.</li>
      <li>
        <ExtLinkButton href="https://developers.facebook.com/apps/creation/">Create a Meta app</ExtLinkButton> with the{" "}
        <em>Instagram API</em> product, using <em>Instagram login</em>.
      </li>
      <li>
        Add this account as an Instagram tester, then <em>Generate token</em> with{" "}
        <em>instagram_business_basic</em> and <em>instagram_business_manage_comments</em>. Paste it below; Kyrelo keeps it
        renewed.
      </li>
    </ol>
  ),
  facebook: (
    <ol className="list-decimal space-y-1 pl-5">
      <li>Comments can only be answered on a Facebook Page, not a personal profile.</li>
      <li>
        <ExtLinkButton href="https://developers.facebook.com/apps/creation/">Create a Meta app</ExtLinkButton>, then open
        the <ExtLinkButton href="https://developers.facebook.com/tools/explorer/">Graph API Explorer</ExtLinkButton>.
      </li>
      <li>
        Add <em>pages_read_engagement</em>, <em>pages_read_user_content</em> and <em>pages_manage_engagement</em>, choose
        your Page under <em>User or Page</em>, and generate the token.
      </li>
      <li>
        Make it last: paste it into the{" "}
        <ExtLinkButton href="https://developers.facebook.com/tools/debug/accesstoken/">Access Token Debugger</ExtLinkButton>,
        press <em>Extend Access Token</em>, then get the Page token again with the extended one. Paste it below.
      </li>
    </ol>
  ),
};

function ExtLinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <button onClick={() => openExternal(href)} className="text-fg underline">
      {children}
    </button>
  );
}

/** Instagram and Facebook post through the browser; answering comments needs Meta's API, so a token. */
function TokenCard({ account, onSaved }: { account: Account; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spec = PLATFORMS[account.platform];

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await post({ action: "token", platform: account.platform, accountId: account.id, token });
      if (r.error) setError(r.error);
      else await onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-tight space-y-3 text-xs">
      <div className="flex items-center gap-3">
        <PlatformBadge platform={account.platform} />
        <div className="flex-1 text-muted">
          <span className="font-semibold text-fg">@{account.handle}</span>: add an API token to answer {spec.label} comments.
        </div>
        <button onClick={() => setOpen(!open)} className="btn-ghost shrink-0 text-xs">
          {open ? "Hide" : "Set up"}
        </button>
      </div>
      {open && (
        <div className="space-y-3 leading-relaxed text-muted">
          {TOKEN_GUIDES[account.platform]}
          <div className="flex gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={`${spec.label} access token`}
              className="input"
            />
            <button onClick={save} disabled={busy || !token.trim()} className="btn-primary shrink-0">
              {busy ? "Checking…" : "Save"}
            </button>
          </div>
          {error && <p className="text-error">{error}</p>}
        </div>
      )}
    </div>
  );
}

function SettingsCard({ settings, onChange }: { settings: CommentSettings; onChange: (next: CommentSettings) => void }) {
  // Text and the slider edit a local copy and save when left / released.
  const [draft, setDraft] = useState(settings);
  // The page re-reads settings every few seconds; only a real change (saved
  // here or elsewhere) replaces what's being typed or dragged.
  const saved = JSON.stringify(settings);
  useEffect(() => setDraft(JSON.parse(saved)), [saved]);
  const commit = (patch: Partial<CommentSettings> = {}) => onChange({ ...draft, ...patch });

  return (
    <div className="section space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="label !mb-0">Background checks</div>
        <label className="flex items-center gap-2 text-xs text-fg">
          <input type="checkbox" checked={settings.enabled} onChange={(e) => commit({ enabled: e.target.checked })} />
          {settings.enabled ? "On" : "Off"}
        </label>
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        Every few minutes Kyrelo reads new comments on your posts and drafts replies. Nothing is sent until you press
        Reply.
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
        <div className="label">Skip below {draft.minScore}/100</div>
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
        <p className="mt-1 text-[11px] text-muted">Spam, bots and abuse score low and get no drafts.</p>
      </div>

      <div>
        <div className="label">How you answer people</div>
        <textarea
          value={draft.voiceNotes}
          onChange={(e) => setDraft({ ...draft, voiceNotes: e.target.value })}
          onBlur={() => commit()}
          rows={3}
          maxLength={500}
          placeholder="e.g. Friendly and brief. Point product questions to kyrelo.com/docs. Never discuss pricing."
          className="textarea"
        />
      </div>
    </div>
  );
}

/** "X, Bluesky or Threads". */
function listNames(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : (names[0] ?? "");
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
