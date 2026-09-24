import Image from "next/image";

const GITHUB_URL =
  "https://github.com/sobytes/Kyrelo-Buffer-Alternative";
const RELEASES_URL = `${GITHUB_URL}/releases`;

export default function Home() {
  return (
    <main className="relative">
      <Nav />
      <Hero />
      <Why />
      <Features />
      <HowItWorks />
      <CTA />
      <Footer />
    </main>
  );
}

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/60 bg-ink/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <a href="#" className="flex items-center gap-2">
          <Image src="/icon.png" alt="Kyrelo" width={28} height={28} className="rounded-md" />
          <span className="text-sm font-semibold tracking-tight">Kyrelo</span>
        </a>
        <nav className="hidden items-center gap-6 text-sm text-zinc-400 sm:flex">
          <a href="#features" className="hover:text-zinc-100">Features</a>
          <a href="#how" className="hover:text-zinc-100">How it works</a>
          <a href={GITHUB_URL} className="hover:text-zinc-100" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <a href="#download" className="btn-primary text-xs">
          Download
        </a>
      </div>
    </header>
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
          watch handles for new tweets, and reply with AI-generated questions — all running on
          your machine, with the only network calls going to X and your AI provider.
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
    title: "Schedule, monitor, reply",
    body: "Use the Scheduler timeline to queue posts at specific times. Add handles in the Monitor to get notified on new activity. Generate AI replies on demand.",
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

function Footer() {
  return (
    <footer className="border-t border-line py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-xs text-zinc-500 sm:flex-row">
        <div className="flex items-center gap-2">
          <Image src="/icon.png" alt="" width={20} height={20} className="rounded" />
          <span>Kyrelo · open source, MIT licensed</span>
        </div>
        <div className="flex items-center gap-5">
          <a href={GITHUB_URL} className="hover:text-zinc-300" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={RELEASES_URL} className="hover:text-zinc-300" target="_blank" rel="noreferrer">
            Releases
          </a>
        </div>
      </div>
    </footer>
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
    default:
      return null;
  }
}
