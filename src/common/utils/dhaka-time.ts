// Bangladesh-time (Asia/Dhaka, GMT+6) helpers.
//
// IMPORTANT CONTEXT — do not "fix" this by setting TZ=Asia/Dhaka on the
// backend/notification containers instead: every timestamp column in this
// app (`orders.createdAt` etc.) is MySQL `datetime`, which has NO timezone
// awareness — it stores literal wall-clock digits with no UTC tag. Since
// nothing has ever set a container TZ, every row currently in the database
// holds UTC wall-clock digits (write and read have always used the same
// implicit UTC default, so existing data is self-consistent). Changing the
// container TZ now would make NEW rows get BD wall-clock digits written into
// the SAME undifferentiated column old UTC-wall-clock rows already use, with
// no way to tell them apart later — silent, permanent data corruption. Do
// all "show/query in BD time" work at the read/display layer instead, using
// the helpers below.
export const DHAKA_TZ = 'Asia/Dhaka';
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

// For libraries that read a JS Date's own LOCAL getters (getHours(),
// getDate(), etc.) rather than accepting an explicit timeZone option — e.g.
// ExcelJS writing a native date-typed cell. Returns a new Date whose local
// getters read as the Asia/Dhaka wall-clock time of the original instant.
// This only works because the container itself stays on UTC (local ==
// UTC here) — see the file-level comment above for why that must stay true.
export function dhakaShifted(d: Date): Date {
  return new Date(d.getTime() + DHAKA_OFFSET_MS);
}

// For producing a display STRING (not a native date-typed value) — safe to
// use regardless of container timezone, since Intl's timeZone option does
// the conversion itself rather than relying on the process's own local tz.
export function formatDhaka(
  d: Date,
  options: Intl.DateTimeFormatOptions,
  locale = 'en-GB',
): string {
  return d.toLocaleString(locale, { ...options, timeZone: DHAKA_TZ });
}

// Today's Asia/Dhaka CALENDAR date, YYYY-MM-DD — for defaulting a
// date-range filter when the caller didn't supply one, so "today" means
// Dhaka's today, not this container's (UTC) today.
export function toDhakaDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DHAKA_TZ }).format(d);
}

// SQL fragment: shifts a datetime column by +6h before extracting a
// calendar day/hour, so DATE()/HOUR() (and BETWEEN comparisons against
// Dhaka-calendar-day boundary strings) reflect the Dhaka wall-clock moment
// the row actually happened at, not the UTC-wall-clock digits literally
// stored in the column. Use as `dhakaShiftExpr('o.createdAt')` inside a
// QueryBuilder `DATE(...)`/`HOUR(...)`/`BETWEEN` expression.
export function dhakaShiftExpr(column: string): string {
  return `DATE_ADD(${column}, INTERVAL 6 HOUR)`;
}
