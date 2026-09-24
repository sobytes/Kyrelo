import { DeleterPanel } from "@/components/DeleterPanel";

export default function DeleterPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-6 pt-10">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Deleter</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Bulk-delete tweets from one of your connected X accounts. Keep the top N and
        delete the rest.
      </p>

      <div className="mt-6">
        <DeleterPanel />
      </div>
    </main>
  );
}
