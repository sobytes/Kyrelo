import { notFound } from "next/navigation";
import { SectionPage } from "@/components/sections";
import { SectionId, serviceBySlug } from "@/lib/services";

// /x/scheduler, /bluesky/accounts, …: one page for every service's sections,
// built from lib/services.ts. Sections a service doesn't have are a 404.
export default async function ServiceSectionPage({ params }: { params: Promise<{ service: string; section: string }> }) {
  const { service: slug, section } = await params;
  const service = serviceBySlug(slug);
  if (!service || !service.sections.includes(section as SectionId)) notFound();
  return <SectionPage service={service} section={section as SectionId} />;
}
