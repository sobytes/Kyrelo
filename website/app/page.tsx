import Image from "next/image";
import { Footer, GITHUB_URL, Nav, RELEASES_URL, SITE_URL } from "./site";

const APP_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Kyrelo",
  description:
    "Free, open-source desktop app to schedule posts to X and Bluesky, plan AI campaigns, draft replies you send yourself, bulk delete tweets and unfollow inactive accounts.",
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
      <CleanUp />
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
          Run your socials from your <span className="text-accent">own computer</span>.
          <br />
          No SaaS. No outages.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-zinc-400">
          Kyrelo is a free, open-source Buffer alternative. Schedule posts to X and Bluesky, let
          AI plan a whole campaign, get reply drafts under the posts you care about,
          and clean up old tweets and dead follows. It all runs on your machine with your own
          accounts and your own AI key.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-400">
          {["X", "Bluesky"].map((network) => (
            <span key={network} className="rounded-full border border-line bg-panel px-3 py-1">
              {network}
            </span>
          ))}
        </div>
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
          macOS (Apple Silicon &amp; Intel, signed &amp; notarized) · Windows 10/11 x64 · Free, open source
        </p>

        <div className="relative mx-auto mt-16 max-w-5xl">
          <div className="glow-purple overflow-hidden rounded-2xl border border-line bg-panel">
            <Image
              src="/screenshot.png"
              alt="Kyrelo desktop app — the Monitor watching X handles, with reply drafts"
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
            infrastructure. Your logins and AI keys live in a local data folder, and Kyrelo only
            talks to the networks you connect, the AI provider whose key you add, and any site you
            point an auto campaign at. If something breaks, it breaks for you alone, and you can
            read the source to fix it.
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

const FEATURE_GROUPS = [
  {
    heading: "Publish",
    features: [
      {
        title: "Schedule to X and Bluesky",
        body: "Write once and post to any of your connected accounts, with each network's character limit checked as you type. Attach an image, pick a time, and Kyrelo posts it for you. Connect as many accounts as you like.",
        icon: "calendar",
      },
      {
        title: "AI auto campaigns",
        body: "Describe what you're promoting and Kyrelo researches your product, competitors and niche, writes a series of X posts on different angles and spreads them out at natural, uneven times. Add AI images or pick from your own photos, and review everything before it's scheduled.",
        icon: "megaphone",
      },
    ],
  },
  {
    heading: "Engage",
    features: [
      {
        title: "Monitor the accounts that matter",
        body: "Add the X handles you care about and Kyrelo checks them every 90 seconds, with a desktop notification when they post, so you can be among the first to reply.",
        icon: "radar",
      },
      {
        title: "Autopilot reply drafts",
        body: "Autopilot scores each new post for how worth replying to it is and writes a few replies underneath, in the tone you choose. You pick one, edit it and send it yourself. Kyrelo never replies on its own, so every reply is really yours.",
        icon: "sparkles",
      },
    ],
  },
  {
    heading: "Clean up",
    features: [
      {
        title: "Bulk delete tweets & reposts",
        body: "Delete old posts and undo reposts up to 100 at a time, keep your newest ones, and never touch your pinned tweet.",
        icon: "trash",
      },
      {
        title: "Unfollow dead accounts",
        body: "See who you follow that has gone quiet, never interacts with you or looks like a bot, with the reason for each. Review the list, then unfollow at a human pace.",
        icon: "userMinus",
      },
    ],
  },
];

const EXTRAS = [
  {
    title: "iPhone companion app",
    body: "Check your Monitor feed, send reply drafts, schedule posts with photos and run campaigns from your phone. Your computer does the work; the phone connects to it over Wi-Fi or Tailscale. Open source; build it with Xcode.",
    icon: "phone",
  },
  {
    title: "Private by design",
    body: "No Kyrelo account and no Kyrelo servers. Your logins, keys and posts stay in a folder on your computer. Bring your own Claude or OpenAI key; AI features are optional.",
    icon: "lock",
  },
  {
    title: "macOS and Windows, signed",
    body: "Signed and notarized for macOS on Apple Silicon and Intel, and signed for Windows. MIT licensed: read it, change it, build it yourself.",
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
            Publish, engage, clean up. On your machine.
          </h2>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {FEATURE_GROUPS.map((group) => (
            <div key={group.heading} className="space-y-5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                {group.heading}
              </h3>
              {group.features.map((f) => (
                <FeatureCard key={f.title} {...f} />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {EXTRAS.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ title, body, icon }: { title: string; body: string; icon: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5 transition hover:border-line2">
      <Icon name={icon} />
      <h4 className="mt-4 text-base font-semibold text-zinc-100">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
    </div>
  );
}

const CLEANUP_POINTS = [
  {
    title: "Delete tweets in bulk",
    body: "Pick an account, choose how many posts to remove (up to 100 per run) and press go. Run it again to keep going until your timeline is as clean as you want it.",
  },
  {
    title: "Undo reposts, keep what matters",
    body: "Undo old reposts as you go, and set “Starting at” to keep your most recent posts. Pinned tweets are always left alone.",
  },
  {
    title: "Unfollow with reasons",
    body: "Scan who you follow and get suggestions: no posts in months, never interacts with you, bot-like, or doesn't follow back. Every suggestion says why, and nothing is unfollowed until you say so.",
  },
  {
    title: "Never lose the people who matter",
    body: "Accounts that interact with you, the handles you watch and big accounts are kept automatically. Add anyone to your keep list, and follow back anyone you unfollowed with one click.",
  },
];

const CLEANUP_FAQ = [
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
    q: "How do I unfollow inactive accounts on X?",
    a: "Open Unfollow in Kyrelo and scan who you follow. Turn on “Are dead” to find accounts with no posts in 3, 6 or 12 months, or that barely post, then review the list and unfollow the ones you pick. Follower, following and post counts come straight from your Following list; checking when each account last posted opens their profile, least active first.",
  },
  {
    q: "Will unfollowing lots of accounts get my X account locked?",
    a: "X limits how fast accounts can unfollow, so Kyrelo goes slowly: a few seconds between each, at most 100 per run and 300 a day. It stops if X starts refusing.",
  },
  {
    q: "Is it safe to give Kyrelo access to my X account?",
    a: "Kyrelo never sends your login anywhere. You sign in to X in a real Chrome window on your own computer, and Kyrelo works through that local session, clicking just as you would. The code is open source, so you can check exactly what it does.",
  },
  {
    q: "Can deleted tweets be recovered?",
    a: "No. Deleting a post on X is permanent, so double-check your settings before you run it. Undone reposts can be reposted again from the original tweet, and unfollowed accounts can be followed again from Kyrelo's history.",
  },
];

function CleanUp() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: CLEANUP_FAQ.map((f) => ({
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
            Deleter & Unfollow
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            Clean up your X account. <span className="text-accent">Free.</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-zinc-400">
            Tweet deleters and unfollow tools charge a monthly fee and ask for access to your
            account. Kyrelo bulk deletes your old posts and reposts, and unfollows the accounts
            that went quiet, straight from your own computer at no cost. Wipe years of old tweets,
            tidy up your profile before a job hunt, or get your feed back to the people you
            actually read.
          </p>
          <a
            href="/tweetdelete-alternative"
            className="mt-4 inline-block text-sm text-accent hover:underline"
          >
            Compare Kyrelo with TweetDelete →
          </a>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {CLEANUP_POINTS.map((p) => (
            <div key={p.title} className="rounded-xl border border-line bg-panel p-5">
              <h3 className="text-base font-semibold text-zinc-100">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{p.body}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-14 max-w-3xl">
          <h3 className="text-center text-xl font-semibold tracking-tight text-zinc-100">
            Deleter &amp; Unfollow FAQ
          </h3>
          <div className="mt-6 divide-y divide-line rounded-xl border border-line bg-panel">
            {CLEANUP_FAQ.map((f) => (
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
    body: "Grab the signed installer for your OS from GitHub releases. macOS: pick the -arm64 .dmg for Apple Silicon (M1 and later) or the -x64 .dmg for Intel, then drag to Applications. Windows: run the .exe installer.",
  },
  {
    n: 2,
    title: "Connect your accounts",
    body: "Sign in to X in a real Chrome window, including Google or Apple sign-in, and your session is saved on your computer. Bluesky connects with an app password. Add a Claude or OpenAI key if you want the AI features.",
  },
  {
    n: 3,
    title: "Publish, engage, clean up",
    body: "Queue posts in the Scheduler or let an auto campaign plan them. Watch handles in the Monitor and send the reply drafts you like. Clear out old tweets with the Deleter and dead follows with Unfollow.",
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
          Kyrelo is free, open source, and lives on your laptop. Bring your own accounts.
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
    case "shield":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "megaphone":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={common}>
          <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" />
          <path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" />
        </svg>
      );
    case "userMinus":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={common}>
          <circle cx="9" cy="8" r="4" />
          <path d="M2 21a7 7 0 0 1 14 0M17 11h5" />
        </svg>
      );
    case "phone":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={common}>
          <rect x="6" y="2" width="12" height="20" rx="2.5" />
          <path d="M11 18h2" />
        </svg>
      );
    case "lock":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={common}>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
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
