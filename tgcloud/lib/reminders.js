import { db } from 'sdk';
import { eq, and, asc } from 'sdk/db';
import { atOrBefore } from './db-util.js';
import * as T from '../schema.js';
import { localDate, addDays, weekday, zonedToUtc } from './dates.js';
import * as v from './validate.js';

// Reminder rows carry a precomputed next_run_at (UTC). An external scheduler calls an
// endpoint every minute → dueReminders() → send → markSent(), which schedules the next one.

const R = T.reminders;

export const DEFAULT_REMINDERS = [
  { type: 'meal',           enabled: true,  times: ['12:30', '19:30'] },
  { type: 'weigh_in',       enabled: true,  times: ['07:30'] },
  { type: 'workout_day',    enabled: true,  times: ['17:00'] },
  { type: 'missed_muscle',  enabled: false, times: ['18:00'], params: { days: 7 } },
  { type: 'weekly_summary', enabled: true,  times: ['20:00'], weekdays: [7] },
];

// Next instant after `from` matching the reminder's local times and weekdays.
export function nextRunAt(reminder, tz, from = new Date()) {
  if (!reminder.enabled || !reminder.times || !reminder.times.length) return null;
  const times = [...reminder.times].sort();
  const start = localDate(tz, from);
  for (let i = 0; i < 8; i++) {
    const d = addDays(start, i);
    if (reminder.weekdays && reminder.weekdays.length && !reminder.weekdays.includes(weekday(d))) continue;
    for (const t of times) {
      const at = zonedToUtc(d, t, tz);
      if (at > from) return at;
    }
  }
  return null;
}

export async function ensureDefaultReminders(user) {
  const existing = await db.select({ type: R.type }).from(R).where(eq(R.userId, user.id)).all();
  const have = new Set(existing.map((r) => r.type));
  const missing = DEFAULT_REMINDERS.filter((r) => !have.has(r.type)).map((r) => ({
    userId: user.id,
    type: r.type,
    enabled: r.enabled,
    times: r.times,
    weekdays: r.weekdays ?? null,
    params: r.params ?? null,
    nextRunAt: nextRunAt(r, user.timezone),
  }));
  if (missing.length) await db.insert(R).values(missing).run();
}

export async function listReminders(userId) {
  return db.select().from(R).where(eq(R.userId, userId)).all();
}

const SPEC = {
  enabled:  (x, k) => v.bool(x, k),
  times:    (x, k) => v.list(x, k, (t, kk) => v.time(t, kk), { max: 6 }),
  weekdays: (x, k) => v.list(x, k, (d, kk) => v.num(d, kk, { min: 1, max: 7, int: true }), { max: 7, optional: true }),
  params:   (x, k) => {
    if (x === null) return null;
    if (typeof x !== 'object' || Array.isArray(x)) v.invalid('params must be an object', k);
    return { days: v.num(x.days, `${k}.days`, { min: 2, max: 30, int: true }) };
  },
};

export async function updateReminder(user, type, input) {
  v.oneOf(type, 'reminderType', 'type');
  const p = v.patch(input, SPEC);
  const current = await db.select().from(R).where(and(eq(R.userId, user.id), eq(R.type, type))).get();
  if (!current) v.notFound('Reminder');
  const next = { ...current, ...p };
  await db.update(R).set({ ...p, nextRunAt: nextRunAt(next, user.timezone) }).where(eq(R.id, current.id)).run();
  return { ...next, nextRunAt: nextRunAt(next, user.timezone) };
}

// After a timezone change every reminder moves.
export async function rescheduleAll(user) {
  for (const r of await listReminders(user.id)) {
    await db.update(R).set({ nextRunAt: nextRunAt(r, user.timezone) }).where(eq(R.id, r.id)).run();
  }
}

export async function dueReminders(now = new Date(), limit = 100) {
  return db.select().from(R)
    .where(and(eq(R.enabled, true), atOrBefore(R.nextRunAt, now)))
    .orderBy(asc(R.nextRunAt))
    .limit(limit)
    .all();
}

export async function markSent(reminder, user, now = new Date()) {
  await db.update(R)
    .set({ lastSentAt: now, nextRunAt: nextRunAt(reminder, user.timezone, now) })
    .where(eq(R.id, reminder.id))
    .run();
}
