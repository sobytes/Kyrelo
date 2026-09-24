import { SchedulerPanel } from "@/components/SchedulerPanel";

export default function SchedulerPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-6 pt-10">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Scheduler</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Queue posts to send through your connected X account at a specific time.
      </p>

      <div className="mt-6">
        <SchedulerPanel />
      </div>
    </main>
  );
}
