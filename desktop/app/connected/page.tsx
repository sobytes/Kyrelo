import { ConnectedPanel } from "@/components/ConnectedPanel";

export default function ConnectedPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-6 pt-10">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Connected accounts</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Manage which accounts the detector can read from and reply through.
      </p>

      <div className="mt-6">
        <ConnectedPanel />
      </div>
    </main>
  );
}
