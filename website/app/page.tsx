import Image from "next/image";
import { Footer, GITHUB_URL, Nav, RELEASES_URL, SITE_URL } from "./site";

const APP_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Kyrelo",
  description:
    "Free, open-source desktop app to schedule posts, images and videos to 17 platforms, answer comments with AI drafts you approve, plan AI campaigns, bulk delete tweets and unfollow inactive accounts.",
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
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(APP_JSON_LD) }}
      />
      <Nav />
      <Hero />
      <Demo />
      <Why />
      <Features />
      <CleanUp />
      <HowItWorks />
      <CTA />
      <Footer />
    </main>
  );
}

// Content width for the whole page: wide enough for the screenshot, narrow
// enough that sections read as a document.
const PAGE = "mx-auto max-w-5xl px-6";

function SectionHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{title}</h2>
      {children && <div className="mt-4 space-y-4 text-base leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

function Hero() {
  return (
    <section className="pb-16 pt-32">
      <div className={PAGE}>
        <p className="eyebrow">Open source · macOS &amp; Windows · Free</p>
        <h1 className="mt-4 max-w-2xl text-balance text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-4xl">
          Run your socials from your own computer.
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted">
          Kyrelo is a free, open-source alternative to Buffer and Postiz for 17 platforms, from X,
          LinkedIn and Instagram to YouTube, TikTok and Bluesky. Schedule posts and videos, answer
          every comment from one inbox with AI drafts you approve, let AI plan a whole campaign,
          and clean up old tweets and dead follows. No SaaS and no outages: it runs on your machine with your own
          accounts and your own AI key.
        </p>
        <div id="download" className="mt-8 flex flex-wrap items-center gap-3">
          <a href={RELEASES_URL} className="btn-primary" target="_blank" rel="noreferrer">
            Download for macOS
          </a>
          <a href={RELEASES_URL} className="btn-ghost" target="_blank" rel="noreferrer">
            Download for Windows
          </a>
          <a href={GITHUB_URL} className="btn-ghost" target="_blank" rel="noreferrer">
            View on GitHub
          </a>
          <a href="#demo" className="px-2 text-sm font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-fg">
            Watch the demo
          </a>
        </div>
        <p className="mt-4 font-mono text-xs text-muted">
          macOS: Apple Silicon &amp; Intel, signed &amp; notarised · Windows 10/11 x64
        </p>

        <div className="mt-12 overflow-hidden rounded-lg border border-line bg-surface">
          <Image
            src="/screenshot.png"
            alt="Kyrelo desktop app: the Monitor watching X handles, with reply drafts"
            width={2400}
            height={1500}
            className="h-auto w-full"
            priority
          />
        </div>
      </div>
    </section>
  );
}

const DEMO_VIDEO_ID = "zgzbSPSTf_A";

function Demo() {
  return (
    <section id="demo" className="section">
      <div className={PAGE}>
        <SectionHeader eyebrow="Demo" title="See it in action." />
        <div className="relative mt-8 aspect-video overflow-hidden rounded-lg border border-line bg-surface">
          {/* youtube-nocookie: no tracking cookies until the visitor presses play. */}
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${DEMO_VIDEO_ID}?rel=0`}
            title="Kyrelo is a free, open-source alternative to Buffer, TweetDelete etc"
            className="absolute inset-0 h-full w-full"
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  );
}

function Why() {
  return (
    <section className="section">
      <div className={`${PAGE} grid items-start gap-12 md:grid-cols-2`}>
        <SectionHeader eyebrow="Why this exists" title="Because cloud schedulers go down.">
          <p>
            Buffer&apos;s status page is a working-day fixture. Multi-hour outages across web, iOS,
            Android and API. ~97% uptime over the last quarter. When the scheduling layer is someone
            else&apos;s cloud, it breaks at exactly the moments you need it up.
          </p>
          <p>
            Kyrelo runs entirely on your machine. No backend, no SaaS account, no shared
            infrastructure. Your logins and AI keys live in a local data folder, and Kyrelo only
            talks to the networks you connect, the AI provider whose key you add, and any site you
            point an auto campaign at. If something breaks, it breaks for you alone, and you can
            read the source to fix it.
          </p>
        </SectionHeader>
        <figure>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <Image
              src="/buffer-status.png"
              alt="Buffer status page showing a 17-hour ongoing outage and ~97% uptime"
              width={1200}
              height={1400}
              className="h-auto w-full"
            />
          </div>
          <figcaption className="mt-2 font-mono text-xs text-muted">Buffer&apos;s status page</figcaption>
        </figure>
      </div>
    </section>
  );
}

const FEATURE_GROUPS = [
  {
    heading: "Publish",
    features: [
      {
        title: "Schedule to 17 platforms",
        body: "X, Bluesky, Mastodon, Threads, Instagram, Facebook, LinkedIn, YouTube, TikTok, Telegram, Discord, Slack, DEV, Hashnode, WordPress, Lemmy and Nostr. Write once or give each account its own version, which AI can adapt to each platform, attach an image or video, and see everything on a calendar. Official APIs wherever the platform offers one.",
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
        title: "Answer every comment from one inbox",
        body: "Comments on your posts on X, Bluesky, Mastodon, Threads, YouTube, Instagram, Facebook Pages, Lemmy and Nostr arrive in one place, with reply drafts in your voice. Spam and trolls are skipped. You pick a draft, edit it and press Reply: nothing is sent without you.",
        icon: "reply",
      },
      {
        title: "Monitor the accounts that matter",
        body: "Add the X handles you care about and Kyrelo checks them every 90 seconds, with a desktop notification when they post, so you can be among the first to reply.",
        icon: "radar",
      },
      {
        title: "Autopilot reply drafts",
        body: "Autopilot scores each new post for how worth replying to it is and writes a few replies underneath, in the tone you choose. You pick one, edit it and send it yourself. Kyrelo never replies on its own, so every reply is really yours.",
        icon: "reply",
      },
    ],
  },
  {
    heading: "Clean up",
    features: [
      {
        title: "Bulk delete posts, replies & likes",
        body: "Delete old posts and replies, undo reposts and unlike likes, up to 100 at a time. Keep your newest ones, and your pinned tweet is never touched.",
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
    <section id="features" className="section">
      <div className={PAGE}>
        <SectionHeader eyebrow="Features" title="Publish, engage, clean up. On your machine." />
        <div className="mt-12 grid gap-x-12 gap-y-12 md:grid-cols-3">
          {FEATURE_GROUPS.map((group) => (
            <div key={group.heading}>
              <h3 className="border-b border-line pb-2 text-sm font-semibold text-fg">{group.heading}</h3>
              <div className="mt-6 space-y-8">
                {group.features.map((f) => (
                  <Feature key={f.title} {...f} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-16 grid gap-x-12 gap-y-8 border-t border-line pt-8 md:grid-cols-3">
          {EXTRAS.map((f) => (
            <Feature key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Feature({ title, body, icon }: { title: string; body: string; icon: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon name={icon} />
        <h4 className="text-base font-semibold text-fg">{title}</h4>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

const CLEANUP_POINTS = [
  {
    title: "Delete tweets in bulk",
    body: "Pick an account, choose how many posts to remove (up to 100 per run) and press go. Run it again to keep going until your timeline is as clean as you want it.",
  },
  {
    title: "Replies, reposts and likes too",
    body: "Delete your replies to other people (your own threads are kept), undo old reposts, or unlike your likes. Set “Starting at” to keep your most recent ones. Pinned tweets are always left alone.",
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
    q: "Can I delete reposts, replies and likes as well?",
    a: "Yes. When deleting posts, turn on “Include reposts” to undo retweets too. Choose Replies to delete your replies to other people, or Likes to unlike posts, newest first. DMs aren't covered: X now keeps them in its end-to-end encrypted Chat.",
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
    <section id="delete-tweets" className="section">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className={PAGE}>
        <div className="grid gap-12 md:grid-cols-2">
          <SectionHeader eyebrow="Deleter & Unfollow" title="Clean up your X account, for free.">
            <p>
              Tweet deleters and unfollow tools charge a monthly fee and ask for access to your
              account. Kyrelo bulk deletes your old posts and reposts, and unfollows the accounts
              that went quiet, straight from your own computer at no cost. Wipe years of old
              tweets, tidy up your profile before a job hunt, or get your feed back to the people
              you actually read.
            </p>
            <p>
              <a href="/tweetdelete-alternative" className="font-medium text-primary hover:text-primary-hover">
                Compare Kyrelo with TweetDelete →
              </a>
            </p>
          </SectionHeader>
          <dl className="space-y-6">
            {CLEANUP_POINTS.map((p) => (
              <div key={p.title}>
                <dt className="text-base font-semibold text-fg">{p.title}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted">{p.body}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-16">
          <h3 className="text-lg font-semibold tracking-tight text-fg">Deleter &amp; Unfollow FAQ</h3>
          <div className="mt-4 divide-y divide-line border-y border-line">
            {CLEANUP_FAQ.map((f) => (
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
    body: "Each platform's screen walks you through it: sign in to X, Instagram or Facebook in a real Chrome window, paste an app password or token for most others, or approve your own developer app for YouTube and TikTok. Add a Claude or OpenAI key if you want the AI features.",
  },
  {
    n: 3,
    title: "Publish, engage, clean up",
    body: "Queue posts in the Scheduler or let an auto campaign plan them. Answer comments from the Comments inbox, watch handles in the Monitor and send the reply drafts you like. Clear out old tweets with the Deleter and dead follows with Unfollow.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="section">
      <div className={PAGE}>
        <SectionHeader eyebrow="How it works" title="Three steps. No accounts to make." />
        <ol className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="border-t border-line pt-4">
              <span className="font-mono text-sm text-muted">{String(s.n).padStart(2, "0")}</span>
              <h3 className="mt-2 text-base font-semibold text-fg">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="section">
      <div className={`${PAGE} flex flex-col gap-6 md:flex-row md:items-end md:justify-between`}>
        <div className="max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            Stop refreshing the status page.
          </h2>
          <p className="mt-3 text-base text-muted">
            Kyrelo is free, open source, and lives on your laptop. Bring your own accounts.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={RELEASES_URL} className="btn-primary" target="_blank" rel="noreferrer">
            Download for macOS
          </a>
          <a href={RELEASES_URL} className="btn-ghost" target="_blank" rel="noreferrer">
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
  const common = "h-4 w-4 shrink-0 text-muted";
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
    case "reply":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={common}>
          <path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.4A8 8 0 1 1 21 12z" />
          <path d="M9 10h6M9 14h4" />
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
