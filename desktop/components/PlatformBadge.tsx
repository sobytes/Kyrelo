import { PLATFORMS } from "@/lib/platforms";
import { PlatformId } from "@/lib/types";
import { ServiceIcon } from "./ServiceIcon";

/** The platform's mark, for account tabs, rows and posts. */
export function PlatformBadge({ platform, size = "sm" }: { platform: PlatformId; size?: "sm" | "lg" }) {
  const box = size === "lg" ? "h-10 w-10" : "h-5 w-5";
  const icon = size === "lg" ? "h-5 w-5" : "h-3 w-3";
  return (
    <span
      title={PLATFORMS[platform].label}
      className={`inline-flex shrink-0 items-center justify-center rounded-md border border-line bg-surface text-fg ${box}`}
    >
      <ServiceIcon service={platform} className={icon} />
    </span>
  );
}
