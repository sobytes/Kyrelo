import Image from "next/image";
import { Footer, GITHUB_URL, Nav, RELEASES_URL, SITE_URL } from "./site";

const APP_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Kyrelo",
  description:
    "Free, open-source desktop app to schedule X posts, monitor handles, draft AI replies and bulk delete tweets and reposts.",
  applicationCategory: "SocialNetworkingApplication",
  operatingSystem: "macOS, Windows",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  license: "https://opensource.org/licenses/MIT",
  url: SITE_URL,
  downloadUrl: RELEASES_URL,
  image: `${SITE_URL}/screenshot.png`,
};

export default function Home() {
  return (
    <main className="relative">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(APP_JSON_LD) }}
      />
      <Nav />
      <Hero />
      <Why />
      <Features />
      <Deleter />
      <HowItWorks />
      <CTA />
      <Footer />
    </main>
  );
}

function Hero() {
  return (
    <section className="hero-bg relative overflow-hidden pt-32 pb-20">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-live" />
          Open source · macOS &amp; Windows · free
        </span>
        <h1 className="mx-auto max-w-3xl text-balance text-5xl font-semibold tracking-tight text-zinc-50 sm:text-6xl">
          Schedule X posts from your <span className="text-accent">own computer</span>.
          <br />
          No SaaS. No outages.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-zinc-400">
          Kyrelo is a local Buffer alternative for X. Schedule posts across multiple accounts,
          watch handles for new tweets, reply with AI-generated questions, and bulk delete your
          old tweets and reposts for free — all running on your machine, with the only network
          calls going to X and your AI provider.
        </p>
        <div id="download" className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href={RELEASES_URL} className="btn-primary" target="_blank" rel="noreferrer">
            <span aria-hidden> </span>
            Download for macOS
          </a>
          <a href={RELEASES_URL} className="btn-primary" target="_blank" rel="noreferrer">
            <span aria-hidden> </span>
            Download for Windows
          </a>
          <a href={GITHUB_URL} className="btn-ghost" target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          macOS (Apple Silicon, signed &amp; notarized) · Windows 10/11 x64 · Free, open source
        </p>

        <div className="relative mx-auto mt-16 max-w-5xl">
          <div className="glow-purple overflow-hidden rounded-2xl border border-line bg-panel">
            <Image
              src="/screenshot.png"
              alt="Kyrelo desktop app — watching 24 X handles with AI reply prompts"
              width={2400}
              height={1500}
              className="h-auto w-full"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Why() {
  return (
    <section className="border-t border-line bg-ink py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 md:grid-cols-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Why this exists
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            Because cloud schedulers go down.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-zinc-400">
            Buffer&apos;s status page is a working-day fixture. Multi-hour outages across web,
            iOS, Android and API. ~97% uptime over the last quarter. When the scheduling layer
            is someone else&apos;s cloud, it breaks at exactly the moments you need it up.
          </p>
          <p className="mt-4 text-base leading-relaxed text-zinc-400">
            Kyrelo runs entirely on your machine. No backend, no SaaS account, no shared
            infrastructure. Your X session and AI keys live in a local data directory; the only
            network calls are to <code className="rounded bg-panel px-1 py-0.5 text-[13px] text-zinc-300">x.com</code> and
            whichever AI provider you choose. If something breaks, it breaks for you alone — and
            you can read the source to fix it.
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-panel p-3 shadow-xl">
          <Image
            src="/buffer-status.png"
            alt="Buffer status page showing 17-hour ongoing outage and ~97% uptime"
            width={1200}
            height={1400}
            className="h-auto w-full rounded-md"
          />
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    title: "Schedule across multiple X accounts",
    body: "Connect any number of X accounts. Each gets its own isolated Chrome profile. Pick which account each post goes from via tabs.",
    icon: "calendar",
  },
  {
    title: "Watch handles, get notified",
    body: "Add a list of @handles you care about. Kyrelo scrapes their timelines every 90 seconds and fires a native macOS notification on new tweets and replies.",
    icon: "radar",
  },
  {
    title: "AI-generated @grok replies",
    body: "On any new tweet, hit Reply with @grok — Claude or OpenAI drafts a sharp question. You edit, copy, and post manually on X (or skip if it doesn't land right).",
    icon: "sparkles",
  },
  {
    title: "Bulk delete tweets & reposts",
    body: "Clear out your X history for free. Delete your old posts and undo reposts up to 100 at a time, keep your newest ones, and never touch your pinned tweet.",
    icon: "trash",
  },
  {
    title: "Image attachments",
    body: "Attach an image to any scheduled post. Kyrelo uploads it through X's normal compose flow at send time.",
    icon: "image",
  },
  {
    title: "Visible posting",
    body: "Scheduled posts open a Chrome window so you can watch them type and submit in real time — useful while testing. Flip the headless toggle once you trust it.",
    icon: "eye",
  },
  {
    title: "macOS and Windows, signed",
    body: "Apple Developer ID signed and notarized for macOS (no Gatekeeper warning), and Sectigo-signed for Windows. Open source — read it, build it yourself.",
    icon: "shield",
  },
];

function Features() {
  return (
    <section id="features" className="border-t border-line bg-ink py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Features
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            Everything Buffer does for X, on your machine.
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-line bg-panel p-5 transition hover:border-line2"
            >
              <Icon name={f.icon} />
              <h3 className="mt-4 text-base font-semibold text-zinc-100">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const DELETER_POINTS = [
  {
    title: "Delete tweets in bulk",
    body: "Pick an account, choose how many posts to remove (up to 100 per run) and press go. Run it again to keep going until your timeline is as clean as you want it.",
  },
  {
    title: "Undo reposts too",
    body: "Flip on “Include reposts” and Kyrelo un-retweets as it goes, so old reposts disappear from your profile along with your own posts.",
  },
  {
    title: "Keep what matters",
    body: "Set “Starting at” to skip your most recent posts and only delete older ones. Pinned tweets are always left alone.",
  },
  {
    title: "Free, private, no API",
    body: "No subscription, no paid X API access, and no third-party app holding your login. It runs in your own signed-in Chrome session on your machine.",
  },
];

const DELETER_FAQ = [
  {
    q: "How do I delete all my tweets on X for free?",
    a: "Download Kyrelo, connect your X account, open the Deleter and choose how many posts to remove. Each run deletes up to 100 posts. Run it as many times as you need to clear your whole timeline. It costs nothing and needs no X API plan.",
  },
  {
    q: "Can I delete reposts (retweets) as well?",
    a: "Yes. Turn on “Include reposts” and Kyrelo will undo your reposts alongside deleting your own posts. Leave it off to delete only your own tweets.",
  },
  {
    q: "Can I keep my newest tweets and only delete old ones?",
    a: "Yes. The “Starting at” setting skips your most recent posts, so you can keep, say, your latest 50 and delete everything older. Your pinned tweet is never deleted.",
  },
  {
    q: "Is it safe to give Kyrelo access to my X account?",
    a: "Kyrelo never sends your login anywhere. You sign in to X in a real Chrome window on your own computer, and the deleter works through that local session, clicking Delete just as you would. The code is open source, so you can check exactly what it does.",
  },
  {
    q: "Can deleted tweets be recovered?",
    a: "No. Deleting a post on X is permanent, so double-check your settings before you run it. Undone reposts can be reposted again from the original tweet.",
  },
];

function Deleter() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: DELETER_FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <section id="delete-tweets" className="border-t border-line bg-ink py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            New · Tweet deleter
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            Delete your old tweets and reposts. <span className="text-accent">Free.</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-zinc-400">
            Tweet deleter services charge a monthly fee and ask for access to your account.
            Kyrelo&apos;s built-in Deleter bulk deletes your X posts and undoes your reposts
            straight from your own computer, at no cost. Wipe years of old tweets, tidy up your
            profile before a job hunt, or just start fresh.
          </p>
          <a
            href="/tweetdelete-alternative"
            className="mt-4 inline-block text-sm text-accent hover:underline"
          >
            Compare Kyrelo with TweetDelete →
          </a>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {DELETER_POINTS.map((p) => (
            <div key={p.title} className="rounded-xl border border-line bg-panel p-5">
              <h3 className="text-base font-semibold text-zinc-100">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{p.body}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-14 max-w-3xl">
          <h3 className="text-center text-xl font-semibold tracking-tight text-zinc-100">
            Tweet deleter FAQ
          </h3>
          <div className="mt-6 divide-y divide-line rounded-xl border border-line bg-panel">
            {DELETER_FAQ.map((f) => (
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
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: 1,
    title: "Download & open",
    body: "Grab the signed installer for your OS from GitHub releases. macOS: drag to Applications. Windows: run the .exe installer.",
  },
  {
    n: 2,
    title: "Connect your X account",
    body: "Kyrelo opens a real Chrome window pointed at x.com/login. Sign in once — including Google or Apple OAuth — and your session is saved locally.",
  },
  {
    n: 3,
    title: "Schedule, monitor, clean up",
    body: "Use the Scheduler timeline to queue posts at specific times. Add handles in the Monitor to get notified on new activity. Generate AI replies on demand, and clear out old tweets with the Deleter.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="border-t border-line bg-ink py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            How it works
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            Three steps. No accounts to make.
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-xl border border-line bg-panel p-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-accent to-live text-sm font-bold text-white">
                {s.n}
              </div>
              <h3 className="mt-4 text-base font-semibold text-zinc-100">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="border-t border-line py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
          Stop refreshing the status page.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-zinc-400">
          Kyrelo is free, open source, and lives on your laptop. Bring your own X account.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href={RELEASES_URL} className="btn-primary" target="_blank" rel="noreferrer">
            Download for macOS
          </a>
          <a href={RELEASES_URL} className="btn-primary" target="_blank" rel="noreferrer">
            Download for Windows
          </a>
          <a href={GITHUB_URL} className="btn-ghost" target="_blank" rel="noreferrer">
            View source
          </a>
        </div>
      </div>
    </section>
  );
}

function Icon({ name }: { name: string }) {
  const common = "h-6 w-6 text-accent";
  switch (name) {
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "radar":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v9l6 4" />
        </svg>
      );
    case "sparkles":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={common}>
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
        </svg>
      );
    case "image":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      );
    case "eye":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={common}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "trash":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={common}>
          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      );
    default:
      return null;
  }
}
