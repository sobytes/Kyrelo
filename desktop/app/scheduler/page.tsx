import { SchedulerPanel } from "@/components/SchedulerPanel";

export default function SchedulerPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-6 pt-10">
      <h1 className="text-xl font-semibold tracking-tight text-fg">Scheduler</h1>
      <p className="mt-1 text-sm text-muted">
        Queue posts to any of your accounts, on every service, at a specific time. Auto campaigns write a whole series.
      </p>
      <div className="mt-6">
        <SchedulerPanel />
      </div>
    </main>
  );
}
