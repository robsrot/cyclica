/**
 * Date and time handling.
 *
 * - A LocalDate ("2026-11-15") is a calendar day as the user experienced it. Day-level records (bleeding, sleep, ...)
 *   use it, and analysis groups by it.
 * - A LocalDateTime ("2026-11-15T14:30:00+01:00") is the wall-clock time where the user was, WITH its UTC offset.
 *   The wall-clock part is what we display (an entry made at 14:30 in Tokyo stays "14:30" at home);
 *   the offset makes it an exact instant for ordering and for "hours before" calculations.
 */

export type LocalDate = string;
export type LocalDateTime = string;

export const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const LOCAL_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

const pad = (n: number) => String(n).padStart(2, '0');

export function localDateOf(d: Date): LocalDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayLocal(now = new Date()): LocalDate {
  return localDateOf(now);
}

function offsetString(d: Date): string {
  const minutes = -d.getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** The device's local wall-clock time for an instant, with the device's offset at that instant. */
export function toOffsetIso(d: Date): LocalDateTime {
  return `${localDateOf(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offsetString(d)}`;
}

export function nowOffsetIso(now = new Date()): LocalDateTime {
  return toOffsetIso(now);
}

/**
 * Converts the value of an <input type="datetime-local"> ("2026-11-15T14:30") to a LocalDateTime.
 * When editing an existing entry, pass its original value as `keepOffsetOf` so the entry keeps the offset of the
 * place where it happened, instead of being reinterpreted in the current time zone.
 */
export function fromLocalInput(value: string, keepOffsetOf?: LocalDateTime): LocalDateTime | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const wall = `${m[1]}T${m[2]}:${m[3]}:00`;
  if (keepOffsetOf) return wall + keepOffsetOf.slice(19);
  const d = new Date(wall); // parsed as device-local time
  if (Number.isNaN(d.getTime())) return null;
  return toOffsetIso(d);
}

/** For <input type="datetime-local">: the wall-clock part, minutes precision. */
export function toLocalInput(dt: LocalDateTime): string {
  return dt.slice(0, 16);
}

export function wallDate(dt: LocalDateTime): LocalDate {
  return dt.slice(0, 10);
}

export function wallTime(dt: LocalDateTime): string {
  return dt.slice(11, 16);
}

/** Milliseconds since epoch: the exact instant, comparable across time zones. */
export function instant(dt: LocalDateTime): number {
  return Date.parse(dt);
}

/** Calendar arithmetic on LocalDates, independent of time zones and daylight saving. */
export function addDays(date: LocalDate, n: number): LocalDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole calendar days from a to b (b - a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const toUtc = (s: LocalDate) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function formatDayLong(date: LocalDate): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function formatDayShort(date: LocalDate): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}
