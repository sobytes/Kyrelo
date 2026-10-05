"use client";
import { useEffect, useRef, useState } from "react";
import { PLATFORMS } from "@/lib/platforms";
import { MediaBucket, MediaItem, PlatformId } from "@/lib/types";

// The Media page: buckets on the left, the library on the right. Also exports
// the pieces the Scheduler's "From library" picker and the campaign window use.

/** "all", "unsorted" or a bucket id. */
type Filter = string;

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,video/mp4,video/quicktime";

export function useMediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [buckets, setBuckets] = useState<MediaBucket[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const r = await fetch("/api/media-library").then((res) => res.json());
    setItems(r.items ?? []);
    setBuckets(r.buckets ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    void load();
  }, []);

  return { items, buckets, loaded, load };
}

export function inFilter(item: MediaItem, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "unsorted") return !item.bucketIds?.length;
  return Boolean(item.bucketIds?.includes(filter));
}

export function MediaThumb({ item, className = "" }: { item: MediaItem; className?: string }) {
  const src = `/api/scheduler/uploads/${item.filename}`;
  return item.kind === "video" ? (
    <div className={`relative ${className}`}>
      <video
        src={src}
        poster={item.posterFilename ? `/api/scheduler/uploads/${item.posterFilename}` : undefined}
        muted
        preload="metadata"
        className="h-full w-full rounded object-cover"
      />
      <span className="absolute bottom-1 left-1 rounded-sm bg-fg/70 px-1 font-mono text-[9px] text-surface">▶ video</span>
    </div>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={`rounded object-cover ${className}`} />
  );
}

/**
 * A still frame from a video (a second in, or its middle if shorter), as a
 * JPEG: the library's thumbnail, and what the AI describes. Null if the
 * browser can't decode the video.
 */
async function videoPoster(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  const event = (name: "loadeddata" | "seeked") =>
    new Promise<void>((resolve, reject) => {
      video.addEventListener(name, () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("can't decode")), { once: true });
      setTimeout(() => reject(new Error("timed out")), 10_000);
    });
  try {
    await event("loadeddata");
    video.currentTime = Math.min(1, (video.duration || 0) / 2);
    await event("seeked");
    const scale = Math.min(1, 1280 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 252.3 → "4:12". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Whether this computer has ffmpeg (fitting videos to platforms, cutting clips). */
export function useMediaTools(): { ffmpeg: boolean } {
  const [tools, setTools] = useState({ ffmpeg: false });
  useEffect(() => {
    void fetch("/api/media-tools")
      .then((r) => r.json())
      .then((t) => setTools({ ffmpeg: Boolean(t.ffmpeg) }))
      .catch(() => {});
  }, []);
  return tools;
}

function formatBytes(n?: number): string {
  if (!n) return "";
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

export function MediaPanel() {
  const { items, buckets, loaded, load } = useMediaLibrary();
  const tools = useMediaTools();
  const [trimming, setTrimming] = useState<MediaItem | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [newBucket, setNewBucket] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = items.filter((m) => inFilter(m, filter));
  const current = buckets.find((b) => b.id === filter);
  const count = (f: Filter) => items.filter((m) => inFilter(m, f)).length;

  async function json(url: string, init: RequestInit) {
    const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init.headers } }).then((res) => res.json());
    if (r.error) setError(r.error);
    return r;
  }

  async function upload(files: File[]) {
    setError(null);
    for (const [i, file] of files.entries()) {
      setUploading(`Uploading ${i + 1} of ${files.length} and describing…`);
      const fd = new FormData();
      fd.append("file", file);
      if (current) fd.append("bucketId", current.id);
      if (file.type.startsWith("video/")) {
        const poster = await videoPoster(file);
        if (poster) fd.append("poster", poster, "poster.jpg");
      }
      const r = await fetch("/api/media-library", { method: "POST", body: fd }).then((res) => res.json());
      if (r.error) setError(`${file.name}: ${r.error}`);
    }
    setUploading(null);
    await load();
  }

  async function addBucket(e: React.FormEvent) {
    e.preventDefault();
    const r = await json("/api/media-buckets", { method: "POST", body: JSON.stringify({ name: newBucket }) });
    if (r.bucket) {
      setNewBucket("");
      await load();
      setFilter(r.bucket.id);
    }
  }

  async function rename(bucket: MediaBucket) {
    const name = prompt("Rename bucket", bucket.name);
    if (!name || name === bucket.name) return;
    await json(`/api/media-buckets/${bucket.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    await load();
  }

  async function removeBucket(bucket: MediaBucket) {
    if (!confirm(`Delete the bucket "${bucket.name}"? Its media stays in the library.`)) return;
    await json(`/api/media-buckets/${bucket.id}`, { method: "DELETE" });
    setFilter("all");
    await load();
  }

  async function update(item: MediaItem, patch: { description?: string; bucketIds?: string[] }) {
    await json(`/api/media-library/${item.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    await load();
  }

  async function remove(item: MediaItem) {
    if (!confirm("Remove this from the library? Posts already scheduled with it keep it.")) return;
    await json(`/api/media-library/${item.id}`, { method: "DELETE" });
    await load();
  }

  const filterButton = (f: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(f)}
      className={
        "flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-sm transition " +
        (filter === f ? "bg-surface text-fg ring-1 ring-line" : "text-muted hover:text-fg")
      }
    >
      <span className="truncate">{label}</span>
      <span className="font-mono text-[11px] text-muted">{count(f)}</span>
    </button>
  );

  return (
    <div className="flex gap-8">
      <aside className="w-52 shrink-0 space-y-1">
        {filterButton("all", "All media")}
        {filterButton("unsorted", "Unsorted")}
        <div className="label !mb-1 !mt-4 px-2.5">Buckets</div>
        {buckets.map((b) => (
          <div key={b.id} className="group relative">
            {filterButton(b.id, b.name)}
            {filter === b.id && (
              <div className="mt-1 flex gap-3 px-2.5 text-[11px]">
                <button type="button" onClick={() => rename(b)} className="text-muted hover:text-fg">
                  Rename
                </button>
                <button type="button" onClick={() => removeBucket(b)} className="text-muted hover:text-error">
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
        <form onSubmit={addBucket} className="flex gap-1.5 pt-2">
          <input
            className="input h-8 px-2 text-xs"
            placeholder="New bucket"
            value={newBucket}
            onChange={(e) => setNewBucket(e.target.value)}
          />
          <button type="submit" disabled={!newBucket.trim()} className="btn-ghost h-8 shrink-0 px-2 text-xs">
            Add
          </button>
        </form>
      </aside>

      <section
        className={"min-w-0 flex-1 space-y-4 rounded-lg " + (dragging ? "ring-2 ring-primary ring-offset-4 ring-offset-canvas" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length) void upload(files);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted">
            {current ? (
              <>
                <span className="font-semibold text-fg">{current.name}</span>: new uploads go into this bucket.
              </>
            ) : (
              "Drop images and videos here, or upload them."
            )}
          </div>
          <label className="btn-primary cursor-pointer text-sm">
            {uploading ?? "Upload"}
            <input
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              disabled={uploading !== null}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) void upload(files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {error && <p className="text-xs text-error">{error}</p>}

        {loaded && shown.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line py-16 text-center text-sm text-muted">
            {filter === "all" ? "No media yet. Drop some images or videos here." : "Nothing in here yet."}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((m) => (
              <MediaCard
                key={m.id}
                item={m}
                buckets={buckets}
                onUpdate={(patch) => update(m, patch)}
                onRemove={() => remove(m)}
                onTrim={tools.ffmpeg && m.kind === "video" ? () => setTrimming(m) : undefined}
              />
            ))}
          </div>
        )}
        {trimming && (
          <ClipDialog
            item={trimming}
            onClose={() => setTrimming(null)}
            onSaved={async () => {
              setTrimming(null);
              await load();
            }}
          />
        )}
        <p className="text-[11px] leading-relaxed text-muted">
          The AI looks at each image, and a frame of each video, and describes it, so auto campaigns can pick the right
          one for each post; edit a description if it&apos;s off. Images up to 5 MB, MP4 or MOV videos up to 256 MB.
        </p>
      </section>
    </div>
  );
}

function MediaCard({
  item,
  buckets,
  onUpdate,
  onRemove,
  onTrim,
}: {
  item: MediaItem;
  buckets: MediaBucket[];
  onUpdate: (patch: { description?: string; bucketIds?: string[] }) => void;
  onRemove: () => void;
  /** Set for videos when this computer can cut clips. */
  onTrim?: () => void;
}) {
  const ids = item.bucketIds ?? [];
  return (
    <div className="card-tight space-y-2">
      <MediaThumb item={item} className="aspect-video w-full" />
      <textarea
        className="textarea h-16 resize-none text-xs"
        defaultValue={item.description}
        placeholder={item.kind === "video" ? "What's in this video? The AI uses this to pick it." : "What does this show?"}
        onBlur={(e) => {
          if (e.target.value !== item.description) onUpdate({ description: e.target.value });
        }}
      />
      {buckets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {buckets.map((b) => {
            const on = ids.includes(b.id);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onUpdate({ bucketIds: on ? ids.filter((x) => x !== b.id) : [...ids, b.id] })}
                className={
                  "rounded-sm border px-1.5 py-0.5 text-[10px] transition " +
                  (on ? "border-primary bg-primary/10 text-fg" : "border-line text-muted hover:text-fg")
                }
              >
                {on ? "✓ " : "+ "}
                {b.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 text-[10px] text-muted">
        <span className="font-mono">
          {item.seconds !== undefined && `${clock(item.seconds)} · `}
          {formatBytes(item.bytes)}
        </span>
        <span className="flex gap-3">
          {onTrim && (
            <button type="button" onClick={onTrim} className="hover:text-fg">
              Trim
            </button>
          )}
          <button type="button" onClick={onRemove} className="hover:text-error">
            Remove
          </button>
        </span>
      </div>
    </div>
  );
}

/** A dialog to pick one item from the library (the Scheduler's "From library"). */
export function LibraryPicker({
  accept,
  onPick,
  onClose,
}: {
  /** Which kinds the post can take. */
  accept: { images: boolean; videos: boolean };
  onPick: (item: MediaItem) => void;
  onClose: () => void;
}) {
  const { items, buckets, loaded } = useMediaLibrary();
  const [filter, setFilter] = useState<Filter>("all");
  const usable = items.filter((m) => (m.kind === "video" ? accept.videos : accept.images) && inFilter(m, filter));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4 animate-fade-in" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-line bg-surface p-5 shadow-md" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="label !mb-0">From your media</div>
          <select className="select w-auto text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All media</option>
            <option value="unsorted">Unsorted</option>
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        {loaded && usable.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Nothing here. Add media on the Media page.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {usable.map((m) => (
              <button key={m.id} type="button" onClick={() => onPick(m)} className="space-y-1 text-left" title={m.description}>
                <MediaThumb item={m} className="aspect-video w-full ring-primary hover:ring-2" />
                <span className="line-clamp-2 text-[10px] text-muted">{m.description || "No description"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Platforms with a length limit, for the one-tap "first 2:20 for X" clips. */
const SHORT_PLATFORMS = (Object.keys(PLATFORMS) as PlatformId[]).filter((p) => PLATFORMS[p].maxVideoSeconds > 0);

/**
 * Cut a clip from a library video: play it and mark the start and end, or
 * take the first part a platform allows in one tap. The clip is a new item;
 * the original stays.
 */
function ClipDialog({ item, onClose, onSaved }: { item: MediaItem; onClose: () => void; onSaved: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(item.seconds ?? 0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(item.seconds ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = end > start + 0.5;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/media-library/${item.id}/clip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, end }),
      }).then((res) => res.json());
      if (r.error) setError(r.error);
      else onSaved();
    } finally {
      setSaving(false);
    }
  }

  const here = () => video.current?.currentTime ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-2xl space-y-4 rounded-lg border border-line bg-surface p-5 shadow-md" onClick={(e) => e.stopPropagation()}>
        <div className="label !mb-0">Trim into a clip</div>
        <video
          ref={video}
          src={`/api/scheduler/uploads/${item.filename}`}
          controls
          className="max-h-[50vh] w-full rounded-md border border-line bg-fg"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d)) {
              setDuration(d);
              if (!end) setEnd(d);
            }
          }}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setStart(here())} className="btn-ghost text-xs">
              Start here
            </button>
            <span className="font-mono text-sm text-fg">{clock(start)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setEnd(here())} className="btn-ghost text-xs">
              End here
            </button>
            <span className="font-mono text-sm text-fg">{clock(end)}</span>
          </div>
        </div>
        {duration > 0 && SHORT_PLATFORMS.some((p) => duration > PLATFORMS[p].maxVideoSeconds) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            Quick:
            {SHORT_PLATFORMS.filter((p) => duration > PLATFORMS[p].maxVideoSeconds).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setStart(0);
                  setEnd(PLATFORMS[p].maxVideoSeconds);
                }}
                className="chip-suggest"
              >
                First {clock(PLATFORMS[p].maxVideoSeconds)} for {PLATFORMS[p].label}
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted">
          Play the video and tap Start here and End here, or pick a quick option. The clip ({clock(Math.max(0, end - start))})
          is saved as a new item in the same buckets; the original stays. You don&apos;t have to trim for length limits:
          when a post goes out, each platform gets a version that fits.
        </p>
        {error && <p className="text-xs text-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost text-sm">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!valid || saving} className="btn-primary text-sm">
            {saving ? "Cutting the clip…" : "Save clip"}
          </button>
        </div>
      </div>
    </div>
  );
}
