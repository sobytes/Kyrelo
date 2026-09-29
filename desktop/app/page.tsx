import { HomePanel } from "@/components/HomePanel";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6 pb-6 pt-10">
      <h1 className="text-xl font-semibold tracking-tight text-fg">Services</h1>
      <p className="mt-1 text-sm text-muted">Pick a service to schedule, monitor and clean up its accounts.</p>
      <div className="mt-8">
        <HomePanel />
      </div>
    </main>
  );
}
