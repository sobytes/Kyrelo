"use client";
import { useState } from "react";
import { Account, ScheduledPost } from "@/lib/types";
import { PlatformBadge } from "./PlatformBadge";
import { openExternal } from "./useAccounts";

// Every account's posts on one month grid, the way most schedulers show a
// plan. Pending posts open the editor; sent ones open on their platform; an
// empty day starts a new post on that day.

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Posts shown in a day before "+N more". */
const PER_DAY = 3;

/** Local midnight of `d`. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** The six Monday-first weeks covering `month` (a date in it). */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // days since Monday
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function CalendarView({
  posts,
  accounts,
  now,
  onEdit,
  onPickDay,
}: {
  posts: ScheduledPost[];
  accounts: Account[];
  now: number;
  onEdit: (post: ScheduledPost) => void;
  /** A day with room for a new post was clicked. */
  onPickDay: (day: Date) => void;
}) {
  const [month, setMonth] = useState(() => new Date(now));
  const [openDay, setOpenDay] = useState<string | null>(null);
  const days = monthGrid(month);
  const today = dayKey(new Date(now));

  const byDay = new Map<string, ScheduledPost[]>();
  for (const p of [...posts].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))) {
    const key = dayKey(new Date(p.scheduledFor));
    byDay.set(key, [...(byDay.get(key) ?? []), p]);
  }
  const handleOf = (p: ScheduledPost) =>
    accounts.find((a) => a.platform === p.platform && a.id === p.accountId)?.handle ?? p.accountId ?? "";

  const shift = (months: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + months, 1));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-fg">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => shift(-1)} className="btn-ghost h-7 px-2 text-xs" aria-label="Previous month">
            ←
          </button>
          <button type="button" onClick={() => setMonth(new Date(now))} className="btn-ghost h-7 px-2 text-xs">
            Today
          </button>
          <button type="button" onClick={() => shift(1)} className="btn-ghost h-7 px-2 text-xs" aria-label="Next month">
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-line bg-line [gap:1px]">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-surface px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = dayKey(day);
          const items = byDay.get(key) ?? [];
          const inMonth = day.getMonth() === month.getMonth();
          const isPast = startOfDay(day).getTime() < startOfDay(new Date(now)).getTime();
          const expanded = openDay === key;
          const shown = expanded ? items : items.slice(0, PER_DAY);
          return (
            <div
              key={key}
              onClick={() => !isPast && onPickDay(day)}
              className={
                "min-h-24 space-y-1 p-1.5 text-left transition " +
                (inMonth ? "bg-surface" : "bg-canvas") +
                (isPast ? "" : " cursor-pointer hover:bg-canvas")
              }
            >
              <div
                className={
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-sm px-1 text-[11px] " +
                  (key === today ? "bg-primary font-semibold text-surface" : inMonth ? "text-fg" : "text-muted")
                }
              >
                {day.getDate()}
              </div>
              {shown.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={`@${handleOf(p)}: ${p.text}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (p.status === "pending") onEdit(p);
                    else if (p.postedUrl) openExternal(p.postedUrl);
                  }}
                  className={
                    "flex w-full items-center gap-1 rounded-sm border px-1 py-0.5 text-left text-[10px] leading-tight " +
                    (p.status === "failed"
                      ? "border-error/40 text-error"
                      : p.status === "posted"
                        ? "border-line text-muted"
                        : "border-primary/30 bg-primary/5 text-fg")
                  }
                >
                  <PlatformBadge platform={p.platform} />
                  <span className="shrink-0 font-mono">
                    {new Date(p.scheduledFor).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="truncate">{p.text}</span>
                </button>
              ))}
              {items.length > PER_DAY && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenDay(expanded ? null : key);
                  }}
                  className="text-[10px] text-muted hover:text-fg"
                >
                  {expanded ? "Show less" : `+${items.length - PER_DAY} more`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted">
        Every account&apos;s posts. Click a queued post to edit it, a sent one to open it, or a day to write a post for it.
      </p>
    </div>
  );
}
