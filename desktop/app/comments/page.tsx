import { CommentsPanel } from "@/components/CommentsPanel";

export default function CommentsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-6 pt-10">
      <h1 className="text-xl font-semibold tracking-tight text-fg">Comments</h1>
      <p className="mt-1 text-sm text-muted">
        Comments on your posts from Bluesky, Mastodon and Threads in one place, with AI reply drafts. You choose what gets
        sent.
      </p>
      <div className="mt-6">
        <CommentsPanel />
      </div>
    </main>
  );
}
