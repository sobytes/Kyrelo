import { MediaPanel } from "@/components/MediaPanel";

export default function MediaPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 pb-6 pt-10">
      <h1 className="text-xl font-semibold tracking-tight text-fg">Media</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Your images and videos, in buckets. Attach them to posts in the Scheduler, or give an auto campaign a bucket to
        pick from.
      </p>
      <div className="mt-6">
        <MediaPanel />
      </div>
    </main>
  );
}
