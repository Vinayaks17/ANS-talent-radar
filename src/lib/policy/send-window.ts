/**
 * Deterministic send-window arithmetic in the candidate's time zone.
 * No AI, no libraries: Intl only, so it runs anywhere.
 */

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function fmt(tz: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try { fmt(tz); return true; } catch { return false; }
}

/** Wall-clock parts of `date` in `tz`. */
export function partsIn(date: Date, tz: string): Parts {
  const p = Object.fromEntries(fmt(tz).formatToParts(date).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, weekday: WD[p.weekday] ?? 0 };
}

/** UTC instant for a wall-clock time in `tz` (handles DST by two-pass offset). */
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const offset = (t: number) => {
    const p = partsIn(new Date(t), tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t;
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return new Date(t);
}

export type Window = { days: number[]; start: string; end: string }; // "09:00"

function hm(s: string) { const [h, m] = s.split(":").map(Number); return { h, m }; }

/**
 * Earliest instant >= `after` that falls inside the window in `tz`.
 * If `after` is already inside the window, returns `after`.
 */
export function nextSendSlot(after: Date, tz: string, w: Window): Date {
  const start = hm(w.start), end = hm(w.end);
  for (let i = 0; i < 14; i++) {
    const probe = new Date(after.getTime() + i * 86400000);
    const p = partsIn(probe, tz);
    if (!w.days.includes(p.weekday)) continue;
    const dayStart = zonedToUtc(p.year, p.month, p.day, start.h, start.m, tz);
    const dayEnd = zonedToUtc(p.year, p.month, p.day, end.h, end.m, tz);
    if (i === 0 && after >= dayStart && after < dayEnd) return after;
    if (dayStart > after) return dayStart;
  }
  return after; // window never matches (misconfigured) — send now rather than never
}

/** Spread a send `minutes` into the day so batches don't fire at exactly 09:00. */
export function jitter(date: Date, maxMinutes: number, seed: number) {
  const m = Math.abs(seed) % (maxMinutes + 1);
  return new Date(date.getTime() + m * 60000);
}
