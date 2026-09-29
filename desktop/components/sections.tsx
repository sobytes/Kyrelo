"use client";
import { SectionId, ServiceSpec } from "@/lib/services";
import { AccountsPanel } from "./ConnectedPanel";
import { DeleterPanel } from "./DeleterPanel";
import { DetectorPanel } from "./DetectorPanel";
import { SchedulerPanel } from "./SchedulerPanel";
import { UnfollowPanel } from "./UnfollowPanel";

// The sections a service can have (lib/services.ts says which each one has).
// Each is one self-contained component; the page header, the sidebar and the
// route all come from here, so a section is added in one place.

interface SectionSpec {
  label: string;
  /** The page's intro, for this service. */
  describe: (service: ServiceSpec) => string;
  icon: React.ReactNode;
  /** Draws its own header and needs the full width (the Monitor's feed). */
  fullWidth?: boolean;
  render: (service: ServiceSpec) => React.ReactNode;
}

const icon = (paths: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
);

export const SECTIONS: Record<SectionId, SectionSpec> = {
  monitor: {
    label: "Monitor",
    describe: (s) => `Watch ${s.label} accounts and keywords, with reply drafts under new posts.`,
    icon: icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v9l6 4" />
      </>,
    ),
    fullWidth: true,
    render: () => <DetectorPanel />,
  },
  scheduler: {
    label: "Scheduler",
    describe: (s) => `Queue posts to your ${s.label} accounts at a specific time, and to your other accounts too.`,
    icon: icon(
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>,
    ),
    render: (s) => <SchedulerPanel service={s} />,
  },
  deleter: {
    label: "Deleter",
    describe: (s) => `Bulk-delete posts and replies, or unlike likes, from a connected ${s.label} account. Keep your newest and remove the rest.`,
    icon: icon(
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
      </>,
    ),
    render: () => <DeleterPanel />,
  },
  unfollow: {
    label: "Unfollow",
    describe: (s) =>
      `Clean up who a ${s.label} account follows: dead accounts, people who never interact, bots. You review every suggestion before anything is unfollowed.`,
    icon: icon(
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21a7 7 0 0 1 14 0" />
        <path d="M17 11h5" />
      </>,
    ),
    render: () => <UnfollowPanel />,
  },
  accounts: {
    label: "Accounts",
    describe: (s) => `The ${s.label} accounts Kyrelo posts to, and how to add one.`,
    icon: icon(
      <>
        <path d="M10 14a5 5 0 0 1 0-7l3-3a5 5 0 0 1 7 7l-1.5 1.5" />
        <path d="M14 10a5 5 0 0 1 0 7l-3 3a5 5 0 0 1-7-7l1.5-1.5" />
      </>,
    ),
    render: (s) => <AccountsPanel platform={s.id} />,
  },
};

export const SETTINGS_ICON = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>,
);

/** A section's page: its header (unless it draws its own) and the section. */
export function SectionPage({ service, section }: { service: ServiceSpec; section: SectionId }) {
  const spec = SECTIONS[section];
  if (spec.fullWidth) {
    return <main className="mx-auto max-w-7xl px-6 pb-6 pt-10">{spec.render(service)}</main>;
  }
  return (
    <main className="mx-auto max-w-3xl px-6 pb-6 pt-10">
      <h1 className="text-xl font-semibold tracking-tight text-fg">{spec.label}</h1>
      <p className="mt-1 text-sm text-muted">{spec.describe(service)}</p>
      <div className="mt-6">{spec.render(service)}</div>
    </main>
  );
}
