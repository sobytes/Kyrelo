import { DeleterPanel } from "@/components/DeleterPanel";

export default function DeleterPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-6 pt-10">
      <h1 className="text-xl font-semibold tracking-tight text-fg">Deleter</h1>
      <p className="mt-1 text-sm text-muted">
        Bulk-delete posts and replies, or unlike likes, from a connected X account. Keep
        your newest and remove the rest.
      </p>

      <div className="mt-6">
        <DeleterPanel />
      </div>
    </main>
  );
}
