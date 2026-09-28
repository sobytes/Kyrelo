import { ConnectedPanel } from "@/components/ConnectedPanel";

export default function ConnectedPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-6 pt-10">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Connected accounts</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Connect the X, LinkedIn and Bluesky accounts Kyrelo posts to. The Monitor reads timelines through your first X account.
      </p>

      <div className="mt-6">
        <ConnectedPanel />
      </div>
    </main>
  );
}
