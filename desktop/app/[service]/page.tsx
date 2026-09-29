import { notFound, redirect } from "next/navigation";
import { serviceBySlug } from "@/lib/services";

/** A service's first section. */
export default async function ServicePage({ params }: { params: Promise<{ service: string }> }) {
  const service = serviceBySlug((await params).service);
  if (!service) notFound();
  redirect(`/${service.slug}/${service.sections[0]}`);
}
