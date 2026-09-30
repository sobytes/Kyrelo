import icons from "../../contracts/service-icons.json";
import { PlatformId } from "@/lib/types";

// Simple line/solid marks for each service, in the current text colour, so
// they sit in the design system rather than bringing each brand's colours.
// The shapes are in contracts/service-icons.json, which the iPhone app's
// icons are generated from (scripts/generate-service-icons.mjs).
const ICONS: Record<PlatformId, string> = icons.icons;

export function ServiceIcon({ service, className = "h-5 w-5" }: { service: PlatformId; className?: string }) {
  // Our own static markup from the contracts file, never user input.
  return <svg viewBox={icons.viewBox} className={className} aria-hidden dangerouslySetInnerHTML={{ __html: ICONS[service] }} />;
}
