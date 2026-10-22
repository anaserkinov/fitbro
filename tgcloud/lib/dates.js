// Calendar helpers. A "local date" is 'YYYY-MM-DD' in the user's timezone; plain
// date strings are handled as UTC midnights so arithmetic never shifts with DST.

const DAY_MS = 86400000;
const fmtCache = new Map();

function formatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

// Wall-clock parts of `at` in `tz`. Unknown zones fall back to UTC.
export function zonedParts(tz, at = new Date()) {
  let parts;
  try {
    parts = formatter(tz || 'UTC').formatToParts(at);
  } catch {
    parts = formatter('UTC').formatToParts(at);
  }
  const p = {};
  for (const { type, value } of parts) if (type !== 'literal') p[type] = Number(value);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second };
}

const pad = (n) => String(n).padStart(2, '0');

export function localDate(tz, at = new Date()) {
  const p = zonedParts(tz, at);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function localTime(tz, at = new Date()) {
  const p = zonedParts(tz, at);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

function toUtcMs(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(dateStr, n) {
  return fromUtcMs(toUtcMs(dateStr) + n * DAY_MS);
}

export function daysBetween(from, to) {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

// 1 = Monday … 7 = Sunday
export function weekday(dateStr) {
  const d = new Date(toUtcMs(dateStr)).getUTCDay();
  return d === 0 ? 7 : d;
}

// First day of the week containing dateStr, for a week starting on `startsOn` (1–7).
export function weekStart(dateStr, startsOn = 1) {
  const back = (weekday(dateStr) - startsOn + 7) % 7;
  return addDays(dateStr, -back);
}

export function monthStart(dateStr) {
  return dateStr.slice(0, 8) + '01';
}

export function monthEnd(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return fromUtcMs(Date.UTC(y, m, 0));
}

// Inclusive list of dates.
export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// Offset of `tz` from UTC at instant `ms`, in ms (positive east of Greenwich).
function tzOffsetMs(tz, ms) {
  const p = zonedParts(tz, new Date(ms));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// The instant when the wall clock in `tz` shows dateStr + 'HH:MM'. A time skipped by
// a DST jump resolves to just after the jump.
export function zonedToUtc(dateStr, hhmm, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  const a = wall - tzOffsetMs(tz, wall);
  const b = wall - tzOffsetMs(tz, a);
  if (a === b) return new Date(a);
  // Offsets differ around a DST change: keep the candidate that really shows hhmm
  // (the earlier one if both do); neither does inside a skipped hour, so take the later.
  const [early, late] = a < b ? [a, b] : [b, a];
  if (localTime(tz, new Date(early)) === hhmm) return new Date(early);
  return new Date(late);
}

// Is local time `hhmm` inside the [start, end) window? Windows may cross midnight.
export function inWindow(hhmm, start, end) {
  if (start === end) return false;
  return start < end ? hhmm >= start && hhmm < end : hhmm >= start || hhmm < end;
}

export function ageOn(birthDate, onDate) {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = onDate.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
