// The services Kyrelo works with and which sections each one has
// (contracts/services.json, shared with the iPhone app). The home screen,
// the sidebar and the section pages are all built from this list; adding a
// service or a section to one is a change here, not a new screen.

import registry from "../../contracts/services.json";
import { PlatformId } from "./types";

export type SectionId = "monitor" | "scheduler" | "deleter" | "unfollow" | "accounts";
/** Optional parts of a section: campaigns are part of X's Scheduler. */
export type FeatureId = "campaigns";

export interface ServiceSpec {
  id: PlatformId;
  /** In the URL: /x/scheduler. */
  slug: string;
  label: string;
  /** In the order they appear. */
  sections: SectionId[];
  features: FeatureId[];
}

export const SECTION_IDS = registry.sections as SectionId[];
export const SERVICES = registry.services as ServiceSpec[];

export function serviceBySlug(slug: string): ServiceSpec | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

export function serviceFor(platform: PlatformId): ServiceSpec {
  const service = SERVICES.find((s) => s.id === platform);
  if (!service) throw new Error(`No service for ${platform}`);
  return service;
}

export function hasFeature(service: ServiceSpec, feature: FeatureId): boolean {
  return service.features.includes(feature);
}
