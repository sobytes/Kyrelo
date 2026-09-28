import { PLATFORMS } from "@/lib/platforms";
import { PlatformId } from "@/lib/types";

const MARKS: Record<PlatformId, string> = { twitter: "𝕏", bluesky: "🦋", linkedin: "in" };

/** The platform's mark, for account tabs, rows and posts. */
export function PlatformBadge({ platform, size = "sm" }: { platform: PlatformId; size?: "sm" | "lg" }) {
  const box = size === "lg" ? "h-10 w-10 text-lg" : "h-5 w-5 text-[11px]";
  return (
    <span
      title={PLATFORMS[platform].label}
      className={`inline-flex shrink-0 items-center justify-center rounded-md bg-black/40 font-bold text-zinc-100 ${box}`}
    >
      {MARKS[platform]}
    </span>
  );
}
