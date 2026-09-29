// The services Kyrelo works with and the sections each one has
// (contracts/services.json, shared with the iPhone app). Sections are the
// per-account tools (Monitor, Deleter, Unfollow, Accounts); the Scheduler and
// its auto campaigns are global, since a post goes to accounts on any
// platform. The home screen, sidebar and pages are built from this list.

import registry from "../../contracts/services.json";
import { PlatformId } from "./types";

export type SectionId = "monitor" | "deleter" | "unfollow" | "accounts";

export interface ServiceSpec {
  id: PlatformId;
  /** In the URL: /x/monitor. */
  slug: string;
  label: string;
  /** In the order they appear. */
  sections: SectionId[];
}

export const SECTION_IDS = registry.sections as SectionId[];
export const SERVICES = registry.services as ServiceSpec[];

export function serviceBySlug(slug: string): ServiceSpec | undefined {
  return SERVICES.find((s) => s.slug === slug);
}
