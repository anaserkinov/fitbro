import { db } from 'sdk';
import { eq, and, ne, inArray, isNull, isNotNull, asc, desc, gte, lte, sql } from 'sdk/db';
import * as T from '../schema.js';
import * as v from './validate.js';
import { own, insertChunked, isUniqueViolation } from './db-util.js';
import { refuse } from './endpoint.js';
import { today } from './users.js';
import { getExercise } from './exercises.js';
import { e1rm, summarizeSets } from './strength.js';
import { recordSetPrs, removeSetPrs, recordSessionVolumePrs, prHighlights } from './prs.js';
import { applyProgression } from './progression.js';
import { restsAfter, normalizeGroups } from './supersets.js';
import { recordWorkoutActivity, recordAchievementActivity, deleteWorkoutActivity } from './activity.js';
import { evaluateAchievements } from './achievements.js';
import { programPlan, isProgramRoutine, applyProgramProgress, programNotes } from './programs.js';

const W = T.workouts, WE = T.workoutExercises, S = T.sets, P = T.personalRecords;

export async function getActiveWorkout(userId) {
  return db.select().from(W).where(and(eq(W.userId, userId), isNull(W.endedAt))).get();
}

// Completed sets of this exercise from the most recent other workout — the
// "Previous" column and the source for pre-filled weights.
async function previousSets(userId, exerciseId, workoutId) {
  const last = await db.select({ workoutId: S.workoutId }).from(S)
    .where(and(eq(S.userId, userId), eq(S.exerciseId, exerciseId), eq(S.completed, true), ne(S.workoutId, workoutId)))
    .orderBy(desc(S.completedAt)).limit(1).get();
  if (!last) return [];
  return db.select().from(S)
    .where(and(eq(S.workoutId, last.workoutId), eq(S.exerciseId, exerciseId), eq(S.completed, true)))
    .orderBy(asc(S.position)).all();
}

// Adds an exercise to a workout with planned (not yet completed) sets, pre-filled from
// the routine target or, failing that, the previous session.
// `plan` (programs): exerciseId → this week's planned sets, or null.
async function addExercise(user, workout, exerciseId, { position, item = null, sets = null, plan = null }) {
  const ex = await getExercise(user.id, exerciseId);
  const [we] = await db.insert(WE).values({
    userId: user.id, workoutId: workout.id, exerciseId: ex.id,
    routineExerciseId: item ? item.id : null,
    position, supersetGroup: item ? item.supersetGroup : null,
    restSec: item && item.restSec !== null ? item.restSec : ex.defaultRestSec,
  }).returning();

  const prev = (await previousSets(user.id, ex.id, workout.id)).filter((s) => s.setType !== 'warmup');
  const planned = plan ? plan(ex.id) : null;
  if (planned) {
    await insertChunked(S, planned.map((p, i) => ({
      userId: user.id, workoutId: workout.id, workoutExerciseId: we.id, exerciseId: ex.id,
      position: i, setType: p.setType || 'working', completed: false, weightKg: p.weightKg, reps: p.reps,
    })));
    return we;
  }
  const count = item ? item.targetSets : sets ?? Math.max(prev.length, 3);
  const rows = [];
  for (let i = 0; i < count; i++) {
    const p = prev[i] ?? prev[prev.length - 1] ?? {};
    rows.push({
      userId: user.id, workoutId: workout.id, workoutExerciseId: we.id, exerciseId: ex.id,
      position: i, setType: 'working', completed: false,
      weightKg: item?.targetWeightKg ?? p.weightKg ?? null,
      reps: item?.targetRepsMax ?? p.reps ?? null,
      durationSec: item?.targetDurationSec ?? p.durationSec ?? null,
      distanceM: p.distanceM ?? null,
    });
  }
  await insertChunked(S, rows);
  return we;
}

export async function startWorkout(user, input) {
  const routineId = v.id(input.routineId, 'routineId', { optional: true });
  const date = v.date(input.date, 'date', { optional: true }) ?? today(user);
  let name = v.str(input.name, 'name', { max: 60, optional: true });
  if (await getActiveWorkout(user.id)) refuse('Finish or discard your current workout first', 'WORKOUT_IN_PROGRESS');

  let items = [];
  let plan = null;
  if (routineId) {
    const routine = await own(T.routines, routineId, user.id, 'Routine');
    plan = await programPlan(user, routine);
    name = name ?? routine.name;
    items = await db.select().from(T.routineExercises)
      .where(and(eq(T.routineExercises.routineId, routineId), eq(T.routineExercises.userId, user.id)))
      .orderBy(asc(T.routineExercises.position)).all();
  }

  let workout;
  try {
    [workout] = await db.insert(W).values({ userId: user.id, routineId: routineId ?? null, name: name ?? 'Workout', localDate: date }).returning();
  } catch (e) {
    if (isUniqueViolation(e)) refuse('Finish or discard your current workout first', 'WORKOUT_IN_PROGRESS');
    throw e;
  }
  for (const [position, item] of items.entries()) await addExercise(user, workout, item.exerciseId, { position, item, plan });
  return getWorkout(user, { id: workout.id });
}

// Full workout for the live screen or history detail. No id = the open workout.
export async function getWorkout(user, input = {}) {
  const id = v.id(input.id, 'id', { optional: true });
  const workout = id ? await own(W, id, user.id, 'Workout') : await getActiveWorkout(user.id);
  if (!workout) return { workout: null };

  const wes = await db.select().from(WE).where(eq(WE.workoutId, workout.id)).orderBy(asc(WE.position), asc(WE.id)).all();
  const sets = await db.select().from(S).where(eq(S.workoutId, workout.id)).orderBy(asc(S.position), asc(S.id)).all();
  const exIds = [...new Set(wes.map((w) => w.exerciseId))];
  const exs = exIds.length ? await db.select().from(T.exercises).where(inArray(T.exercises.id, exIds)).all() : [];
  const exById = new Map(exs.map((e) => [e.id, e]));
  // A program's routine targets are uniform; the planned sets carry the real prescription.
  const reIds = (await isProgramRoutine(workout.routineId)) ? [] : wes.map((w) => w.routineExerciseId).filter(Boolean);
  const res = reIds.length ? await db.select().from(T.routineExercises).where(inArray(T.routineExercises.id, reIds)).all() : [];
  const reById = new Map(res.map((r) => [r.id, r]));
  const bests = exIds.length ? await db.select({ exerciseId: P.exerciseId, best: sql`max(${P.value})` }).from(P)
    .where(and(eq(P.userId, user.id), eq(P.type, 'max_weight'), inArray(P.exerciseId, exIds))).groupBy(P.exerciseId).all() : [];
  const bestById = new Map(bests.map((b) => [b.exerciseId, Number(b.best)]));
  const notes = await programNotes(user, workout);   // open program workout: calibration and why weights changed

  const exercises = [];
  for (const we of wes) {
    const ex = exById.get(we.exerciseId);
    const re = we.routineExerciseId ? reById.get(we.routineExerciseId) : null;
    const prev = await previousSets(user.id, we.exerciseId, workout.id);
    exercises.push({
      ...we,
      exercise: { id: ex.id, name: ex.name, muscle: ex.muscle, equipment: ex.equipment, trackType: ex.trackType },
      restSec: we.restSec ?? user.defaultRestSec,
      target: re ? { sets: re.targetSets, repsMin: re.targetRepsMin, repsMax: re.targetRepsMax, weightKg: re.targetWeightKg, durationSec: re.targetDurationSec } : null,
      sets: sets.filter((s) => s.workoutExerciseId === we.id),
      previous: prev.map((s) => ({ setType: s.setType, weightKg: s.weightKg, reps: s.reps, durationSec: s.durationSec, distanceM: s.distanceM })),
      bestWeightKg: bestById.get(we.exerciseId) ?? null,
      ...(notes && notes.has(we.exerciseId) ? { program: notes.get(we.exerciseId) } : {}),
    });
  }
  const totals = summarizeSets(sets.map((s) => ({ ...s, trackType: exById.get(s.exerciseId)?.trackType })));
  return { workout, exercises, totals: { ...totals, plannedSets: sets.length } };
}

async function openWorkout(user, id) {
  const w = await own(W, id, user.id, 'Workout');
  return w;
}

export async function addWorkoutExercise(user, input) {
  const workout = await openWorkout(user, v.id(input.workoutId, 'workoutId'));
  const sets = v.num(input.sets, 'sets', { min: 1, max: 20, int: true, optional: true });
  const position = await db.$count(WE, eq(WE.workoutId, workout.id));
  await addExercise(user, workout, v.id(input.exerciseId, 'exerciseId'), { position, sets });
  return getWorkout(user, { id: workout.id });
}

export async function updateWorkoutExercise(user, input) {
  const we = await own(WE, v.id(input.id), user.id, 'Workout exercise');
  const { id, position, linkNext, ...rest } = input;
  const p = v.patch(rest, {
    restSec:       (x, k) => v.num(x, k, { min: 0, max: 900, int: true, optional: true }),
    supersetGroup: (x, k) => v.num(x, k, { min: 1, max: 20, int: true, optional: true }),
    notes:         (x, k) => v.str(x, k, { max: 500, optional: true }),
  });
  if (Object.keys(p).length) await db.update(WE).set(p).where(eq(WE.id, we.id)).run();
  // linkNext: true → superset with the exercise after it (joining either one's group).
  if (linkNext !== undefined && v.bool(linkNext, 'linkNext')) {
    const list = await db.select().from(WE).where(eq(WE.workoutId, we.workoutId)).orderBy(asc(WE.position), asc(WE.id)).all();
    const next = list[list.findIndex((x) => x.id === we.id) + 1];
    if (!next) v.invalid('There is no exercise after this one', 'linkNext');
    const group = we.supersetGroup ?? next.supersetGroup ?? Math.max(0, ...list.map((x) => x.supersetGroup || 0)) + 1;
    const join = list.filter((x) => x.id === we.id || x.id === next.id || (next.supersetGroup && x.supersetGroup === next.supersetGroup));
    await db.update(WE).set({ supersetGroup: group }).where(inArray(WE.id, join.map((x) => x.id))).run();
  }
  if (position !== undefined) {
    const to = v.num(position, 'position', { min: 0, max: 50, int: true });
    const list = await db.select({ id: WE.id }).from(WE).where(eq(WE.workoutId, we.workoutId)).orderBy(asc(WE.position), asc(WE.id)).all();
    const order = list.map((x) => x.id).filter((x) => x !== we.id);
    order.splice(Math.min(to, order.length), 0, we.id);
    for (const [i, wid] of order.entries()) await db.update(WE).set({ position: i }).where(eq(WE.id, wid)).run();
  }
  if (position !== undefined || linkNext !== undefined || 'supersetGroup' in p) await tidyGroups(we.workoutId);
  return getWorkout(user, { id: we.workoutId });
}

// After a move, link or removal: a superset is only consecutive exercises, and a
// group left with one exercise is dissolved.
async function tidyGroups(workoutId) {
  const list = await db.select({ id: WE.id, supersetGroup: WE.supersetGroup }).from(WE)
    .where(eq(WE.workoutId, workoutId)).orderBy(asc(WE.position), asc(WE.id)).all();
  for (const [i, e] of normalizeGroups(list).entries()) {
    if (e.supersetGroup !== list[i].supersetGroup) await db.update(WE).set({ supersetGroup: e.supersetGroup }).where(eq(WE.id, e.id)).run();
  }
}

async function deleteSetsWithPrs(user, sets) {
  for (const s of sets) {
    if (s.completed) await removeSetPrs(user.id, s.id);
    await db.delete(S).where(eq(S.id, s.id)).run();
  }
}

export async function removeWorkoutExercise(user, input) {
  const we = await own(WE, v.id(input.id), user.id, 'Workout exercise');
  await deleteSetsWithPrs(user, await db.select().from(S).where(eq(S.workoutExerciseId, we.id)).all());
  await db.delete(WE).where(eq(WE.id, we.id)).run();
  await tidyGroups(we.workoutId);
  return getWorkout(user, { id: we.workoutId });
}

// New set copying the last one in that exercise (weight, reps …), not completed.
// `afterSetId` inserts it right after that set instead (a drop set after the set
// just done); `weightKg` overrides the copied weight.
export async function addSet(user, input) {
  const we = await own(WE, v.id(input.workoutExerciseId, 'workoutExerciseId'), user.id, 'Workout exercise');
  const setType = v.oneOf(input.setType, 'setType', 'setType', { optional: true }) ?? 'working';
  const afterId = v.id(input.afterSetId, 'afterSetId', { optional: true });
  const weightKg = v.num(input.weightKg, 'weightKg', { min: 0, max: 1000, optional: true });

  let base = await db.select().from(S).where(eq(S.workoutExerciseId, we.id)).orderBy(desc(S.position)).limit(1).get();
  let position = base ? base.position + 1 : 0;
  if (afterId) {
    base = await own(S, afterId, user.id, 'Set');
    if (base.workoutExerciseId !== we.id) v.invalid('afterSetId is not in this exercise', 'afterSetId');
    position = base.position + 1;
    await db.update(S).set({ position: sql`${S.position} + 1` })
      .where(and(eq(S.workoutExerciseId, we.id), gte(S.position, position))).run();
  }
  const [set] = await db.insert(S).values({
    userId: user.id, workoutId: we.workoutId, workoutExerciseId: we.id, exerciseId: we.exerciseId,
    position, setType, completed: false,
    weightKg: weightKg ?? base?.weightKg ?? null, reps: base?.reps ?? null,
    durationSec: base?.durationSec ?? null, distanceM: base?.distanceM ?? null,
  }).returning();
  return { set };
}

const SET_SPEC = {
  weightKg:    (x, k) => v.num(x, k, { min: 0, max: 1000, optional: true }),
  reps:        (x, k) => v.num(x, k, { min: 0, max: 1000, int: true, optional: true }),
  durationSec: (x, k) => v.num(x, k, { min: 0, max: 86400, int: true, optional: true }),
  distanceM:   (x, k) => v.num(x, k, { min: 0, max: 1000000, optional: true }),
  kcal:        (x, k) => v.num(x, k, { min: 0, max: 5000, int: true, optional: true }),
  rpe:         (x, k) => v.num(x, k, { min: 1, max: 10, optional: true }),
  rir:         (x, k) => v.num(x, k, { min: 0, max: 10, int: true, optional: true }),
  setType:     (x, k) => v.oneOf(x, 'setType', k),
  completed:   (x, k) => v.bool(x, k),
};
const PR_FIELDS = ['weightKg', 'reps', 'durationSec', 'distanceM', 'setType', 'completed'];

// Edit and/or tick a set. Ticking starts the rest timer on an open workout and
// returns any records broken (`prs`, baselines excluded).
export async function updateSet(user, input) {
  const { id, ...rest } = input;
  const set = await own(S, v.id(id), user.id, 'Set');
  const p = v.patch(rest, SET_SPEC);
  const next = { ...set, ...p };
  const becameDone = next.completed && !set.completed;

  const changes = { ...p, e1rmKg: next.setType === 'warmup' ? null : e1rm(next.weightKg, next.reps) };
  if (becameDone) changes.completedAt = new Date();
  if (!next.completed) changes.completedAt = null;
  const [saved] = await db.update(S).set(changes).where(eq(S.id, set.id)).returning();

  let prs = [];
  if (PR_FIELDS.some((f) => f in p)) {
    if (set.completed) await removeSetPrs(user.id, set.id);
    if (saved.completed) {
      const ex = await getExercise(user.id, saved.exerciseId);
      prs = (await recordSetPrs(user.id, saved, ex)).filter((r) => !r.isFirst);
    }
  }

  let restEndsAt = null;
  if (becameDone) {
    const workout = await db.select().from(W).where(eq(W.id, set.workoutId)).get();
    if (workout && !workout.endedAt) {
      const we = await db.select().from(WE).where(eq(WE.id, set.workoutExerciseId)).get();
      const ex = await getExercise(user.id, set.exerciseId);
      const rest = (await restsAfterSet(workout.id, saved.id)) ? we?.restSec ?? ex.defaultRestSec ?? user.defaultRestSec : 0;
      if (rest > 0) {
        restEndsAt = new Date(Date.now() + rest * 1000);
        await db.update(W).set({ restEndsAt }).where(eq(W.id, workout.id)).run();
      } else if (workout.restEndsAt) {
        await db.update(W).set({ restEndsAt: null }).where(eq(W.id, workout.id)).run();   // straight on to the next set
      }
    }
  }
  return { set: saved, prs, restEndsAt };
}

// No rest before a drop set or between the exercises of a superset round.
async function restsAfterSet(workoutId, setId) {
  const wes = await db.select().from(WE).where(eq(WE.workoutId, workoutId)).orderBy(asc(WE.position), asc(WE.id)).all();
  const sets = await db.select().from(S).where(eq(S.workoutId, workoutId)).orderBy(asc(S.position), asc(S.id)).all();
  return restsAfter(wes.map((we) => ({ ...we, sets: sets.filter((s) => s.workoutExerciseId === we.id) })), setId);
}

export async function deleteSet(user, input) {
  const set = await own(S, v.id(input.id), user.id, 'Set');
  await deleteSetsWithPrs(user, [set]);
  return { ok: true };
}

// seconds > 0 restarts the rest timer from now; 0 or null clears it.
export async function setRest(user, input) {
  const w = await own(W, v.id(input.workoutId, 'workoutId'), user.id, 'Workout');
  const seconds = v.num(input.seconds, 'seconds', { min: 0, max: 3600, int: true, optional: true });
  const restEndsAt = seconds ? new Date(Date.now() + seconds * 1000) : null;
  await db.update(W).set({ restEndsAt }).where(eq(W.id, w.id)).run();
  return { restEndsAt };
}

async function deleteWorkoutRows(user, workoutId) {
  await deleteWorkoutActivity(user.id, workoutId);
  await db.delete(P).where(and(eq(P.userId, user.id), eq(P.workoutId, workoutId))).run();
  await db.delete(S).where(and(eq(S.userId, user.id), eq(S.workoutId, workoutId))).run();
  await db.delete(WE).where(and(eq(WE.userId, user.id), eq(WE.workoutId, workoutId))).run();
  await db.delete(W).where(and(eq(W.userId, user.id), eq(W.id, workoutId))).run();
}

export async function discardWorkout(user, input) {
  const w = await own(W, v.id(input.id), user.id, 'Workout');
  await deleteWorkoutRows(user, w.id);
  return { ok: true };
}

// Drops planned-but-not-done sets, saves totals, records session PRs and applies
// progression (routine targets, or the program's lift states). A workout with no completed sets is discarded instead.
export async function finishWorkout(user, input) {
  const w = await own(W, v.id(input.id), user.id, 'Workout');
  if (w.endedAt) refuse('This workout is already finished', 'ALREADY_FINISHED');
  const notes = v.str(input.notes, 'notes', { max: 1000, optional: true });

  await db.delete(S).where(and(eq(S.workoutId, w.id), eq(S.completed, false))).run();
  const done = await db.select().from(S).where(eq(S.workoutId, w.id)).all();
  if (!done.length) {
    await deleteWorkoutRows(user, w.id);
    return { discarded: true };
  }
  const usedWe = new Set(done.map((s) => s.workoutExerciseId));
  for (const we of await db.select({ id: WE.id }).from(WE).where(eq(WE.workoutId, w.id)).all()) {
    if (!usedWe.has(we.id)) await db.delete(WE).where(eq(WE.id, we.id)).run();
  }

  const exIds = [...new Set(done.map((s) => s.exerciseId))];
  const exs = await db.select({ id: T.exercises.id, trackType: T.exercises.trackType }).from(T.exercises).where(inArray(T.exercises.id, exIds)).all();
  const track = new Map(exs.map((e) => [e.id, e.trackType]));
  const totals = summarizeSets(done.map((s) => ({ ...s, trackType: track.get(s.exerciseId) })));

  const endedAt = new Date();
  const [workout] = await db.update(W).set({
    endedAt,
    durationSec: Math.max(0, Math.round((endedAt.getTime() - w.startedAt.getTime()) / 1000)),
    totalVolumeKg: totals.totalVolumeKg,
    totalSets: totals.totalSets,
    notes: notes ?? w.notes,
    restEndsAt: null,
  }).where(eq(W.id, w.id)).returning();

  await recordSessionVolumePrs(user.id, w.id);
  const progression = await applyProgression(user.id, w.id);
  const programChanges = await applyProgramProgress(user, workout);
  const prs = await prHighlights(user.id, { workoutId: w.id });
  await recordWorkoutActivity(user, workout, prs);   // friends feed; pings go out from tick
  const { announced } = await evaluateAchievements(user);
  await recordAchievementActivity(user, announced, workout.localDate);
  return { workout, totals, prs, progression, programChanges, achievements: announced };
}

// Finished workouts between two dates, newest first (history list / calendar).
export async function listWorkouts(user, input) {
  const from = v.date(input.from, 'from');
  const to = v.date(input.to, 'to');
  const rows = await db.select().from(W)
    .where(and(eq(W.userId, user.id), isNotNull(W.endedAt), gte(W.localDate, from), lte(W.localDate, to)))
    .orderBy(desc(W.localDate), desc(W.startedAt)).all();
  const prs = await prHighlights(user.id, { from, to });
  return { workouts: rows.map((w) => ({ ...w, prs: prs.filter((p) => p.workoutId === w.id) })) };
}
