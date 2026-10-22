import { db } from 'sdk';
import { eq, and, ne, gt, sql } from 'sdk/db';
import * as T from '../schema.js';
import { prCandidates } from './strength.js';

// Personal records are append-only: a new row is written whenever a record is beaten.
// The very first value of each kind is stored as a baseline (`isFirst: true`) — callers
// celebrate only records with `isFirst: false`.

const P = T.personalRecords;

async function currentBest(userId, exerciseId, type, weightKg) {
  const conds = [eq(P.userId, userId), eq(P.exerciseId, exerciseId), eq(P.type, type)];
  if (type === 'reps_at_weight') conds.push(eq(P.weightKg, weightKg));
  const row = await db.select({ best: sql`max(${P.value})` }).from(P).where(and(...conds)).get();
  return row && row.best !== null && row.best !== undefined ? Number(row.best) : null;
}

async function record(userId, exerciseId, c, { setId = null, workoutId = null, achievedAt = new Date() }) {
  const previous = await currentBest(userId, exerciseId, c.type, c.weightKg);
  if (previous !== null && c.value <= previous) return null;
  await db.insert(P).values({
    userId, exerciseId,
    type: c.type, value: c.value,
    weightKg: c.weightKg ?? null, reps: c.reps ?? null,
    setId, workoutId, achievedAt,
  }).run();
  return { ...c, exerciseId, previous, isFirst: previous === null };
}

// Call after a set is marked completed. `exercise` needs { id, trackType }.
export async function recordSetPrs(userId, set, exercise) {
  const out = [];
  for (const c of prCandidates(set, exercise.trackType)) {
    const r = await record(userId, exercise.id, c, {
      setId: set.id, workoutId: set.workoutId, achievedAt: set.completedAt ?? new Date(),
    });
    if (r) out.push(r);
  }
  return out;
}

// Call when a set is un-completed, edited or deleted (then re-record if still completed).
export async function removeSetPrs(userId, setId) {
  await db.delete(P).where(and(eq(P.userId, userId), eq(P.setId, setId))).run();
}

// Call when a workout is finished: best total kg × reps per exercise in one session.
export async function recordSessionVolumePrs(userId, workoutId) {
  const S = T.sets;
  const rows = await db.select({ exerciseId: S.exerciseId, volume: sql`sum(${S.weightKg} * ${S.reps})` })
    .from(S)
    .where(and(
      eq(S.userId, userId), eq(S.workoutId, workoutId),
      eq(S.completed, true), ne(S.setType, 'warmup'),
      gt(S.weightKg, 0), gt(S.reps, 0),
    ))
    .groupBy(S.exerciseId)
    .all();
  const out = [];
  for (const r of rows) {
    const value = Math.round(Number(r.volume) * 10) / 10;
    const pr = await record(userId, r.exerciseId, { type: 'session_volume', value }, { workoutId });
    if (pr) out.push(pr);
  }
  return out;
}

// Records broken in finished workouts (beating an earlier workout, so baselines are
// excluded), best per exercise/type. `scope` is { workoutId } or { from, to } dates.
export async function prHighlights(userId, scope) {
  const where = scope.workoutId
    ? sql`p.workout_id = ${scope.workoutId}`
    : sql`p.workout_id IN (SELECT id FROM workouts WHERE user_id = ${userId} AND local_date BETWEEN ${scope.from} AND ${scope.to})`;
  return db.all(sql`
    SELECT p.workout_id AS workoutId, p.exercise_id AS exerciseId, e.name AS exerciseName,
           p.type, max(p.value) AS value, p.weight_kg AS weightKg, p.reps
    FROM personal_records p JOIN exercises e ON e.id = p.exercise_id
    WHERE p.user_id = ${userId} AND ${where}
      AND EXISTS (SELECT 1 FROM personal_records q
                  WHERE q.user_id = p.user_id AND q.exercise_id = p.exercise_id AND q.type = p.type
                    AND (p.type != 'reps_at_weight' OR q.weight_kg = p.weight_kg)
                    AND q.id < p.id AND (q.workout_id IS NULL OR q.workout_id != p.workout_id))
    GROUP BY p.workout_id, p.exercise_id, p.type, CASE WHEN p.type = 'reps_at_weight' THEN p.weight_kg END
    ORDER BY p.workout_id, p.exercise_id`);
}

// Current best per type for one exercise — for the Progress screen.
export async function exerciseRecords(userId, exerciseId) {
  const rows = await db.all(sql`
    SELECT p.type, p.value, p.weight_kg AS weightKg, p.reps, p.achieved_at AS achievedAt
    FROM personal_records p
    WHERE p.user_id = ${userId} AND p.exercise_id = ${exerciseId} AND p.type != 'reps_at_weight'
      AND p.value = (SELECT max(q.value) FROM personal_records q
                     WHERE q.user_id = p.user_id AND q.exercise_id = p.exercise_id AND q.type = p.type)
    GROUP BY p.type`);
  return rows.map((r) => ({ ...r, achievedAt: new Date(r.achievedAt * 1000) }));
}
