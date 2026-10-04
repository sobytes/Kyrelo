import { CommentsPanel } from "@/components/CommentsPanel";
import { COMMENT_PLATFORMS } from "@/lib/comments";
import { PLATFORMS } from "@/lib/platforms";

const names = COMMENT_PLATFORMS.map((p) => PLATFORMS[p].label);
const listed = `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export default function CommentsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-6 pt-10">
      <h1 className="text-xl font-semibold tracking-tight text-fg">Comments</h1>
      <p className="mt-1 text-sm text-muted">
        Comments on your posts from {listed} in one place, with AI reply drafts. You choose what gets sent.
      </p>
      <div className="mt-6">
        <CommentsPanel />
      </div>
    </main>
  );
}
