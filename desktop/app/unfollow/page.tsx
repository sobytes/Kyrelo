import { UnfollowPanel } from "@/components/UnfollowPanel";

export default function UnfollowPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-6 pt-10">
      <h1 className="text-xl font-semibold tracking-tight text-fg">Unfollow</h1>
      <p className="mt-1 text-sm text-muted">
        Clean up who an X account follows: dead accounts, people who never interact, bots. You review every
        suggestion before anything is unfollowed.
      </p>

      <div className="mt-6">
        <UnfollowPanel />
      </div>
    </main>
  );
}
