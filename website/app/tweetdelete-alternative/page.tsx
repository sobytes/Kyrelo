import type { Metadata } from "next";
import { Footer, GITHUB_URL, Nav, RELEASES_URL } from "../site";

const title = "Free, Open-Source TweetDelete Alternative — Kyrelo";
const description =
  "Looking for a free TweetDelete alternative? Kyrelo is an open-source desktop app that bulk deletes your X (Twitter) posts and undoes reposts from your own computer — no subscription, no third-party app access.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tweetdelete-alternative" },
  keywords: [
    "TweetDelete alternative",
    "free TweetDelete alternative",
    "open source tweet deleter",
    "delete all tweets free",
    "bulk delete tweets",
    "delete reposts",
    "undo retweets",
    "X post deleter",
  ],
  openGraph: {
    title,
    description,
    url: "/tweetdelete-alternative",
    siteName: "Kyrelo",
    type: "article",
    images: [{ url: "/screenshot.png", width: 1200, height: 720 }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/screenshot.png"],
  },
};

type Cell = { text: string; good?: boolean };

const COMPARISON: { feature: string; kyrelo: Cell; tweetdelete: Cell }[] = [
  {
    feature: "Price",
    kyrelo: { text: "Free, forever", good: true },
    tweetdelete: { text: "One free clean-up, then paid Premium for advanced features" },
  },
  {
    feature: "Open source",
    kyrelo: { text: "Yes, MIT licensed", good: true },
    tweetdelete: { text: "No" },
  },
  {
    feature: "Where it runs",
    kyrelo: { text: "On your own Mac or Windows PC", good: true },
    tweetdelete: { text: "On TweetDelete's servers" },
  },
  {
    feature: "Account access",
    kyrelo: { text: "Your own local browser session, never shared", good: true },
    tweetdelete: { text: "You grant a third-party app access via X sign-in" },
  },
  {
    feature: "Delete your posts",
    kyrelo: { text: "Yes, up to 100 per run", good: true },
    tweetdelete: { text: "Yes", good: true },
  },
  {
    feature: "Undo reposts (retweets)",
    kyrelo: { text: "Yes", good: true },
    tweetdelete: { text: "Yes", good: true },
  },
  {
    feature: "Keep your newest posts",
    kyrelo: { text: "Yes, skip the latest N", good: true },
    tweetdelete: { text: "Yes, with date filters", good: true },
  },
  {
    feature: "Delete likes, replies and DMs",
    kyrelo: { text: "Not yet" },
    tweetdelete: { text: "Yes", good: true },
  },
  {
    feature: "Also schedules posts",
    kyrelo: { text: "Yes, plus handle monitoring and AI replies", good: true },
    tweetdelete: { text: "No" },
  },
];

const REASONS = [
  {
    title: "Actually free",
    body: "No trial, no one-time allowance, no upsell. Kyrelo is free to download and free to use as often as you like, because it runs on your hardware instead of a paid cloud service.",
  },
  {
    title: "Open source, so you can check it",
    body: "Handing a stranger's app the keys to your X account is a leap of faith. Kyrelo's code is public on GitHub under the MIT license. Read exactly what the deleter does, or build it yourself.",
  },
  {
    title: "Your login never leaves your computer",
    body: "You sign in to X in a real Chrome window on your own machine. There's no OAuth grant to a third party and no server holding your session. The deleter clicks Delete just as you would.",
  },
  {
    title: "More than a deleter",
    body: "The same app schedules X posts across multiple accounts, watches handles for new tweets, and drafts AI replies. It's a local, free Buffer alternative with a tweet deleter built in.",
  },
];

const STEPS = [
  "Download Kyrelo for macOS or Windows from GitHub releases.",
  "Connect your X account. Kyrelo opens X in Chrome so you can sign in normally.",
  "Open the Deleter, pick the account, and choose how many posts to remove (up to 100 per run).",
  "Turn on “Include reposts” to undo retweets too, and set “Starting at” to keep your newest posts.",
  "Press delete and watch it work. Run it again until your timeline is as clean as you want.",
];

const FAQ = [
  {
    q: "Is there a free alternative to TweetDelete?",
    a: "Yes. Kyrelo is a free, open-source desktop app for macOS and Windows that bulk deletes your X posts and undoes your reposts. There's no subscription or usage cap, because it runs on your own computer rather than a paid cloud service.",
  },
  {
    q: "Is Kyrelo safer than TweetDelete?",
    a: "Kyrelo takes a different approach. Instead of granting a third-party web app access to your account, you sign in to X in a browser on your own machine and the deleter runs locally. The code is open source, so anyone can verify what it does.",
  },
  {
    q: "Can Kyrelo delete all my tweets?",
    a: "Kyrelo deletes your posts in runs of up to 100 at a time, starting from your newest (or from any point you choose). Run it repeatedly to work back through your timeline. Pinned tweets are always skipped so you don't lose them by accident.",
  },
  {
    q: "Does Kyrelo delete likes or DMs?",
    a: "Not yet. Kyrelo currently deletes your own posts and undoes reposts. If you need to remove likes, replies or direct messages, TweetDelete and similar services cover those today.",
  },
  {
    q: "Is Kyrelo affiliated with TweetDelete?",
    a: "No. Kyrelo is an independent open-source project. TweetDelete is a trademark of its respective owner and is mentioned here only for comparison.",
  },
];

export default function TweetDeleteAlternative() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Kyrelo",
      applicationCategory: "SocialNetworkingApplication",
      operatingSystem: "macOS, Windows",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      license: "https://opensource.org/licenses/MIT",
      url: "https://kyrelo.com",
      downloadUrl: RELEASES_URL,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];

  return (
    <main className="relative">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Nav />

      <section className="hero-bg relative overflow-hidden pt-32 pb-16">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-live" />
            Free · Open source · MIT licensed
          </span>
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
            The free, open-source <span className="text-accent">TweetDelete alternative</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-zinc-400">
            Bulk delete your old X (Twitter) posts and undo your reposts without paying for a
            subscription or handing your account to a third-party app. Kyrelo runs on your own
            computer, and its code is open for anyone to read.
          </p>
          <div id="download" className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href={RELEASES_URL} className="btn-primary" target="_blank" rel="noreferrer">
              Download for macOS
            </a>
            <a href={RELEASES_URL} className="btn-primary" target="_blank" rel="noreferrer">
              Download for Windows
            </a>
            <a href={GITHUB_URL} className="btn-ghost" target="_blank" rel="noreferrer">
              View source on GitHub
            </a>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-ink py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
              Why switch from TweetDelete to Kyrelo?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-zinc-400">
              TweetDelete is a popular web service for clearing out your X history. Kyrelo does
              the core job, deleting posts and reposts in bulk, for free and without the cloud.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {REASONS.map((r) => (
              <div key={r.title} className="rounded-xl border border-line bg-panel p-5">
                <h3 className="text-base font-semibold text-zinc-100">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-ink py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            Kyrelo vs TweetDelete
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-zinc-500">
            An honest side-by-side. TweetDelete covers more types of content today; Kyrelo is
            free, open source and keeps your account on your machine.
          </p>
          <div className="mt-10 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-panel text-zinc-300">
                <tr>
                  <th className="px-4 py-3 font-medium"></th>
                  <th className="px-4 py-3 font-semibold text-accent">Kyrelo</th>
                  <th className="px-4 py-3 font-medium">TweetDelete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {COMPARISON.map((row) => (
                  <tr key={row.feature}>
                    <th scope="row" className="px-4 py-3 font-medium text-zinc-200">
                      {row.feature}
                    </th>
                    <td className={`px-4 py-3 ${row.kyrelo.good ? "text-zinc-100" : "text-zinc-500"}`}>
                      {row.kyrelo.good && <span className="mr-1.5 text-live">✓</span>}
                      {row.kyrelo.text}
                    </td>
                    <td className={`px-4 py-3 ${row.tweetdelete.good ? "text-zinc-300" : "text-zinc-500"}`}>
                      {row.tweetdelete.good && <span className="mr-1.5 text-live">✓</span>}
                      {row.tweetdelete.text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-center text-xs text-zinc-600">
            TweetDelete details based on its public website, September 2026. Check tweetdelete.net
            for current plans and pricing.
          </p>
        </div>
      </section>

      <section className="border-t border-line bg-ink py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            How to delete all your tweets for free
          </h2>
          <ol className="mt-10 space-y-4">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-4 rounded-xl border border-line bg-panel p-5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-accent to-live text-sm font-bold text-white">
                  {i + 1}
                </span>
                <span className="pt-1 text-sm leading-relaxed text-zinc-300">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-center text-xs text-zinc-500">
            Deleted posts can&apos;t be recovered, so double-check your settings before you run
            it.
          </p>
        </div>
      </section>

      <section className="border-t border-line bg-ink py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            TweetDelete alternative FAQ
          </h2>
          <div className="mt-10 divide-y divide-line rounded-xl border border-line bg-panel">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none text-sm font-medium text-zinc-100 marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span className="text-zinc-500 transition group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            Clean up your X profile, free.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-zinc-400">
            Download Kyrelo, connect your account, and start deleting. No sign-up, no
            subscription.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href={RELEASES_URL} className="btn-primary" target="_blank" rel="noreferrer">
              Download Kyrelo
            </a>
            <a href="/" className="btn-ghost">
              See all features
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
