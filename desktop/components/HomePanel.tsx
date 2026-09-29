"use client";
import Link from "next/link";
import { SERVICES } from "@/lib/services";
import { SCHEDULER_ICON, SECTIONS } from "./sections";
import { ServiceIcon } from "./ServiceIcon";
import { useAccounts } from "./useAccounts";

/** The home screen: the Scheduler, then one tile per service with its connected accounts. */
export function HomePanel() {
  const { status } = useAccounts();

  const connected = status?.accounts.length ?? 0;
  return (
    <div className="space-y-8">
      <Link
        href="/scheduler"
        className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-muted"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-fg">
          <span className="h-6 w-6">{SCHEDULER_ICON}</span>
        </span>
        <span>
          <span className="block text-base font-semibold text-fg">Scheduler</span>
          <span className="block text-xs text-muted">
            Post and run auto campaigns across all your accounts
            {status ? ` · ${connected} connected` : ""}.
          </span>
        </span>
      </Link>

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
                .join(" · ") || "Posts from the Scheduler"}
            </span>
          </Link>
        );
      })}
    </div>
    </div>
  );
}
