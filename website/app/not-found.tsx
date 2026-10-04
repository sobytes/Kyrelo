import type { Metadata } from "next";
import { Footer, Nav, RELEASES_URL } from "./site";

export const metadata: Metadata = {
  title: "Page not found — Kyrelo",
  robots: { index: false },
};

const LINKS = [
  { href: "/#features", title: "Features", body: "Scheduling to 17 platforms, AI comment replies, monitoring and clean-up." },
  { href: "/#delete-tweets", title: "Delete tweets", body: "Bulk delete your old posts and reposts, free." },
  { href: "/tweetdelete-alternative", title: "TweetDelete alternative", body: "How Kyrelo compares, side by side." },
];

export default function NotFound() {
  return (
    <main>
      <Nav />
      <section className="pb-20 pt-32">
        <div className="mx-auto max-w-5xl px-6">
          <p className="eyebrow">Error 404</p>
          <h1 className="mt-4 max-w-2xl text-balance text-4xl font-semibold leading-tight tracking-tight text-fg">
            This page has been deleted.
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted">
            Or it never existed. Either way, there&apos;s nothing here. Try one of these instead.
          </p>

          <ul className="mt-10 max-w-2xl divide-y divide-line border-y border-line">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="group flex items-baseline justify-between gap-6 py-4">
                  <span>
                    <span className="text-sm font-semibold text-fg group-hover:text-primary">{l.title}</span>
                    <span className="mt-1 block text-sm text-muted">{l.body}</span>
                  </span>
                  <span className="font-mono text-sm text-muted">→</span>
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-wrap items-center gap-3">
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
