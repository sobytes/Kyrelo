"use client";
import Link from "next/link";
import { SERVICES } from "@/lib/services";
import { SECTIONS } from "./sections";
import { ServiceIcon } from "./ServiceIcon";
import { useAccounts } from "./useAccounts";

/** The home screen: one tile per service, with its connected accounts. */
export function HomePanel() {
  const { status } = useAccounts();

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {SERVICES.map((service) => {
        const accounts = status?.accounts.filter((a) => a.platform === service.id) ?? [];
        return (
          <Link
            key={service.id}
            href={`/${service.slug}`}
            className="group flex flex-col rounded-lg border border-line bg-surface p-4 transition-colors hover:border-muted"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-md border border-line bg-canvas text-fg">
              <ServiceIcon service={service.id} className="h-6 w-6" />
            </span>
            <span className="mt-4 text-base font-semibold text-fg">{service.label}</span>
            <span className="mt-1 font-mono text-[11px] text-muted">
              {!status
                ? "…"
                : accounts.length === 0
                  ? "Not connected"
                  : accounts.length === 1
                    ? `@${accounts[0].handle}`
                    : `${accounts.length} accounts`}
            </span>
            <span className="mt-3 text-xs leading-relaxed text-muted">
              {service.sections
                .filter((s) => s !== "accounts")
                .map((s) => SECTIONS[s].label)
                .join(" · ")}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
