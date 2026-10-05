"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import pkg from "@/package.json";
import { ServiceSpec, SERVICES, serviceBySlug } from "@/lib/services";
import { Account, PlatformId } from "@/lib/types";
import { COMMENTS_ICON, MEDIA_ICON, SCHEDULER_ICON, SECTIONS, SETTINGS_ICON } from "./sections";
import { ServiceIcon } from "./ServiceIcon";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Connected accounts on this service: a dot, and the number when more than one. */
  connected?: number;
}

/** Connected accounts per platform, refreshed on every page change and every 30 s. */
function useConnectedCounts(pathname: string): Partial<Record<PlatformId, number>> | null {
  const [counts, setCounts] = useState<Partial<Record<PlatformId, number>> | null>(null);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const r = (await fetch("/api/accounts").then((res) => res.json()).catch(() => null)) as { accounts?: Account[] } | null;
      if (!live || !r?.accounts) return;
      const next: Partial<Record<PlatformId, number>> = {};
      for (const a of r.accounts) next[a.platform] = (next[a.platform] ?? 0) + 1;
      setCounts(next);
    };
    void load();
    const timer = setInterval(load, 30_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [pathname]);
  return counts;
}

const ALL_SERVICES_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

/**
 * The sidebar follows where you are: on the home screen it lists the
 * services; inside one, that service's sections (lib/services.ts). The
 * Scheduler and Settings cover every service, so they're always there.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const service = serviceBySlug(pathname.split("/")[1] ?? "");
  const counts = useConnectedCounts(pathname);
  const serviceItem = (s: ServiceSpec): NavItem => ({
    href: `/${s.slug}`,
    label: s.label,
    icon: <ServiceIcon service={s.id} className="h-4 w-4" />,
    connected: counts?.[s.id],
  });
  // On the home screen: the services in use, then the rest folded away under
  // "Add a service" (until accounts have loaded, nothing is folded).
  const connected = SERVICES.filter((s) => !counts || counts[s.id]);
  const unused = counts ? SERVICES.filter((s) => !counts[s.id]) : [];

  const items: NavItem[] = service
    ? service.sections.map((s) => ({ href: `/${service.slug}/${s}`, label: SECTIONS[s].label, icon: SECTIONS[s].icon }))
    : [{ href: "/", label: "All services", icon: ALL_SERVICES_ICON }, ...connected.map(serviceItem)];

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-line bg-canvas">
        <Link href="/" className="window-drag flex items-center gap-2.5 border-b border-line px-5 pb-4 pt-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="" className="h-7 w-7 rounded-md" />
          <span className="text-sm font-semibold tracking-tight text-fg">Kyrelo</span>
        </Link>

        {/* Scrolls on its own when the services don't fit, keeping Settings in view. */}
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          <NavLink item={{ href: "/scheduler", label: "Scheduler", icon: SCHEDULER_ICON }} active={pathname === "/scheduler"} />
          <NavLink item={{ href: "/comments", label: "Comments", icon: COMMENTS_ICON }} active={pathname === "/comments"} />
          <NavLink item={{ href: "/media", label: "Media", icon: MEDIA_ICON }} active={pathname === "/media"} />
          <div className="my-2 border-t border-line" />
          {service && (
            <>
              <Link href="/" className="flex items-center gap-2 px-3 py-2 text-xs text-muted hover:text-fg">
                ← All services
              </Link>
              <div className="flex items-center gap-2 px-3 pb-2 pt-1 text-sm font-semibold text-fg">
                <ServiceIcon service={service.id} className="h-4 w-4" />
                {service.label}
              </div>
            </>
          )}
          {items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/")}
            />
          ))}
          {!service && unused.length > 0 && <AddService services={unused} openAtFirst={connected.length === 0} />}
        </nav>

        <div className="space-y-0.5 border-t border-line p-2">
          <NavLink item={{ href: "/settings", label: "Settings", icon: SETTINGS_ICON }} active={pathname === "/settings"} />
          <div className="px-3 pt-2 font-mono text-[11px] text-muted">v{pkg.version}</div>
        </div>
      </aside>

      <main className="ml-56 flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={
        "flex items-center gap-3 rounded border px-3 py-2 text-sm transition-colors " +
        (active ? "border-line bg-surface font-medium text-fg" : "border-transparent text-muted hover:text-fg")
      }
    >
      <span className="h-4 w-4 shrink-0">{item.icon}</span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.connected ? (
        <span className="flex items-center gap-1 font-mono text-[10px] text-muted" title={`${item.connected} connected`}>
          {item.connected > 1 && item.connected}
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Services with nothing connected, folded under one row so the sidebar shows
 * what's in use. Each opens straight on its connect screen. Open or closed is
 * remembered on this computer.
 */
function AddService({ services, openAtFirst }: { services: ServiceSpec[]; openAtFirst: boolean }) {
  const [open, setOpen] = useState(openAtFirst);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("kyrelo.addServiceOpen");
      if (saved !== null) setOpen(saved === "1");
    } catch {
      // storage unavailable: keep the default
    }
  }, []);
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem("kyrelo.addServiceOpen", open ? "0" : "1");
    } catch {
      // not remembered, that's all
    }
  };
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3 rounded border border-dashed border-line px-3 py-2 text-sm text-muted transition-colors hover:border-muted hover:text-fg"
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-base leading-none">+</span>
        <span className="flex-1 text-left">Add a service</span>
        <span className="font-mono text-[10px]">{open ? "▴" : services.length}</span>
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {services.map((s) => (
            <Link
              key={s.id}
              href={`/${s.slug}/accounts`}
              className="flex items-center gap-3 rounded px-3 py-1.5 text-[13px] text-muted opacity-80 transition hover:text-fg hover:opacity-100"
            >
              <ServiceIcon service={s.id} className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 truncate">{s.label}</span>
              <span className="text-[10px]">Connect</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
