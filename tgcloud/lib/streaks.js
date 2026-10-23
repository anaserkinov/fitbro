import { db } from 'sdk';
import { eq, and, isNotNull, gte } from 'sdk/db';
import * as T from '../schema.js';
import { addDays, weekStart } from './dates.js';

// The weekly-goal streak (leaderboards, achievements). Its own module so workouts.js
// can use it without importing stats.js, which imports workouts.js.

const W = T.workouts;

// Weeks in a row with at least `workouts_per_week` finished workouts, counting back
// from the last full week; the current week counts once its goal is already met.
// `dates` = local dates of finished workouts (pass them in to batch over many users).
export function goalStreakFrom(dates, { goal, weekStartsOn = 1, date }) {
  if (!goal) return 0;
  const perWeek = new Map();
  for (const d of dates) {
    const w = weekStart(d, weekStartsOn);
    perWeek.set(w, (perWeek.get(w) || 0) + 1);
  }
  let week = weekStart(date, weekStartsOn);
  let n = 0;
  if ((perWeek.get(week) || 0) >= goal) n++;
  week = addDays(week, -7);
  while ((perWeek.get(week) || 0) >= goal) { n++; week = addDays(week, -7); }
  return n;
}

export async function goalStreak(user, date) {
  const rows = await db.select({ d: W.localDate }).from(W)
    .where(and(eq(W.userId, user.id), isNotNull(W.endedAt), gte(W.localDate, addDays(date, -400)))).all();
  return goalStreakFrom(rows.map((r) => r.d), { goal: user.workoutsPerWeek, weekStartsOn: user.weekStartsOn, date });
}

