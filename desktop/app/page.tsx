import { HomePanel } from "@/components/HomePanel";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6 pb-6 pt-10">
      <h1 className="text-xl font-semibold tracking-tight text-fg">Kyrelo</h1>
      <p className="mt-1 text-sm text-muted">
        Schedule to all your accounts at once, or pick a service for its own tools.
      </p>
      <div className="mt-8">
        <HomePanel />
      </div>
    </main>
  );
}
