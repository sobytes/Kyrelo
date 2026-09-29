"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import pkg from "@/package.json";
import { SERVICES, serviceBySlug } from "@/lib/services";
import { SECTIONS, SETTINGS_ICON } from "./sections";
import { ServiceIcon } from "./ServiceIcon";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
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
 * services; inside one, that service's sections (lib/services.ts). Settings
 * are global, so they're always there.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const service = serviceBySlug(pathname.split("/")[1] ?? "");

  const items: NavItem[] = service
    ? service.sections.map((s) => ({ href: `/${service.slug}/${s}`, label: SECTIONS[s].label, icon: SECTIONS[s].icon }))
    : [
        { href: "/", label: "All services", icon: ALL_SERVICES_ICON },
        ...SERVICES.map((s) => ({
          href: `/${s.slug}`,
          label: s.label,
          icon: <ServiceIcon service={s.id} className="h-4 w-4" />,
        })),
      ];

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-line bg-canvas">
        <Link href="/" className="window-drag flex items-center gap-2.5 border-b border-line px-5 pb-4 pt-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="" className="h-7 w-7 rounded-md" />
          <span className="text-sm font-semibold tracking-tight text-fg">Kyrelo</span>
        </Link>

        <nav className="flex-1 space-y-0.5 p-2">
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
        </nav>

        <div className="border-t border-line p-2">
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
      <span>{item.label}</span>
    </Link>
  );
}
