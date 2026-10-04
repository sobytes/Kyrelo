"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AutoCampaignModal } from "@/components/AutoCampaignModal";
import { CalendarView } from "@/components/CalendarView";
import { FeedsPanel } from "@/components/FeedsPanel";
import { PlatformBadge } from "@/components/PlatformBadge";
import { PLATFORMS, postImageError, postVideoError } from "@/lib/platforms";
import { Account, GrokSettings, PlatformId, ScheduledPost } from "@/lib/types";

interface ConnectStatus {
  accounts: Account[];
}

/** Accounts are identified by platform + id: the same handle can exist on several platforms. */
function accountKey(a: { platform: PlatformId; id: string }): string {
  return `${a.platform}:${a.id}`;
}

function postAccountKey(p: ScheduledPost): string {
  return `${p.platform}:${p.accountId ?? ""}`;
}

/** "X 12/4000 · Bluesky 12/300" for the platforms being posted to. */
function LengthCounter({ text, platforms }: { text: string; platforms: PlatformId[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 text-[10px]">
      {Array.from(new Set(platforms)).map((platform) => {
        const spec = PLATFORMS[platform];
        const length = spec.length(text);
        return (
          <span key={platform} className={length > spec.maxLength ? "text-error" : "text-muted"}>
            {platforms.length > 1 || platform !== "twitter" ? `${spec.label} ` : ""}
            {length} / {spec.maxLength}
          </span>
        );
      })}
    </div>
  );
}

function isOverLimit(text: string, platforms: PlatformId[]): boolean {
  return platforms.some((p) => PLATFORMS[p].length(text) > PLATFORMS[p].maxLength);
}

/**
 * The Scheduler: every connected account, on every platform. A post goes to
 * whichever accounts are picked, and an auto campaign to all of them.
 */
export function SchedulerPanel() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  // Until the first load, show "Loading" rather than the "connect an account" prompt.
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  // The account tab being viewed, and the accounts a new post goes to.
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [targetKeys, setTargetKeys] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [scheduledFor, setScheduledFor] = useState(defaultDateTime());
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [reschedulingPost, setReschedulingPost] = useState<ScheduledPost | null>(null);
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [aiProvider, setAiProvider] = useState<GrokSettings["aiProvider"]>("claude");
  const attachment = useMediaAttachment(null);
  const { media } = attachment;
  const imagePath = media?.kind === "image" ? media.filename : null;
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [view, setView] = useState<"list" | "calendar">("list");
  // Text written for one account, by account key; the others get `text`. Null: the same text everywhere.
  const [custom, setCustom] = useState<Record<string, string> | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // The chosen view is a per-computer preference.
  useEffect(() => {
    try {
      if (localStorage.getItem("kyrelo.schedulerView") === "calendar") setView("calendar");
    } catch {
      // storage unavailable: start on the list
    }
  }, []);

  function changeView(next: "list" | "calendar") {
    setView(next);
    try {
      localStorage.setItem("kyrelo.schedulerView", next);
    } catch {
      // not remembered, that's all
    }
  }

  /** A day picked on the calendar: the new post is set for it (9:00, or an hour from now today) and the text box focused. */
  function writeForDay(day: Date) {
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0);
    const soon = new Date(Date.now() + 60 * 60_000);
    setScheduledFor(toDateTimeLocal(at.getTime() < soon.getTime() ? soon : at));
    textRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    textRef.current?.focus();
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  async function loadPosts() {
    const r = await fetch("/api/scheduler/posts").then((r) => r.json());
    setPosts(r.posts ?? []);
  }

  async function loadConnect() {
    const r = (await fetch("/api/accounts").then((r) => r.json())) as ConnectStatus;
    const list = r.accounts ?? [];
    setAccounts(list);
    setAccountsLoaded(true);
    setSelectedKey((curr) => {
      if (curr && list.some((a) => accountKey(a) === curr)) return curr;
      return list[0] ? accountKey(list[0]) : "";
    });
  }

  async function loadAiProvider() {
    const r = await fetch("/api/grok-settings").then((r) => r.json());
    if (r.settings?.aiProvider) setAiProvider(r.settings.aiProvider);
  }

  // A new post defaults to the account being viewed.
  useEffect(() => {
    setTargetKeys(selectedKey ? [selectedKey] : []);
  }, [selectedKey]);

  useEffect(() => {
    loadPosts();
    loadConnect();
    loadAiProvider();
    const id = setInterval(() => {
      loadPosts();
      loadConnect();
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  // One post per chosen account, so each is sent, tracked and retried on its own.
  async function schedule(e: React.FormEvent) {
    e.preventDefault();
    if (!scheduledFor || targets.length === 0 || targets.some((a) => !textFor(a).trim())) return;
    setSubmitting(true);
    try {
      const errors: string[] = [];
      for (const account of targets) {
        const r = await fetch("/api/scheduler/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: account.platform,
            accountId: account.id,
            text: textFor(account),
            // Platforms that can't take the attachment get the text alone.
            ...(media && attachmentFits(account.platform, media)
              ? media.kind === "image"
                ? { imagePath: media.filename }
                : { videoPath: media.filename }
              : {}),
            scheduledFor: new Date(scheduledFor).toISOString(),
          }),
        }).then((r) => r.json());
        if (r.error) errors.push(`${PLATFORMS[account.platform].label} @${account.handle}: ${r.error}`);
      }
      if (errors.length > 0) {
        alert(`Some posts weren't scheduled:\n${errors.join("\n")}`);
      } else {
        setText("");
        setCustom(null);
        setScheduledFor(defaultDateTime());
        attachment.clear();
      }
      await loadPosts();
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id: string) {
    if (!confirm("Cancel this scheduled post?")) return;
    const r = await fetch(`/api/scheduler/posts/${id}`, { method: "DELETE" }).then((r) => r.json());
    if (r.error) alert(r.error);
    loadPosts();
  }

  function reschedule(post: ScheduledPost) {
    setReschedulingPost(post);
  }

  const selected = accounts.find((a) => accountKey(a) === selectedKey);
  const targets = accounts.filter((a) => targetKeys.includes(accountKey(a)));
  const forAccount = selected ? posts.filter((p) => postAccountKey(p) === selectedKey) : [];
  const sorted = [...forAccount].sort((a, b) =>
    a.scheduledFor.localeCompare(b.scheduledFor),
  );
  const upcoming = sorted.filter((p) => p.status === "pending" || p.status === "posting");
  const history = sorted.filter((p) => p.status === "posted" || p.status === "failed").reverse();

  /** What goes to this account: its own text if it has one, else the shared text. */
  function textFor(account: Account): string {
    return custom?.[accountKey(account)] ?? text;
  }
  const overLimit = targets.some((a) => isOverLimit(textFor(a), [a.platform]));
  const missingText = targets.length === 0 || targets.some((a) => !textFor(a).trim());

  if (!accountsLoaded) {
    return <div className="py-6 text-sm text-muted">Loading…</div>;
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 border-y border-line py-12 text-center">
        <div className="text-sm text-fg">No accounts connected yet.</div>
        <div className="text-xs text-muted">Pick a service on the home screen and connect an account to start scheduling.</div>
        <Link href="/" className="btn-primary mt-2 text-sm">
          All services
        </Link>
      </div>
    );
  }

  const canAttachImage = targets.some((a) => PLATFORMS[a.platform].maxImageBytes > 0);
  const canAttachVideo = targets.some((a) => PLATFORMS[a.platform].maxVideoBytes > 0);
  const mediaDropped = media ? targets.filter((a) => !attachmentFits(a.platform, media)) : [];
  // Instagram needs a photo, and only takes JPEG or PNG.
  const needsImage = targets.find((a) => PLATFORMS[a.platform].requiresImage)?.platform;
  // YouTube needs a video.
  const needsVideo = targets.find((a) => PLATFORMS[a.platform].requiresVideo)?.platform;
  const imageProblem =
    needsVideo && media?.kind !== "video"
      ? `${PLATFORMS[needsVideo].label} posts need a video`
      : needsImage
        ? postImageError(needsImage, imagePath ?? undefined)
        : null;

  return (
    <div className="space-y-5">
      {/* Writing and the list read best narrow; only the calendar uses the full width. */}
      <div className="max-w-3xl space-y-5">
      <AccountTabs accounts={accounts} selectedKey={selectedKey} onSelect={setSelectedKey} addHref="/" />

      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="label !mb-0">Schedule a post</div>
          {selected && (
            <button type="button" onClick={() => setCampaignOpen(true)} className="btn-ghost text-xs">
              Auto-generate campaign
            </button>
          )}
        </div>

        <form onSubmit={schedule} className="space-y-3">
          <div>
            <div className="label">Post text</div>
            <textarea
              ref={textRef}
              className="textarea h-28 resize-none"
              placeholder="What do you want to post?"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {custom ? (
              <p className="mt-1 text-[10px] text-muted">Each account below has its own text. Edits here don&apos;t change them.</p>
            ) : (
              <LengthCounter text={text} platforms={targets.map((a) => a.platform)} />
            )}
            {targets.length > 1 && (
              <label className="mt-2 flex items-center gap-2 text-xs text-fg">
                <input
                  type="checkbox"
                  checked={custom !== null}
                  onChange={(e) =>
                    setCustom(e.target.checked ? Object.fromEntries(targets.map((a) => [accountKey(a), text])) : null)
                  }
                />
                Different text for each account
              </label>
            )}
          </div>

          {custom && (
            <div className="space-y-3">
              {targets.map((a) => (
                <AccountText
                  key={accountKey(a)}
                  account={a}
                  value={textFor(a)}
                  onChange={(v) => setCustom((c) => ({ ...c, [accountKey(a)]: v }))}
                />
              ))}
            </div>
          )}

          {accounts.length > 1 && (
            <div>
              <div className="label">Post to</div>
              <div className="flex flex-wrap items-center gap-2">
                {accounts.map((a) => {
                  const key = accountKey(a);
                  const on = targetKeys.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setTargetKeys((keys) => (on ? keys.filter((k) => k !== key) : [...keys, key]))
                      }
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
          )}

          {(canAttachImage || canAttachVideo) && (
            <div>
              <div className="label">
                {needsVideo ? "Video" : needsImage ? "Photo" : canAttachVideo ? "Image or video (optional)" : "Image (optional)"}
              </div>
              <MediaPicker attachment={attachment} images={canAttachImage} videos={canAttachVideo} />
            </div>
          )}

          {imageProblem && (
            <p className="text-xs text-warning">
              {imageProblem}. {media ? "Pick a different file" : "Add one"}, or untick{" "}
              {PLATFORMS[(needsVideo && media?.kind !== "video" ? needsVideo : needsImage)!].label}.
            </p>
          )}

          {media && mediaDropped.length > 0 && (
            <p className="text-xs text-muted">
              {[...new Set(mediaDropped.map((a) => PLATFORMS[a.platform].label))].join(" and ")} posts are sent without
              the {media.kind}: {mediaDropReason(mediaDropped[0].platform, media)}.
            </p>
          )}

          <div>
            <div className="label">When</div>
            <input
              type="datetime-local"
              className="input text-sm"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              min={nowDateTime()}
            />
          </div>

          <button
            type="submit"
            disabled={submitting || missingText || overLimit || !scheduledFor || !!imageProblem}
            className="btn-primary text-sm"
          >
            {submitting ? "Scheduling…" : targets.length > 1 ? `Schedule ${targets.length} posts` : "Schedule post"}
          </button>
        </form>
      </section>

      <div className="flex gap-1.5">
        {(["list", "calendar"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => changeView(v)}
            className={
              "rounded-sm border px-2.5 py-1 text-xs capitalize transition " +
              (view === v ? "border-primary text-fg" : "border-line text-muted hover:text-fg")
            }
          >
            {v}
          </button>
        ))}
      </div>

      {view === "list" && (
      <>
      <section>
        <div className="label">Upcoming ({upcoming.length})</div>
        {upcoming.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line py-8 text-center text-sm text-muted">Nothing queued.</div>
        ) : (
          <Timeline
            posts={upcoming}
            now={now}
            onCancel={cancel}
            onEdit={(p) => setEditingPost(p)}
          />
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-2">
          <div className="label">History</div>
          {history.slice(0, 20).map((p) => (
            <PostRow
              key={p.id}
              post={p}
              now={now}
              onCancel={() => cancel(p.id)}
              onReschedule={() => reschedule(p)}
            />
          ))}
        </section>
      )}

      </>
      )}

      <FeedsPanel accounts={accounts} />
      </div>

      {view === "calendar" && (
        <CalendarView posts={posts} accounts={accounts} now={now} onEdit={setEditingPost} onPickDay={writeForDay} />
      )}

      {reschedulingPost && (
        <RescheduleModal
          post={reschedulingPost}
          accounts={accounts.filter((a) => a.platform === reschedulingPost.platform)}
          aiProvider={aiProvider}
          onClose={() => setReschedulingPost(null)}
          onScheduled={() => {
            setReschedulingPost(null);
            loadPosts();
          }}
        />
      )}

      {campaignOpen && selected && (
        <AutoCampaignModal
          // Campaigns write text and images: not for video-only platforms.
          accounts={accounts.filter((a) => !PLATFORMS[a.platform].requiresVideo)}
          defaultAccount={selected}
          onClose={() => setCampaignOpen(false)}
          onScheduled={loadPosts}
        />
      )}

      {editingPost && (
        <EditPostModal
          post={editingPost}
          accounts={accounts.filter((a) => a.platform === editingPost.platform)}
          onClose={() => setEditingPost(null)}
          onSaved={() => {
            setEditingPost(null);
            loadPosts();
          }}
        />
      )}
    </div>
  );
}

/** One account's own version of the post, with an AI button to suit it to the platform. */
function AccountText({ account, value, onChange }: { account: Account; value: string; onChange: (v: string) => void }) {
  const [adapting, setAdapting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function adapt() {
    setAdapting(true);
    setError(null);
    try {
      const r = await fetch("/api/scheduler/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, platform: account.platform, mode: "adapt" }),
      }).then((res) => res.json());
      if (r.text) onChange(r.text);
      else setError(r.error ?? "Couldn't adapt the text.");
    } finally {
      setAdapting(false);
    }
  }

  return (
    <div className="rounded-md border border-line bg-canvas p-2.5">
      <div className="mb-1.5 flex items-center gap-2 text-xs text-fg">
        <PlatformBadge platform={account.platform} />@{account.handle}
        <button type="button" onClick={adapt} disabled={adapting || !value.trim()} className="btn-ghost ml-auto h-7 px-2 text-xs">
          {adapting ? "Adapting…" : `Adapt for ${PLATFORMS[account.platform].label}`}
        </button>
      </div>
      <textarea className="textarea h-24 resize-y" value={value} onChange={(e) => onChange(e.target.value)} />
      <LengthCounter text={value} platforms={[account.platform]} />
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  );
}

/** A post's attachment: an uploaded image or video. `bytes` is known for one picked in this session. */
interface Media {
  filename: string;
  kind: "image" | "video";
  bytes?: number;
}

/** Whether a platform takes this attachment; if not, its post goes out as text alone. */
function attachmentFits(platform: PlatformId, media: Media): boolean {
  return mediaDropReason(platform, media) === null;
}

function mediaDropReason(platform: PlatformId, media: Media): string | null {
  if (media.kind === "video") return postVideoError(platform, media.filename, media.bytes);
  return PLATFORMS[platform].maxImageBytes > 0 ? null : `Kyrelo can't post images to ${PLATFORMS[platform].label}`;
}

/**
 * An image or video attached to a post being written or edited: uploads it
 * via /api/scheduler/upload and keeps a local preview. Used by the compose
 * form and the edit modal.
 */
function useMediaAttachment(initial: Media | null) {
  const [media, setMedia] = useState<Media | null>(initial);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function pick(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/scheduler/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (r.error) {
        alert(r.error);
        return;
      }
      setMedia({ filename: r.filename, kind: file.type.startsWith("video/") ? "video" : "image", bytes: file.size });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
    } finally {
      setUploading(false);
    }
  }

  function clear() {
    setMedia(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }

  // A picked file previews from memory; a saved one from the uploads route.
  const src = previewUrl ?? (media ? `/api/scheduler/uploads/${media.filename}` : null);
  return { media, src, uploading, pick, clear };
}

function MediaPicker({
  attachment,
  images,
  videos,
}: {
  attachment: ReturnType<typeof useMediaAttachment>;
  images: boolean;
  videos: boolean;
}) {
  const { media, src, uploading, pick, clear } = attachment;
  if (media && src) {
    return (
      <div className="flex items-start gap-3">
        {media.kind === "video" ? (
          <video src={src} controls muted className="max-h-40 rounded-md border border-line" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="max-h-32 rounded-md border border-line object-cover" />
        )}
        <button type="button" onClick={clear} className="btn-ghost text-xs">
          Remove
        </button>
      </div>
    );
  }
  const accept = [
    ...(images ? ["image/png", "image/jpeg", "image/gif", "image/webp"] : []),
    ...(videos ? ["video/mp4", "video/quicktime"] : []),
  ].join(",");
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2 text-xs text-fg hover:border-muted">
      {uploading ? "Uploading…" : images && videos ? "Attach image or video" : videos ? "Attach video" : "Attach image"}
      <input
        type="file"
        accept={accept}
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pick(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function PostRow({
  post,
  now,
  onCancel,
  onReschedule,
}: {
  post: ScheduledPost;
  now: number;
  onCancel: () => void;
  onReschedule: () => void;
}) {
  const dueMs = new Date(post.scheduledFor).getTime() - now;
  return (
    <div className="card-tight">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={post.status} />
          <span className="text-muted">
            {new Date(post.scheduledFor).toLocaleString()}
          </span>
          {post.status === "pending" && (
            <span className="text-primary">
              {dueMs > 0 ? `Sending in ${formatCountdown(dueMs)}` : "Sending any moment…"}
            </span>
          )}
          {post.status === "posting" && (
            <span className="text-warning">
              {post.sendingStartedAt ? "Posting now…" : "Waiting for the browser…"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {(post.status === "posted" || post.status === "failed") && (
            <button
              onClick={onReschedule}
              className="text-[11px] text-muted hover:text-primary"
            >
              Reschedule
            </button>
          )}
          {post.status === "pending" && (
            <button onClick={onCancel} className="text-[11px] text-muted hover:text-error">
              Cancel
            </button>
          )}
        </div>
      </div>
      <div className="whitespace-pre-wrap break-words text-sm text-fg">{post.text}</div>
      {post.postedUrl && /\/status\/\d+/.test(post.postedUrl) && (
        <a
          href={post.postedUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[11px] text-muted hover:text-fg"
        >
          open on X ↗
        </a>
      )}
      {post.error && <PostError error={post.error} />}
    </div>
  );
}

// Failed-post errors (especially Playwright launch dumps) can run to thousands
// of characters. Show a short preview with a Read more / Show less toggle.
function PostError({ error }: { error: string }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 220;
  const isLong = error.length > LIMIT;
  const shown = expanded || !isLong ? error : error.slice(0, LIMIT).trimEnd() + "…";
  return (
    <div className="mt-2 rounded-md border border-error/30 bg-error/5 p-2 text-[11px] text-error">
      <div
        className={
          "whitespace-pre-wrap break-words" +
          (expanded ? " max-h-48 overflow-y-auto" : "")
        }
      >
        {shown}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 font-medium text-error underline-offset-2 hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

// --- Timeline ---------------------------------------------------------------

function Timeline({
  posts,
  now,
  onCancel,
  onEdit,
}: {
  posts: ScheduledPost[];
  now: number;
  onCancel: (id: string) => void;
  onEdit: (post: ScheduledPost) => void;
}) {
  const groups: { label: string; items: ScheduledPost[] }[] = [];
  for (const p of posts) {
    const label = dayLabel(p.scheduledFor, now);
    const bucket = groups.find((g) => g.label === label);
    if (bucket) bucket.items.push(p);
    else groups.push({ label, items: [p] });
  }

  return (
    <div className="mt-3 space-y-7">
      {groups.map(({ label, items }) => (
        <div key={label} className="relative pl-7">
          <div className="absolute bottom-2 left-[7px] top-2 w-px bg-line" />
          <div className="mb-3 -ml-7 inline-flex items-center gap-2 rounded-sm border border-line bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-muted" />
            {label}
          </div>
          <div className="space-y-3">
            {items.map((p) => (
              <TimelineRow
                key={p.id}
                post={p}
                now={now}
                onCancel={() => onCancel(p.id)}
                onEdit={() => onEdit(p)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineRow({
  post,
  now,
  onCancel,
  onEdit,
}: {
  post: ScheduledPost;
  now: number;
  onCancel: () => void;
  onEdit: () => void;
}) {
  const time = new Date(post.scheduledFor).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dueMs = new Date(post.scheduledFor).getTime() - now;
  const isPosting = post.status === "posting";
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-[26px] top-3.5 flex h-3 w-3 items-center justify-center">
        <span
          className={
            "block h-2.5 w-2.5 rounded-full ring-4 ring-canvas " +
            (isPosting
              ? "bg-warning animate-pulse "
              : "bg-primary ")
          }
        />
      </div>
      <div className="card-tight">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold tabular-nums text-fg">{time}</span>
            <span className={isPosting ? "text-warning" : "text-primary"}>
              {isPosting
                ? post.sendingStartedAt
                  ? "Posting now…"
                  : "Waiting for the browser…"
                : dueMs > 0
                  ? `in ${formatCountdown(dueMs)}`
                  : "any moment…"}
            </span>
            {post.campaignId && (
              <span className="badge">campaign</span>
            )}
          </div>
          {post.status === "pending" && (
            <div className="flex items-center gap-3">
              <button
                onClick={onEdit}
                className="text-[11px] text-muted hover:text-primary"
              >
                Edit
              </button>
              <button
                onClick={onCancel}
                className="text-[11px] text-muted hover:text-error"
              >
                Cancel
              </button>
            </div>
          )}
          {/* No Cancel while posting: the browser is already sending it, and
              deleting the record would only hide a post that still goes out.
              A stuck "posting" post turns "failed" after 10 minutes. */}
        </div>
        <div className="whitespace-pre-wrap break-words text-sm text-fg">
          {post.text}
        </div>
        {post.imagePath && (
          <div className="mt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/scheduler/uploads/${post.imagePath}`}
              alt=""
              className="max-h-32 rounded-md border border-line object-cover"
            />
          </div>
        )}
        {post.videoPath && (
          <div className="mt-2">
            <video
              src={`/api/scheduler/uploads/${post.videoPath}`}
              controls
              muted
              preload="metadata"
              className="max-h-40 rounded-md border border-line"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function dayLabel(iso: string, nowMs: number): string {
  const d = new Date(iso);
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: "long" });
  }
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function EditPostModal({
  post,
  accounts,
  onClose,
  onSaved,
}: {
  post: ScheduledPost;
  /** Accounts on the post's platform (a post can't move platforms). */
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(post.text);
  const [accountId, setAccountId] = useState<string>(post.accountId ?? accounts[0]?.id ?? "");
  const [scheduledFor, setScheduledFor] = useState(() =>
    toDateTimeLocal(new Date(post.scheduledFor)),
  );
  const attachment = useMediaAttachment(
    post.imagePath
      ? { filename: post.imagePath, kind: "image" }
      : post.videoPath
        ? { filename: post.videoPath, kind: "video" }
        : null,
  );
  const { media } = attachment;
  const spec = PLATFORMS[post.platform];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overLimit = isOverLimit(text, [post.platform]);

  async function save() {
    if (!text.trim() || !accountId || !scheduledFor) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/scheduler/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          accountId,
          imagePath: media?.kind === "image" ? media.filename : null,
          videoPath: media?.kind === "video" ? media.filename : null,
          scheduledFor: new Date(scheduledFor).toISOString(),
        }),
      }).then((r) => r.json());
      if (r.error) {
        setError(r.error);
      } else {
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }


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
            <div className="label !mb-0">Edit scheduled post</div>
            <p className="mt-1 text-xs text-muted">
              Change the text, time, account, or attachment. Saves in place.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm px-2 py-0.5 text-muted hover:bg-canvas hover:text-fg"
          >
            ✕
          </button>
        </div>

        <textarea
          className="textarea h-32 resize-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-1 flex items-center justify-between text-[10px]">
          <LengthCounter text={text} platforms={[post.platform]} />
          {error && <span className="text-error">{error}</span>}
        </div>

        {/* Threads posts are text only (no images or videos). */}
        {(spec.maxImageBytes > 0 || spec.maxVideoBytes > 0) && (
          <div className="mt-3">
            <div className="label">{spec.maxVideoBytes > 0 ? "Image or video" : "Image"}</div>
            <MediaPicker attachment={attachment} images={spec.maxImageBytes > 0} videos={spec.maxVideoBytes > 0} />
            {media && mediaDropReason(post.platform, media) && (
              <p className="mt-1 text-xs text-warning">{mediaDropReason(post.platform, media)}.</p>
            )}
          </div>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="label">Account</div>
            <select
              className="rounded-md border border-line bg-canvas px-2 py-2 text-sm w-full"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.handle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="label">When</div>
            <input
              type="datetime-local"
              className="input text-sm"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              min={nowDateTime()}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="ml-auto" />
          <button onClick={onClose} className="btn-ghost text-xs">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !text.trim() || overLimit || !accountId || !scheduledFor}
            className="btn-primary text-xs"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountTabs({
  accounts,
  selectedKey,
  onSelect,
  addHref,
}: {
  accounts: Account[];
  selectedKey: string;
  onSelect: (key: string) => void;
  /** This service's Accounts section. */
  addHref: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-0 border-b border-line">
      {accounts.map((a) => {
        const key = accountKey(a);
        const active = key === selectedKey;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={
              "relative -mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition " +
              (active
                ? "border-primary text-fg"
                : "border-transparent text-muted hover:text-fg")
            }
          >
            <PlatformBadge platform={a.platform} />
            @{a.handle}
          </button>
        );
      })}
      <Link
        href={addHref}
        className="ml-auto px-3 py-2.5 text-xs text-muted hover:text-fg"
      >
        + add account
      </Link>
    </div>
  );
}

function RescheduleModal({
  post,
  accounts,
  aiProvider,
  onClose,
  onScheduled,
}: {
  post: ScheduledPost;
  /** Accounts on the post's platform (a post can't move platforms). */
  accounts: Account[];
  aiProvider: GrokSettings["aiProvider"];
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [text, setText] = useState(post.text);
  const [accountId, setAccountId] = useState<string>(
    post.accountId && accounts.some((a) => a.id === post.accountId)
      ? post.accountId
      : accounts[0]?.id ?? "",
  );
  const [scheduledFor, setScheduledFor] = useState(defaultDateTime());
  const [rewriting, setRewriting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overLimit = isOverLimit(text, [post.platform]);
  const providerName = aiProvider === "openai" ? "OpenAI" : "Claude";

  async function rewrite() {
    setRewriting(true);
    setError(null);
    try {
      const r = await fetch("/api/scheduler/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, platform: post.platform }),
      }).then((r) => r.json());
      if (r.ok && r.text) {
        setText(r.text);
      } else {
        setError(r.error ?? "Rewrite failed");
      }
    } finally {
      setRewriting(false);
    }
  }

  async function submit() {
    if (!text.trim() || !accountId || !scheduledFor) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/scheduler/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: post.platform,
          accountId,
          text,
          imagePath: post.imagePath,
          scheduledFor: new Date(scheduledFor).toISOString(),
        }),
      }).then((r) => r.json());
      if (r.error) {
        setError(r.error);
      } else {
        onScheduled();
      }
    } finally {
      setSubmitting(false);
    }
  }

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
            <div className="label !mb-0">Reschedule post</div>
            <p className="mt-1 text-xs text-muted">
              Edit, or have {providerName} reword it slightly. Then pick a new time.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm px-2 py-0.5 text-muted hover:bg-canvas hover:text-fg"
          >
            ✕
          </button>
        </div>

        <textarea
          className="textarea h-32 resize-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={rewriting}
        />
        <div className="mt-1 flex items-center justify-between text-[10px]">
          <LengthCounter text={text} platforms={[post.platform]} />
          {error && <span className="text-error">{error}</span>}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="label">Account</div>
            <select
              className="rounded-md border border-line bg-canvas px-2 py-2 text-sm w-full"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={accounts.length === 0}
            >
              {accounts.length === 0 ? (
                <option value="">No accounts connected</option>
              ) : (
                accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.handle}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <div className="label">When</div>
            <input
              type="datetime-local"
              className="input text-sm"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              min={nowDateTime()}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={rewrite}
            disabled={rewriting || !text.trim()}
            className="btn-ghost text-xs"
          >
            {rewriting ? `Asking ${providerName}…` : `Re-gig with ${providerName}`}
          </button>
          <div className="ml-auto" />
          <button onClick={onClose} className="btn-ghost text-xs">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !text.trim() || overLimit || !accountId || !scheduledFor}
            className="btn-primary text-xs"
          >
            {submitting ? "Scheduling…" : "Schedule"}
          </button>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          Re-gig keeps the meaning but varies the wording. The original post stays in History
          unchanged — this creates a new pending post.
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ScheduledPost["status"] }) {
  const styles: Record<ScheduledPost["status"], string> = {
    pending: "bg-canvas text-fg",
    posting: "bg-warning/10 text-warning",
    posted: "bg-success/10 text-success",
    failed: "bg-error/10 text-error",
  };
  return (
    <span
      className={
        "inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
        styles[status]
      }
    >
      {status}
    </span>
  );
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultDateTime(): string {
  // Pre-fill the next clean minute — user can bump it from there.
  const d = new Date(Date.now() + 60 * 1000);
  d.setSeconds(0, 0);
  return toDateTimeLocal(d);
}

function nowDateTime(): string {
  // Lower bound: don't allow scheduling in the past.
  const d = new Date();
  d.setSeconds(0, 0);
  return toDateTimeLocal(d);
}
