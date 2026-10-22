import { db } from 'sdk';
import { eq, and, isNotNull, gte, lte, sql } from 'sdk/db';
import * as T from '../schema.js';
import * as v from './validate.js';
import { today } from './users.js';
import { addDays, weekStart, monthStart, monthEnd } from './dates.js';
import { round } from './units.js';
import { sumNutrients } from './nutrition.js';
import { dayLogs, waterTotal, targetsOf, dailyKcal } from './food.js';
import { weightSummary } from './body.js';
import { routineForDate } from './routines.js';
import { getActiveWorkout } from './workouts.js';
import { prHighlights } from './prs.js';

const W = T.workouts;
const TRACKED_MUSCLES = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];

async function finishedWorkouts(userId, from, to) {
  return db.select().from(W)
    .where(and(eq(W.userId, userId), isNotNull(W.endedAt), gte(W.localDate, from), lte(W.localDate, to)))
    .all();
}

// Consecutive days with anything logged (food, a finished workout or a weigh-in),
// ending today — or yesterday, so the streak doesn't look broken before you log.
export async function loggingStreak(userId, date) {
  const since = addDays(date, -400);
  const rows = await db.all(sql`
    SELECT local_date AS d FROM food_logs WHERE user_id = ${userId} AND local_date >= ${since}
    UNION SELECT local_date FROM workouts WHERE user_id = ${userId} AND ended_at IS NOT NULL AND local_date >= ${since}
    UNION SELECT local_date FROM body_weights WHERE user_id = ${userId} AND local_date >= ${since}`);
  const days = new Set(rows.map((r) => r.d));
  let d = days.has(date) ? date : addDays(date, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export async function weekStats(user, date) {
  const from = weekStart(date, user.weekStartsOn);
  const to = addDays(from, 6);
  const workouts = await finishedWorkouts(user.id, from, to);
  const kcalDays = (await dailyKcal(user.id, from, date < to ? date : to)).filter((d) => d.kcal > 0);
  return {
    from, to,
    workouts: workouts.length,
    target: user.workoutsPerWeek,
    volumeKg: round(workouts.reduce((a, w) => a + (w.totalVolumeKg || 0), 0), 0),
    avgKcal: kcalDays.length ? Math.round(kcalDays.reduce((a, d) => a + d.kcal, 0) / kcalDays.length) : null,
  };
}

// Everything the Home screen shows, in one call.
export async function getToday(user, input = {}) {
  const date = v.date(input.date, 'date', { optional: true }) ?? today(user);
  const eaten = sumNutrients(await dayLogs(user.id, date));
  const burned = await db.get(sql`
    SELECT coalesce(sum(s.kcal), 0) AS kcal FROM sets s JOIN workouts w ON w.id = s.workout_id
    WHERE s.user_id = ${user.id} AND w.local_date = ${date} AND s.completed = 1`);
  const weight = await weightSummary(user, 14);
  const plan = await routineForDate(user, date);
  const doneToday = (await finishedWorkouts(user.id, date, date));
  const active = await getActiveWorkout(user.id);
  const targets = targetsOf(user);

  return {
    date,
    targets,
    eaten,
    burnedKcal: Number(burned ? burned.kcal : 0),
    remainingKcal: targets.kcal ? Math.round(targets.kcal - eaten.kcal) : null,
    water: { totalMl: await waterTotal(user.id, date), targetMl: user.waterTargetMl },
    weight: { latest: weight.latest, weekChangeKg: weight.weekChangeKg, sparkline: weight.series.slice(-8) },
    plan: plan ? {
      routineId: plan.id, name: plan.name, muscles: plan.muscles,
      exerciseCount: plan.exerciseCount, setCount: plan.setCount, estMinutes: plan.estMinutes,
      done: doneToday.some((w) => w.routineId === plan.id),
    } : null,
    workoutsToday: doneToday.map((w) => ({ id: w.id, name: w.name, durationSec: w.durationSec, totalVolumeKg: w.totalVolumeKg })),
    activeWorkout: active ? { id: active.id, name: active.name, startedAt: active.startedAt, restEndsAt: active.restEndsAt } : null,
    week: await weekStats(user, date),
    streakDays: await loggingStreak(user.id, date),
  };
}

// History calendar: workouts per day of a month, with PRs and month stats.
export async function getConsistency(user, input = {}) {
  const t = today(user);
  const month = input.month === undefined ? t.slice(0, 7) : input.month;
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) v.invalid('month must be YYYY-MM', 'month');
  const from = monthStart(`${month}-01`);
  const to = monthEnd(from);
  const workouts = (await finishedWorkouts(user.id, from, to)).sort((a, b) => a.startedAt - b.startedAt);
  const prs = await prHighlights(user.id, { from, to });

  const byDate = new Map();
  for (const w of workouts) {
    if (!byDate.has(w.localDate)) byDate.set(w.localDate, []);
    byDate.get(w.localDate).push({
      id: w.id, name: w.name, durationSec: w.durationSec, totalVolumeKg: w.totalVolumeKg, totalSets: w.totalSets,
      prs: prs.filter((p) => p.workoutId === w.id),
    });
  }
  const durations = workouts.map((w) => w.durationSec).filter(Boolean);
  return {
    month, from, to,
    days: [...byDate.entries()].map(([date, list]) => ({ date, workouts: list })),
    workoutCount: workouts.length,
    avgDurationSec: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    streakDays: await loggingStreak(user.id, t),
  };
}

// Completed working sets per muscle group for the week containing `date`.
export async function getMuscleVolume(user, input = {}) {
  const date = v.date(input.date, 'date', { optional: true }) ?? today(user);
  const from = weekStart(date, user.weekStartsOn);
  const to = addDays(from, 6);
  const rows = await db.all(sql`
    SELECT e.muscle AS muscle, count(*) AS sets
    FROM sets s JOIN exercises e ON e.id = s.exercise_id JOIN workouts w ON w.id = s.workout_id
    WHERE s.user_id = ${user.id} AND s.completed = 1 AND s.set_type != 'warmup'
      AND w.local_date BETWEEN ${from} AND ${to}
    GROUP BY e.muscle`);
  const counts = new Map(rows.map((r) => [r.muscle, Number(r.sets)]));
  const muscles = [...new Set([...TRACKED_MUSCLES, ...counts.keys()])]
    .map((muscle) => ({ muscle, sets: counts.get(muscle) ?? 0 }))
    .sort((a, b) => b.sets - a.sets);
  return { from, to, muscles };
}

// Last date each muscle group was trained — for the "missed muscle" reminder.
export async function lastTrainedByMuscle(userId) {
  const rows = await db.all(sql`
    SELECT e.muscle AS muscle, max(w.local_date) AS last
    FROM sets s JOIN exercises e ON e.id = s.exercise_id JOIN workouts w ON w.id = s.workout_id
    WHERE s.user_id = ${userId} AND s.completed = 1 AND s.set_type != 'warmup'
    GROUP BY e.muscle`);
  return new Map(rows.map((r) => [r.muscle, r.last]));
}

export { TRACKED_MUSCLES };
