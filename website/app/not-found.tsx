import type { Metadata } from "next";
import { Footer, Nav, RELEASES_URL } from "./site";

export const metadata: Metadata = {
  title: "Page not found — Kyrelo",
  robots: { index: false },
};

const LINKS = [
  { href: "/#features", title: "Features", body: "Scheduling, handle monitoring and AI replies for X." },
  { href: "/#delete-tweets", title: "Delete tweets", body: "Bulk delete your old posts and reposts, free." },
  { href: "/tweetdelete-alternative", title: "TweetDelete alternative", body: "How Kyrelo compares, side by side." },
];

export default function NotFound() {
  return (
    <main className="relative">
      <Nav />
      <section className="hero-bg relative overflow-hidden pt-32 pb-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Error 404
          </span>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
            This page has been <span className="text-accent">deleted</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-zinc-400">
            Or it never existed. Either way, there&apos;s nothing here. Try one of these
            instead.
          </p>

          <div className="mt-10 grid gap-4 text-left sm:grid-cols-3">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-xl border border-line bg-panel p-5 transition hover:border-line2"
              >
                <h2 className="text-sm font-semibold text-zinc-100">{l.title} →</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{l.body}</p>
              </a>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a href="/" className="btn-primary">
              Back to home
            </a>
            <a href={RELEASES_URL} className="btn-ghost" target="_blank" rel="noreferrer">
              Download Kyrelo
            </a>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
