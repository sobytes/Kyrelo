import Image from "next/image";

export const SITE_URL = "https://kyrelo.com";
export const GITHUB_URL = "https://github.com/sobytes/Kyrelo";
export const RELEASES_URL = `${GITHUB_URL}/releases`;

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-canvas">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <a href="/" className="flex items-center gap-2">
          <Image src="/icon.png" alt="Kyrelo" width={24} height={24} className="rounded" />
          <span className="text-sm font-semibold tracking-tight text-fg">Kyrelo</span>
        </a>
        <nav className="hidden items-center gap-6 text-sm text-muted sm:flex">
          <a href="/#features" className="hover:text-fg">Features</a>
          <a href="/#delete-tweets" className="hover:text-fg">Clean up</a>
          <a href="/#how" className="hover:text-fg">How it works</a>
          <a href={GITHUB_URL} className="hover:text-fg" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <a href="/#download" className="btn-primary h-8 px-3">
          Download
        </a>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 text-xs text-muted sm:flex-row">
        <div className="flex items-center gap-2">
          <Image src="/icon.png" alt="" width={20} height={20} className="rounded" />
          <span>Kyrelo · open source, MIT licensed</span>
        </div>
        <div className="flex items-center gap-5">
          <a href={GITHUB_URL} className="hover:text-fg" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={RELEASES_URL} className="hover:text-fg" target="_blank" rel="noreferrer">
            Releases
          </a>
          <a href="/tweetdelete-alternative" className="hover:text-fg">
            TweetDelete alternative
          </a>
        </div>
      </div>
      <p className="mx-auto mt-6 max-w-5xl px-6 text-[11px] leading-relaxed text-muted">
        Kyrelo is an independent, open-source experiment, provided as is under the MIT license. It
        isn&apos;t affiliated with, endorsed by or sponsored by X Corp., Bluesky, Buffer,
        TweetDelete, Anthropic or OpenAI; their names are used only to describe what Kyrelo works
        with or compares to, and remain their owners&apos; trademarks. You&apos;re responsible for
        how you use it, including following each platform&apos;s terms and automation rules.
      </p>
    </footer>
  );
}
