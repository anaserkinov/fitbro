import { db } from 'sdk';
import { eq, and, ne, inArray, isNull, asc, sql } from 'sdk/db';
import * as T from '../schema.js';
import * as v from './validate.js';
import { visible, own, fromUnix } from './db-util.js';
import { exerciseRecords } from './prs.js';
import { round } from './units.js';
import { catalogName } from './i18n/catalog.js';

const E = T.exercises;

// Built-in or the user's own; archived ones stay readable (old sets point at them).
export async function getExercise(userId, id) {
  return visible(E, id, userId, 'Exercise');
}

export async function listExercises(user, input = {}) {
  const muscle = v.oneOf(input.muscle, 'muscle', 'muscle', { optional: true });
  const q = v.str(input.q, 'q', { max: 60, optional: true });

  const conds = [inArray(E.userId, [0, user.id]), isNull(E.archivedAt)];
  if (muscle) conds.push(eq(E.muscle, muscle));
  let rows = await db.select().from(E).where(and(...conds)).orderBy(asc(E.name)).all();
  if (q) {
    const needle = q.toLowerCase();
    const local = (e) => (e.userId === 0 ? catalogName(user.language, e.name).toLowerCase() : '');
    rows = rows.filter((e) => e.name.toLowerCase().includes(needle) || local(e).includes(needle) || (e.aliases || []).some((a) => a.includes(needle)));
  }

  const S = T.sets;
  const usage = await db.select({ exerciseId: S.exerciseId, last: sql`max(${S.completedAt})`, workouts: sql`count(distinct ${S.workoutId})` })
    .from(S).where(and(eq(S.userId, user.id), eq(S.completed, true))).groupBy(S.exerciseId).all();
  const used = new Map(usage.map((u) => [u.exerciseId, u]));

  return {
    exercises: rows.map((e) => ({
      ...e,
      custom: e.userId !== 0,
      lastUsedAt: used.has(e.id) ? fromUnix(used.get(e.id).last) : null,
      timesUsed: used.has(e.id) ? Number(used.get(e.id).workouts) : 0,
    })),
  };
}

const SPEC = {
  id:               (x, k) => v.id(x, k),
  name:             (x, k) => v.str(x, k, { max: 60 }),
  muscle:           (x, k) => v.oneOf(x, 'muscle', k),
  equipment:        (x, k) => v.oneOf(x, 'equipment', k, { optional: true }),
  category:         (x, k) => v.oneOf(x, 'category', k, { optional: true }),
  trackType:        (x, k) => v.oneOf(x, 'trackType', k),
  defaultRestSec:   (x, k) => v.num(x, k, { min: 0, max: 900, int: true, optional: true }),
  notes:            (x, k) => v.str(x, k, { max: 1000, optional: true }),
  link:             (x, k) => {
    const s = v.str(x, k, { max: 300, optional: true });
    if (s && !/^https:\/\//.test(s)) v.invalid('Link must start with https://', k);
    return s;
  },
  aliases:          (x, k) => v.list(x, k, (a, kk) => v.str(a, kk, { max: 40 }).toLowerCase(), { max: 10, optional: true }),
  secondaryMuscles: (x, k) => v.list(x, k, (a, kk) => v.str(a, kk, { max: 30 }).toLowerCase(), { max: 6, optional: true }),
};

async function assertNameFree(userId, name, exceptId) {
  const conds = [inArray(E.userId, [0, userId]), isNull(E.archivedAt), sql`lower(${E.name}) = ${name.toLowerCase()}`];
  if (exceptId) conds.push(ne(E.id, exceptId));
  const clash = await db.select({ id: E.id }).from(E).where(and(...conds)).get();
  if (clash) v.invalid('An exercise with this name already exists', 'name');
}

// Create (no id) or edit a custom exercise. Built-ins are read-only.
export async function saveExercise(user, input) {
  const p = v.patch(input, SPEC);
  const id = p.id;
  delete p.id;
  if (p.name) await assertNameFree(user.id, p.name, id);

  if (id) {
    await own(E, id, user.id, 'Custom exercise');
    if (Object.keys(p).length) await db.update(E).set(p).where(eq(E.id, id)).run();
    return { exercise: await getExercise(user.id, id) };
  }
  if (!p.name) v.invalid('name is required', 'name');
  if (!p.muscle) v.invalid('muscle is required', 'muscle');
  const [row] = await db.insert(E).values({ trackType: 'weight_reps', ...p, userId: user.id }).returning();
  return { exercise: row };
}

export async function archiveExercise(user, input) {
  const id = v.id(input.id);
  await own(E, id, user.id, 'Custom exercise');
  await db.update(E).set({ archivedAt: new Date() }).where(eq(E.id, id)).run();
  return { ok: true };
}

// Sessions, chart series and records for one exercise.
export async function getExerciseHistory(user, input) {
  const exercise = await getExercise(user.id, v.id(input.exerciseId, 'exerciseId'));
  const weeks = v.num(input.weeks, 'weeks', { min: 1, max: 260, int: true, optional: true }) ?? 12;
  const since = Math.floor(Date.now() / 1000) - weeks * 7 * 86400;

  const rows = await db.all(sql`
    SELECT s.workout_id AS workoutId, w.local_date AS date, s.weight_kg AS weightKg, s.reps,
           s.duration_sec AS durationSec, s.distance_m AS distanceM, s.e1rm_kg AS e1rmKg
    FROM sets s JOIN workouts w ON w.id = s.workout_id
    WHERE s.user_id = ${user.id} AND s.exercise_id = ${exercise.id} AND s.completed = 1
      AND s.set_type != 'warmup' AND s.completed_at >= ${since}
    ORDER BY w.local_date, s.workout_id, s.position`);

  const byWorkout = new Map();
  for (const r of rows) {
    if (!byWorkout.has(r.workoutId)) byWorkout.set(r.workoutId, { workoutId: r.workoutId, date: r.date, sets: [] });
    byWorkout.get(r.workoutId).sets.push({ weightKg: r.weightKg, reps: r.reps, durationSec: r.durationSec, distanceM: r.distanceM });
  }
  const sessions = [...byWorkout.values()].map((s) => {
    const max = (f) => s.sets.reduce((m, x) => Math.max(m, x[f] ?? 0), 0) || null;
    const top = s.sets.reduce((best, x) => ((x.weightKg ?? 0) > (best?.weightKg ?? -1) ? x : best), null);
    const e1rms = rows.filter((r) => r.workoutId === s.workoutId && r.e1rmKg).map((r) => r.e1rmKg);
    return {
      ...s,
      bestE1rmKg: e1rms.length ? Math.max(...e1rms) : null,
      topSet: top && top.weightKg ? { weightKg: top.weightKg, reps: top.reps } : null,
      volumeKg: round(s.sets.reduce((a, x) => a + (x.weightKg || 0) * (x.reps || 0), 0), 1),
      maxReps: max('reps'),
      maxDurationSec: max('durationSec'),
      maxDistanceM: max('distanceM'),
    };
  });

  return {
    exercise,
    series: sessions.map((s) => ({ date: s.date, e1rmKg: s.bestE1rmKg, topWeightKg: s.topSet?.weightKg ?? null, volumeKg: s.volumeKg, maxReps: s.maxReps, maxDurationSec: s.maxDurationSec, maxDistanceM: s.maxDistanceM })),
    sessions: sessions.slice(-20).reverse(),
    records: await exerciseRecords(user.id, exercise.id),
  };
}
