import { ConnectedPanel } from "@/components/ConnectedPanel";

export default function ConnectedPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-6 pt-10">
      <h1 className="text-xl font-semibold tracking-tight text-fg">Connected accounts</h1>
      <p className="mt-1 text-sm text-muted">
        Connect the X and Bluesky accounts Kyrelo posts to. The Monitor reads timelines through your first X account.
      </p>

      <div className="mt-6">
        <ConnectedPanel />
      </div>
    </main>
  );
}
