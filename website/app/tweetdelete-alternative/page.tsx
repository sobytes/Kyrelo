import type { Metadata } from "next";
import { Footer, GITHUB_URL, Nav, RELEASES_URL, SITE_URL } from "../site";

const title = "Free, Open-Source TweetDelete Alternative — Kyrelo";
const description =
  "Kyrelo is a free, open-source TweetDelete alternative. Bulk delete your X (Twitter) posts, replies and reposts, and unlike your likes, from your own computer. No subscription.";

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
    "delete replies on X",
    "delete all likes on X",
    "unlike all tweets",
    "X post deleter",
  ],
  openGraph: {
    title,
    description,
    url: "/tweetdelete-alternative",
    siteName: "Kyrelo",
    type: "article",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Kyrelo — free, open-source X scheduler and tweet deleter" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/twitter-image"],
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
    feature: "Delete your replies",
    kyrelo: { text: "Yes, replies to others (your threads are kept)", good: true },
    tweetdelete: { text: "Yes", good: true },
  },
  {
    feature: "Unlike your likes",
    kyrelo: { text: "Yes, newest first, up to 100 per run", good: true },
    tweetdelete: { text: "Yes", good: true },
  },
  {
    feature: "Delete DMs",
    kyrelo: { text: "No: X's new Chat is end-to-end encrypted behind a passcode" },
    tweetdelete: { text: "Yes", good: true },
  },
  {
    feature: "Also schedules posts",
    kyrelo: { text: "Yes, plus monitoring, reply drafts and Unfollow", good: true },
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
  "Open the Deleter, pick the account, and choose what to remove: posts, replies or likes.",
  "Choose how many (up to 100 per run) and set “Starting at” to keep your newest ones. For posts, turn on “Include reposts” to undo retweets too.",
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
    q: "Can Kyrelo delete my likes and replies?",
    a: "Yes. Choose Likes in the Deleter to unlike posts, newest first, or Replies to delete your replies to other people. Replies in your own threads are kept so your threads stay intact. Unliking can be undone by liking the post again; deleted replies can't be recovered.",
  },
  {
    q: "Can Kyrelo delete my DMs?",
    a: "No. X has moved direct messages to its new Chat, which is end-to-end encrypted and unlocked with a passcode on each device, so Kyrelo can't reach them the way it reaches your posts. If you need to clear DMs, delete conversations in X Chat, or check whether TweetDelete supports the new Chat.",
  },
  {
    q: "Is Kyrelo affiliated with TweetDelete?",
    a: "No. Kyrelo is an independent open-source project. TweetDelete is a trademark of its respective owner and is mentioned here only for comparison.",
  },
];

const PAGE = "mx-auto max-w-5xl px-6";

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
      url: SITE_URL,
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
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Nav />

      <section className="pb-16 pt-32">
        <div className={PAGE}>
          <p className="eyebrow">Free · Open source · MIT licensed</p>
          <h1 className="mt-4 max-w-2xl text-balance text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-4xl">
            The free, open-source TweetDelete alternative
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted">
            Bulk delete your old X (Twitter) posts and replies, undo your reposts and unlike your
            likes without paying for a subscription or handing your account to a third-party app. Kyrelo runs on your own
            computer, and its code is open for anyone to read.
          </p>
          <div id="download" className="mt-8 flex flex-wrap items-center gap-3">
            <a href={RELEASES_URL} className="btn-primary" target="_blank" rel="noreferrer">
              Download for macOS
            </a>
            <a href={RELEASES_URL} className="btn-ghost" target="_blank" rel="noreferrer">
              Download for Windows
            </a>
            <a href={GITHUB_URL} className="btn-ghost" target="_blank" rel="noreferrer">
              View source on GitHub
            </a>
          </div>
        </div>
      </section>

      <section className="section">
        <div className={PAGE}>
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
              Why switch from TweetDelete to Kyrelo?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted">
              TweetDelete is a popular web service for clearing out your X history. Kyrelo does
              the core jobs, deleting posts, replies and reposts and unliking likes in bulk, for
              free and without the cloud.
            </p>
          </div>
          <dl className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {REASONS.map((r) => (
              <div key={r.title} className="border-t border-line pt-4">
                <dt className="text-base font-semibold text-fg">{r.title}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted">{r.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section">
        <div className={PAGE}>
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Kyrelo vs TweetDelete</h2>
            <p className="mt-4 text-sm text-muted">
              An honest side-by-side. TweetDelete also covers DMs; Kyrelo is free, open source and
              keeps your account on your machine.
            </p>
          </div>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[560px] border-y border-line text-left text-sm">
              <thead className="border-b border-line text-fg">
                <tr>
                  <th className="py-3 pr-4 font-medium"></th>
                  <th className="px-4 py-3 font-semibold">Kyrelo</th>
                  <th className="px-4 py-3 font-medium">TweetDelete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {COMPARISON.map((row) => (
                  <tr key={row.feature}>
                    <th scope="row" className="py-3 pr-4 font-medium text-fg">
                      {row.feature}
                    </th>
                    <td className={`px-4 py-3 ${row.kyrelo.good ? "text-fg" : "text-muted"}`}>
                      {row.kyrelo.good && <span className="mr-2 text-success">✓</span>}
                      {row.kyrelo.text}
                    </td>
                    <td className={`px-4 py-3 ${row.tweetdelete.good ? "text-fg" : "text-muted"}`}>
                      {row.tweetdelete.good && <span className="mr-2 text-success">✓</span>}
                      {row.tweetdelete.text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 font-mono text-xs text-muted">
            TweetDelete details based on its public website, September 2026. Check tweetdelete.net
            for current plans and pricing.
          </p>
        </div>
      </section>

      <section className="section">
        <div className={PAGE}>
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            How to delete all your tweets for free
          </h2>
          <ol className="mt-8 max-w-2xl divide-y divide-line border-y border-line">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-6 py-4">
                <span className="w-6 shrink-0 font-mono text-sm text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-sm leading-relaxed text-fg">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted">
            Deleted posts can&apos;t be recovered, so double-check your settings before you run it.
          </p>
        </div>
      </section>

      <section className="section">
        <div className={PAGE}>
          <h2 className="text-lg font-semibold tracking-tight text-fg">TweetDelete alternative FAQ</h2>
          <div className="mt-4 divide-y divide-line border-y border-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="cursor-pointer list-none text-sm font-medium text-fg marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span className="font-mono text-muted transition-transform group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className={`${PAGE} flex flex-col gap-6 md:flex-row md:items-end md:justify-between`}>
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Clean up your X profile, free.</h2>
            <p className="mt-3 text-base text-muted">
              Download Kyrelo, connect your account, and start deleting. No sign-up, no subscription.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
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
