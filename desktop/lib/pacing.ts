// When Kyrelo browses X on its own. A logged-in account searching X around
// the clock is one of the clearest signs of a bot, so background checks pause
// overnight (the computer's local time), like a person asleep. Anything the
// user starts (Check now, a scheduled post) runs whenever they ask.

/** Background X browsing pauses from 1:00 to 6:59, local time. */
const QUIET_FROM = 1;
const QUIET_UNTIL = 7;

export function isQuietHours(now = new Date()): boolean {
  const hour = now.getHours();
  return hour >= QUIET_FROM && hour < QUIET_UNTIL;
}
