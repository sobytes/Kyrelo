import Image from "next/image";

export const GITHUB_URL = "https://github.com/sobytes/Kyrelo";
export const RELEASES_URL = `${GITHUB_URL}/releases`;

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/60 bg-ink/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <a href="/" className="flex items-center gap-2">
          <Image src="/icon.png" alt="Kyrelo" width={28} height={28} className="rounded-md" />
          <span className="text-sm font-semibold tracking-tight">Kyrelo</span>
        </a>
        <nav className="hidden items-center gap-6 text-sm text-zinc-400 sm:flex">
          <a href="/#features" className="hover:text-zinc-100">Features</a>
          <a href="/#delete-tweets" className="hover:text-zinc-100">Delete tweets</a>
          <a href="/#how" className="hover:text-zinc-100">How it works</a>
          <a href={GITHUB_URL} className="hover:text-zinc-100" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <a href="/#download" className="btn-primary text-xs">
          Download
        </a>
      </div>
    </header>
  );
}

export function Footer() {
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
          <a href="/tweetdelete-alternative" className="hover:text-zinc-300">
            TweetDelete alternative
          </a>
        </div>
      </div>
    </footer>
  );
}
