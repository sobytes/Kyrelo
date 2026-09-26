// Spreads N posts across a time window so they read like a person posting,
// not a bot on a fixed interval: one post per equal slot, each at a random
// point inside its slot, a minimum gap between neighbours, and random seconds
// so nothing lands on a round minute.

export interface SpreadOptions {
  /** Window start (ms since epoch). Default: now. */
  start?: number;
  /** Random source, injectable for tests. */
  random?: () => number;
}

const MINUTE = 60_000;

export function spreadTimes(count: number, windowMinutes: number, opts: SpreadOptions = {}): Date[] {
  if (count < 1) return [];
  const random = opts.random ?? Math.random;
  const windowMs = Math.max(windowMinutes, 1) * MINUTE;

  // Don't fire the first post the moment the user clicks Go — give it a
  // 2–5 minute lead-in (capped so tiny windows still fit).
  const leadIn = Math.min((2 + random() * 3) * MINUTE, windowMs * 0.1);
  const start = (opts.start ?? Date.now()) + leadIn;
  const usable = windowMs - leadIn;

  const slot = usable / count;
  // Keep each post away from its slot edges so neighbours are never closer
  // than ~40% of a slot (e.g. ~6 min for 4 posts in an hour).
  const margin = slot * 0.2;

  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    const slotStart = start + i * slot;
    const t = slotStart + margin + random() * (slot - 2 * margin);
    times.push(Math.round(t));
  }
  return times.map((t) => new Date(t));
}
