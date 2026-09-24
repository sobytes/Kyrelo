import { SettingsPanel } from "@/components/SettingsPanel";

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-6 pt-10">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Settings</h1>
      <p className="mt-1 text-sm text-zinc-400">
        AI provider, API keys, reply tone, and notification preferences.
      </p>

      <div className="mt-6">
        <SettingsPanel />
      </div>
    </main>
  );
}
