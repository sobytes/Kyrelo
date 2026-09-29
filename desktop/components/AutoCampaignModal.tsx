"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MAX_TWEET_LENGTH, tweetLength } from "@/lib/tweet";
import { Account, Campaign, CampaignDraft, MediaItem } from "@/lib/types";

interface CampaignsInfo {
  provider: "claude" | "openai";
  aiReady: boolean;
  openaiKey: boolean;
}

interface DraftState extends CampaignDraft {
  removed: boolean;
  removeImage: boolean;
  when: string;
}

const UNITS = { minutes: 1, hours: 60, days: 1440 } as const;
type Unit = keyof typeof UNITS;

export function AutoCampaignModal({
  account,
  onClose,
  onScheduled,
}: {
  account: Account;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [info, setInfo] = useState<CampaignsInfo | null>(null);
  const [brief, setBrief] = useState("");
  const [url, setUrl] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [count, setCount] = useState(4);
  const [duration, setDuration] = useState(1);
  const [unit, setUnit] = useState<Unit>("hours");
  const [useAiImages, setUseAiImages] = useState(true);
  const [reviewFirst, setReviewFirst] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [drafts, setDrafts] = useState<DraftState[]>([]);
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((r: CampaignsInfo & { campaigns?: Campaign[] }) => {
        setInfo(r);
        // Pick up this account's campaign that is still running or waiting
        // for review, e.g. after the modal was closed mid-way.
        const open = r.campaigns?.find(
          (c) => c.accountId === account.id && (isInFlight(c) || c.status === "review"),
        );
        if (open) {
          setCampaign(open);
          if (open.status === "review") setDrafts(open.drafts.map(toDraftState));
        }
      });
    fetch("/api/brand-profile")
      .then((r) => r.json())
      .then((r) => {
        setBrief(r.profile?.brief ?? "");
        setUrl(r.profile?.url ?? "");
        setCompetitors(r.profile?.competitors ?? "");
      });
    // Runs once on open; the account can't change while the modal is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The parent re-renders every second; keep the latest callback in a ref so
  // the polling interval below isn't torn down on each render.
  const onScheduledRef = useRef(onScheduled);
  onScheduledRef.current = onScheduled;

  // Poll the running campaign until it needs the user (review) or is finished.
  // With auto-schedule on, "review" is only a step on the way to "scheduled".
  const campaignId = campaign?.id;
  const inFlight =
    !!campaign && (isInFlight(campaign) || (campaign.status === "review" && campaign.autoSchedule));
  useEffect(() => {
    if (!campaignId || !inFlight) return;
    const id = setInterval(async () => {
      const r = await fetch(`/api/campaigns/${campaignId}`).then((r) => r.json());
      if (!r.campaign) return;
      setCampaign(r.campaign);
      if (r.campaign.status === "review") setDrafts(r.campaign.drafts.map(toDraftState));
      if (r.campaign.status === "scheduled") onScheduledRef.current();
    }, 2_000);
    return () => clearInterval(id);
  }, [campaignId, inFlight]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const r = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: account.id,
          brief,
          url,
          competitors,
          count,
          windowMinutes: Math.round(duration * UNITS[unit]),
          useAiImages: info?.openaiKey && useAiImages,
          autoSchedule: !reviewFirst,
        }),
      }).then((r) => r.json());
      if (r.error) setError(r.error);
      else setCampaign(r.campaign);
    } finally {
      setStarting(false);
    }
  }

  async function scheduleAll() {
    if (!campaign) return;
    setScheduling(true);
    setError(null);
    try {
      const r = await fetch(`/api/campaigns/${campaign.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drafts: drafts
            .filter((d) => !d.removed)
            .map((d) => ({
              id: d.id,
              text: d.text,
              // Untouched times keep their planned seconds; the picker only has minutes.
              scheduledFor: d.when === toLocalInput(d.scheduledFor) ? d.scheduledFor : new Date(d.when).toISOString(),
              removeImage: d.removeImage,
            })),
        }),
      }).then((r) => r.json());
      if (r.error) {
        setError(r.error);
      } else {
        setCampaign(r.campaign);
        onScheduled();
      }
    } finally {
      setScheduling(false);
    }
  }

  async function discard() {
    if (campaign) {
      const r = await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" }).then((r) => r.json());
      if (r.error) {
        setError(r.error);
        return;
      }
    }
    onClose();
  }

  function updateDraft(id: string, patch: Partial<DraftState>) {
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  const providerName = info?.provider === "openai" ? "OpenAI" : "Claude";
  const kept = drafts.filter((d) => !d.removed);
  const anyOverLimit = kept.some((d) => tweetLength(d.text) > MAX_TWEET_LENGTH);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4 animate-fade-in"
      // A stray click outside shouldn't close a campaign that's running or
      // waiting for review; the ✕ still does (and reopening resumes it).
      onClick={campaign && campaign.status !== "scheduled" && campaign.status !== "failed" ? undefined : onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-surface p-5 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="label !mb-0">Auto campaign · @{account.handle}</div>
            <p className="mt-1 text-xs text-muted">
              {providerName} researches your product and competitors, writes the posts, picks media and
              spreads them naturally over the time you choose.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm px-2 py-0.5 text-muted hover:bg-canvas hover:text-fg"
          >
            ✕
          </button>
        </div>

        {info && !info.aiReady ? (
          <div className="space-y-2 text-sm text-fg">
            <div>Auto campaigns need a {providerName} API key.</div>
            <Link href="/settings" className="btn-primary inline-block text-xs">
              Add a key in Settings
            </Link>
          </div>
        ) : !campaign ? (
          <div className="space-y-4">
            <div>
              <div className="label">What are you promoting?</div>
              <textarea
                className="textarea h-24 resize-none"
                placeholder="e.g. Kyrelo is a free, open-source desktop app for scheduling and bulk-deleting tweets. Push the free angle vs paid tools."
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="label">Link to your product</div>
                <input
                  className="input text-sm"
                  placeholder="https://…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div>
                <div className="label">Competitors (optional)</div>
                <input
                  className="input text-sm"
                  placeholder="Buffer, TweetDelete, …"
                  value={competitors}
                  onChange={(e) => setCompetitors(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="label">Number of posts</div>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="input text-sm"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </div>
              <div>
                <div className="label">Spread over</div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    className="input text-sm"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  />
                  <select
                    className="rounded-md border border-line bg-canvas px-2 py-2 text-sm"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as Unit)}
                  >
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </div>
              </div>
            </div>

            <MediaLibrary />

            <div className="space-y-2 text-xs text-fg">
              <label className={"flex items-center gap-2 " + (info?.openaiKey ? "" : "opacity-50")}>
                <input
                  type="checkbox"
                  checked={Boolean(info?.openaiKey) && useAiImages}
                  disabled={!info?.openaiKey}
                  onChange={(e) => setUseAiImages(e.target.checked)}
                />
                Generate AI images when a post needs one
                {!info?.openaiKey && <span className="text-muted">(needs an OpenAI key in Settings)</span>}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={reviewFirst} onChange={(e) => setReviewFirst(e.target.checked)} />
                Let me review the posts before they&apos;re scheduled
              </label>
            </div>

            {error && <div className="text-xs text-error">{error}</div>}
            <div className="flex items-center justify-end gap-2">
              <button onClick={onClose} className="btn-ghost text-xs">
                Cancel
              </button>
              <button
                onClick={start}
                disabled={starting || !brief.trim() || !info}
                className="btn-primary text-xs"
              >
                {starting ? "Starting…" : "Go"}
              </button>
            </div>
          </div>
        ) : campaign.status === "failed" ? (
          <div className="space-y-3">
            <div className="text-sm text-error">{campaign.error ?? "Something went wrong."}</div>
            <button onClick={() => setCampaign(null)} className="btn-primary text-xs">
              Back
            </button>
          </div>
        ) : campaign.status === "scheduled" ? (
          <div className="space-y-3">
            <div className="text-sm text-success">
              {campaign.progress} They&apos;ll show up under Upcoming.
            </div>
            <p className="text-[11px] text-muted">Keep Kyrelo open so the posts go out on time.</p>
            <button onClick={onClose} className="btn-primary text-xs">
              Done
            </button>
          </div>
        ) : campaign.status === "review" ? (
          <div className="space-y-3">
            {drafts.map((d, i) => (
              <DraftCard key={d.id} index={i} draft={d} onChange={(p) => updateDraft(d.id, p)} />
            ))}
            {error && <div className="text-xs text-error">{error}</div>}
            <div className="flex items-center justify-end gap-2">
              <button onClick={discard} className="btn-ghost text-xs">
                Discard
              </button>
              <button
                onClick={scheduleAll}
                disabled={scheduling || kept.length === 0 || anyOverLimit}
                className="btn-primary text-xs"
              >
                {scheduling ? "Scheduling…" : `Schedule ${kept.length} post${kept.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        ) : (
          <Progress campaign={campaign} />
        )}
      </div>
    </div>
  );
}

function Progress({ campaign }: { campaign: Campaign }) {
  const steps: { key: Campaign["status"]; label: string }[] = [
    { key: "researching", label: "Researching your product, competitors and the niche" },
    { key: "writing", label: `Writing ${campaign.count} posts on different angles` },
    { key: "media", label: "Picking images, screenshots and links" },
  ];
  const current = steps.findIndex((s) => s.key === campaign.status);

  // A live clock, so a long research step visibly isn't stuck.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  const elapsedSec = Math.max(0, Math.floor((now - new Date(campaign.createdAt).getTime()) / 1000));
  const elapsed = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      <ul className="space-y-2 text-sm">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            {i === current ? (
              <span
                aria-label="In progress"
                className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-warning border-t-transparent"
              />
            ) : (
              <span className={i < current ? "w-3.5 text-success" : "w-3.5 text-muted"}>
                {i < current ? "✓" : "○"}
              </span>
            )}
            <span className={i <= current ? "text-fg" : "text-muted"}>{s.label}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        {campaign.progress} <span className="tabular-nums text-muted">{elapsed} elapsed</span> · usually a
        few minutes.
      </p>
    </div>
  );
}

function DraftCard({
  index,
  draft,
  onChange,
}: {
  index: number;
  draft: DraftState;
  onChange: (patch: Partial<DraftState>) => void;
}) {
  const len = tweetLength(draft.text);
  if (draft.removed) {
    return (
      <div className="card flex items-center justify-between text-xs text-muted">
        Post {index + 1} removed.
        <button onClick={() => onChange({ removed: false })} className="btn-ghost text-xs">
          Undo
        </button>
      </div>
    );
  }
  const image = draft.media.imagePath && !draft.removeImage ? draft.media.imagePath : null;
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-sm bg-canvas px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
          {draft.angle}
        </span>
        <button onClick={() => onChange({ removed: true })} className="btn-ghost text-xs">
          Remove
        </button>
      </div>
      <textarea
        className="textarea h-24 resize-none"
        value={draft.text}
        onChange={(e) => onChange({ text: e.target.value })}
      />
      <div className={"text-[10px] " + (len > MAX_TWEET_LENGTH ? "text-error" : "text-muted")}>
        {len} / {MAX_TWEET_LENGTH}
      </div>
      {image && (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/scheduler/uploads/${image}`}
            alt=""
            className="max-h-32 rounded-md border border-line object-cover"
          />
          <button onClick={() => onChange({ removeImage: true })} className="btn-ghost text-xs">
            Remove image
          </button>
        </div>
      )}
      {draft.media.note && <div className="text-[10px] text-muted">{draft.media.note}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="datetime-local"
          className="input w-auto text-xs"
          value={draft.when}
          onChange={(e) => onChange({ when: e.target.value })}
        />
        {draft.sources.length > 0 && (
          <span className="text-[10px] text-muted">
            Sources:{" "}
            {draft.sources.map((s, i) => (
              <a key={s} href={s} target="_blank" rel="noreferrer" className="underline hover:text-fg">
                [{i + 1}]
              </a>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function MediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/media-library").then((r) => r.json());
    setItems(r.items ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function upload(files: FileList) {
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch("/api/media-library", { method: "POST", body: fd }).then((r) => r.json());
        if (r.error) setError(`${file.name}: ${r.error}`);
      }
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function saveDescription(id: string, description: string) {
    const r = await fetch(`/api/media-library/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    }).then((r) => r.json());
    if (r.error) setError(r.error);
  }

  async function remove(id: string) {
    const r = await fetch(`/api/media-library/${id}`, { method: "DELETE" }).then((r) => r.json());
    if (r.error) {
      setError(r.error);
      return;
    }
    setItems((xs) => xs.filter((x) => x.id !== id));
  }

  return (
    <div>
      <div className="label">Your images</div>
      <p className="mb-2 text-[11px] text-muted">
        Upload product shots, logos or photos. The automator picks from these when one fits a post. Each image
        gets a short description so the AI knows what it shows; edit it if it&apos;s wrong.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((m) => (
          <div key={m.id} className="flex gap-2 rounded-md border border-line bg-canvas p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/scheduler/uploads/${m.filename}`} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <input
                className="w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-fg"
                defaultValue={m.description}
                placeholder="What does this show?"
                onBlur={(e) => {
                  if (e.target.value !== m.description) void saveDescription(m.id, e.target.value);
                }}
              />
              <button onClick={() => remove(m.id)} className="self-start text-[10px] text-muted hover:text-error">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2 text-xs text-fg hover:border-muted">
        {uploading ? "Uploading and describing…" : "+ Upload images"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {error && <div className="mt-1 text-[11px] text-error">{error}</div>}
    </div>
  );
}

function isInFlight(c: Campaign): boolean {
  return c.status === "researching" || c.status === "writing" || c.status === "media";
}

function toLocalInput(iso: string): string {
  const t = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

function toDraftState(d: CampaignDraft): DraftState {
  return { ...d, removed: false, removeImage: false, when: toLocalInput(d.scheduledFor) };
}
