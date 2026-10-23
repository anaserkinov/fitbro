import { db } from 'sdk';
import { eq, and, ne, inArray, isNull, isNotNull, asc, desc, sql } from 'sdk/db';
import { atOrAfter, isUniqueViolation } from './db-util.js';
import * as T from '../schema.js';
import * as v from './validate.js';
import { today, latestWeightKg } from './users.js';
import { daysBetween } from './dates.js';
import { tr } from './i18n/bot.js';
import { saveRoutine, saveSchedule, archiveRoutine } from './routines.js';
import { recommendPrograms, trainingSignals } from './recommend.js';
import {
  PROGRAMS, PROGRAM_BY_CODE, trainingMax, weekInfo, daysPerWeek, roundTo, guessKg, initialReps, fromOneRepMax,
} from './data/programs.js';

// Multi-week programs. Enrolling turns a template into ordinary routines plus a weekly
// schedule; starting one of those routines pre-fills that week's prescribed sets
// (programPlan, used by workouts.js) from each exercise's lift state (program_lifts),
// and finishing it advances those states (applyProgramProgress).
//
// The program week counts finished sessions, so missed days don't skip weeks. A
// program ends itself — same cleanup as leaving — the first time it's looked at after
// its last week, or after IDLE_DAYS without a session.

const PE = T.programEnrollments, R = T.routines, PL = T.programLifts, W = T.workouts, S = T.sets;
const STRENGTH_DAYS = 90;
const IDLE_DAYS = 28;
const BREAK_DAYS = 14;     // this long without a session → every working weight × BREAK, once
const BREAK = 0.9;
const WEIGHTED = ['weight_reps', 'weighted_bodyweight'];

async function catalogRows(names) {
  const rows = await db.select({ id: T.exercises.id, name: T.exercises.name, trackType: T.exercises.trackType }).from(T.exercises)
    .where(and(eq(T.exercises.userId, 0), inArray(T.exercises.name, [...new Set(names)]))).all();
  return new Map(rows.map((r) => [r.name, r]));
}

// A program day's exercises that exist in the catalogue: [{ ex, id, trackType }].
async function dayItems(day) {
  const rows = await catalogRows(day.exercises.map((x) => x.name));
  return day.exercises.filter((x) => rows.has(x.name)).map((ex) => ({ ex, id: rows.get(ex.name).id, trackType: rows.get(ex.name).trackType }));
}

// Best estimated 1RM per exercise in the last 90 days.
async function recentE1rm(userId, exerciseIds) {
  if (!exerciseIds.length) return new Map();
  const rows = await db.select({ exerciseId: S.exerciseId, best: sql`max(${S.e1rmKg})` }).from(S)
    .where(and(eq(S.userId, userId), inArray(S.exerciseId, exerciseIds), eq(S.completed, true), atOrAfter(S.completedAt, new Date(Date.now() - STRENGTH_DAYS * 86400e3))))
    .groupBy(S.exerciseId).all();
  return new Map(rows.filter((r) => r.best).map((r) => [r.exerciseId, Number(r.best)]));
}

// Best estimated 1RM per 5/3/1 lift in the last 90 days — the suggested maxes.
async function suggestedMaxes(user) {
  const lifts = { ohp: 'Overhead Press', deadlift: 'Deadlift', bench: 'Barbell Bench Press', squat: 'Back Squat' };
  const rows = await catalogRows(Object.values(lifts));
  const best = await recentE1rm(user.id, [...rows.values()].map((r) => r.id));
  return Object.fromEntries(Object.entries(lifts).map(([key, name]) => [key, (rows.has(name) && best.get(rows.get(name).id)) || null]));
}

const describe = (p) => ({
  code: p.code, name: p.name, about: p.about, weeks: p.weeks, cycleWeeks: p.cycleWeeks || null,
  daysPerWeek: daysPerWeek(p), needsMaxes: p.needsMaxes || null,
  days: p.days.map((d) => ({ name: d.name, exercises: d.exercises.map((e) => e.name) })),
  schedule: p.schedule,
});

async function activeEnrollment(userId) {
  return db.select().from(PE).where(and(eq(PE.userId, userId), isNull(PE.endedAt))).get();
}

// Finished sessions of an enrolment and the local date of the last one.
async function sessions(e) {
  const ids = (await db.select({ id: R.id }).from(R).where(and(eq(R.userId, e.userId), eq(R.programEnrollmentId, e.id))).all()).map((r) => r.id);
  if (!ids.length) return { done: 0, lastDate: null };
  const row = await db.select({ n: sql`count(*)`, last: sql`max(${W.localDate})` }).from(W)
    .where(and(eq(W.userId, e.userId), inArray(W.routineId, ids), isNotNull(W.endedAt))).get();
  return { done: Number(row.n), lastDate: row.last ?? null };
}

// Weeks to add to the session count. Enrolments from before weeks were counted by
// sessions keep the calendar week they had reached (set once, on first look).
async function weekOffset(user, e, program, done) {
  if (e.weekOffset !== null && e.weekOffset !== undefined) return e.weekOffset;
  const calendar = Math.max(0, Math.floor(daysBetween(e.startDate, today(user)) / 7));
  e.weekOffset = Math.max(0, calendar - Math.floor(done / daysPerWeek(program)));
  await db.update(PE).set({ weekOffset: e.weekOffset }).where(eq(PE.id, e.id)).run();
  return e.weekOffset;
}

async function endEnrollment(user, e) {
  const routines = await db.select({ id: R.id }).from(R).where(and(eq(R.userId, user.id), eq(R.programEnrollmentId, e.id), isNull(R.archivedAt))).all();
  for (const r of routines) await archiveRoutine(user, { id: r.id });   // also clears their schedule days
  await db.update(PE).set({ endedAt: new Date() }).where(eq(PE.id, e.id)).run();
}

// The active enrolment with where it stands, ending it first if it has run its course
// or gone idle. `weekIndex` is the week of the next session.
async function currentEnrollment(user) {
  const e = await activeEnrollment(user.id);
  if (!e) return null;
  const program = PROGRAM_BY_CODE[e.programCode];
  const s = await sessions(e);
  const weekIndex = program ? (await weekOffset(user, e, program, s.done)) + Math.floor(s.done / daysPerWeek(program)) : 0;
  const idle = daysBetween(s.lastDate ?? e.startDate, today(user)) >= IDLE_DAYS;
  if (!program || weekInfo(program, weekIndex).finished || idle) {
    await endEnrollment(user, e);
    return null;
  }
  return { e, program, weekIndex, ...s };
}

// The catalogue plus, when not following one, the programs that fit the user best.
// needsProfile: experience or equipment not answered yet, so nothing is recommended.
export async function listPrograms(user) {
  const current = await currentEnrollment(user);
  const needsProfile = !user.experience || !user.equipment;
  const recommended = current || needsProfile ? [] : recommendPrograms(user, await trainingSignals(user), PROGRAMS);
  return {
    programs: PROGRAMS.map(describe), activeCode: current ? current.e.programCode : null, suggestedMaxes: await suggestedMaxes(user),
    recommended, needsProfile,
  };
}

export async function getMyProgram(user) {
  const current = await currentEnrollment(user);
  if (!current) {
    const last = await db.select().from(PE).where(eq(PE.userId, user.id)).orderBy(desc(PE.id)).limit(1).get();
    return { program: null, lastEnded: last ? { code: last.programCode, endedAt: last.endedAt } : null };
  }
  const { e, program, weekIndex, done } = current;
  const routines = await db.select().from(R).where(and(eq(R.userId, user.id), eq(R.programEnrollmentId, e.id), isNull(R.archivedAt))).all();
  return {
    program: describe(program),
    enrollment: { id: e.id, startDate: e.startDate, trainingMaxes: e.trainingMaxes },
    weekIndex, ...weekInfo(program, weekIndex),
    sessionsDone: done, sessionsThisWeek: done % daysPerWeek(program), daysPerWeek: daysPerWeek(program),
    routines: routines.sort((a, b) => a.programDay - b.programDay).map((r) => ({ id: r.id, name: r.name, day: r.programDay })),
  };
}

const MAXES_SPEC = Object.fromEntries(['ohp', 'deadlift', 'bench', 'squat'].map((k) => [k, (x, kk) => v.num(x, kk, { min: 10, max: 500, optional: true })]));

export async function enrollProgram(user, input) {
  const program = PROGRAM_BY_CODE[input.code];
  if (!program) v.invalid('Unknown program', 'code');
  if (await currentEnrollment(user)) v.refuse('Leave your current program first', 'PROGRAM_ACTIVE');
  const given = input.oneRepMaxes === undefined || input.oneRepMaxes === null ? {} : v.patch(input.oneRepMaxes, MAXES_SPEC);

  let trainingMaxes = null;
  if (program.needsMaxes) {
    const suggested = await suggestedMaxes(user);
    trainingMaxes = Object.fromEntries(program.needsMaxes.map((k) => [k, trainingMax(given[k] ?? suggested[k])]));
  }

  const rows = await catalogRows(program.days.flatMap((d) => d.exercises.map((e) => e.name)));
  const t = tr(user);
  const [e] = await db.insert(PE).values({ userId: user.id, programCode: program.code, startDate: today(user), trainingMaxes, weekOffset: 0 }).returning();
  const routineIds = [];
  for (const [i, day] of program.days.entries()) {
    const items = day.exercises.filter((x) => rows.has(x.name)).map((x) => ({
      exerciseId: rows.get(x.name).id,
      targetSets: x.sets || 3,
      ...(x.repsMin ? { targetRepsMin: x.repsMin, targetRepsMax: x.repsMax } : x.reps ? { targetRepsMin: x.reps } : {}),
      autoProgress: false,   // the program decides the weights
    }));
    const { routine } = await saveRoutine(user, { name: `${t(day.name)} · ${t(program.name)}`.slice(0, 60), items });
    await db.update(R).set({ programEnrollmentId: e.id, programDay: i }).where(eq(R.id, routine.id)).run();
    routineIds.push(routine.id);
  }
  // The program's week replaces the user's schedule (the app confirms this first).
  await saveSchedule(user, { days: Object.entries(program.schedule).map(([weekday, day]) => ({ weekday: Number(weekday), routineId: routineIds[day] })) });
  return getMyProgram(user);
}

export async function leaveProgram(user) {
  const e = await activeEnrollment(user.id);
  if (!e) v.notFound('Program');
  await endEnrollment(user, e);
  return { left: true };
}

// ── Lift states ─────────────────────────────────────────────────────────────────

async function saveLift(row, patch) {
  const { change = null, ...fields } = patch;
  const next = { ...fields, lastChange: change, updatedAt: new Date() };
  await db.update(PL).set(next).where(eq(PL.id, row.id)).run();
  return { ...row, ...next };
}

// Completed working sets of an exercise in the latest finished session of this enrolment.
async function lastSessionSets(e, exerciseId) {
  const routineIds = (await db.select({ id: R.id }).from(R).where(and(eq(R.userId, e.userId), eq(R.programEnrollmentId, e.id))).all()).map((r) => r.id);
  const workoutIds = routineIds.length ? (await db.select({ id: W.id }).from(W).where(and(eq(W.userId, e.userId), inArray(W.routineId, routineIds), isNotNull(W.endedAt))).all()).map((w) => w.id) : [];
  if (!workoutIds.length) return [];
  const last = await db.select({ workoutId: S.workoutId }).from(S)
    .where(and(eq(S.userId, e.userId), eq(S.exerciseId, exerciseId), eq(S.completed, true), inArray(S.workoutId, workoutIds)))
    .orderBy(desc(S.completedAt)).limit(1).get();
  if (!last) return [];
  return db.select().from(S)
    .where(and(eq(S.workoutId, last.workoutId), eq(S.exerciseId, exerciseId), eq(S.completed, true), ne(S.setType, 'warmup')))
    .orderBy(asc(S.position)).all();
}

// A new lift's starting state, from the best thing known: a typed 1RM, this
// enrolment's own sessions (enrolled before lift states existed), recent history, or
// — with nothing to go on — a guess that the first session calibrates.
async function seedLift(user, current, item) {
  const { e, program, weekIndex } = current;
  const { ex } = item;
  const base = { reps: initialReps(ex), misses: 0, cycle: ex.main ? Math.floor(weekIndex / program.cycleWeeks) : null };
  const tm = ex.main && e.trainingMaxes && e.trainingMaxes[ex.main];
  if (tm) return { ...base, workingKg: roundTo(tm + base.cycle * ex.inc), source: 'entered' };
  if (!ex.main) {
    const prev = await lastSessionSets(e, item.id);
    const top = Math.max(0, ...prev.map((s) => s.weightKg || 0));
    if (top) {
      const seed = { ...base, workingKg: top, source: 'history' };
      const { change, ...patch } = program.advance(ex, seed, prev, { weekIndex }) || {};
      return { ...seed, ...patch };
    }
  }
  const best = (await recentE1rm(user.id, [item.id])).get(item.id);
  if (best) return { ...base, workingKg: fromOneRepMax(ex, best), source: 'history' };
  const workingKg = item.trackType === 'weight_reps' ? guessKg(ex, { sex: user.sex, bodyKg: await latestWeightKg(user.id) }) : null;
  return { ...base, workingKg, source: 'guess' };
}

// exerciseId → lift state for these items, creating missing ones. Only weighted
// exercises have one; the rest are prescribed by reps alone.
async function liftStates(user, current, items) {
  const ids = items.map((i) => i.id);
  const rows = ids.length ? await db.select().from(PL).where(and(eq(PL.enrollmentId, current.e.id), inArray(PL.exerciseId, ids))).all() : [];
  const byId = new Map(rows.map((r) => [r.exerciseId, r]));
  for (const item of items) {
    if (!WEIGHTED.includes(item.trackType) || byId.has(item.id)) continue;
    const seed = await seedLift(user, current, item);
    try {
      const [row] = await db.insert(PL).values({ userId: user.id, enrollmentId: current.e.id, exerciseId: item.id, ...seed }).returning();
      byId.set(item.id, row);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      byId.set(item.id, await db.select().from(PL).where(and(eq(PL.enrollmentId, current.e.id), eq(PL.exerciseId, item.id))).get());
    }
  }
  return byId;
}

// Back after BREAK_DAYS without a session: every working weight drops 10%, once.
async function applyBreak(user, current) {
  const { e, lastDate } = current;
  const now = today(user);
  if (!lastDate || daysBetween(lastDate, now) < BREAK_DAYS || (e.breakDeloadDate && e.breakDeloadDate > lastDate)) return;
  for (const row of await db.select().from(PL).where(eq(PL.enrollmentId, e.id)).all()) {
    if (!row.workingKg) continue;
    const kg = roundTo(row.workingKg * BREAK);
    await saveLift(row, { workingKg: kg, misses: 0, change: { kind: 'break', fromKg: row.workingKg, toKg: kg } });
  }
  await db.update(PE).set({ breakDeloadDate: now }).where(eq(PE.id, e.id)).run();
}

// For startWorkout: when `routine` belongs to the active program, a function giving the
// planned sets for one of its exercises this week (or null to use routine targets).
export async function programPlan(user, routine) {
  if (!routine || !routine.programEnrollmentId) return null;
  const current = await currentEnrollment(user);
  if (!current || current.e.id !== routine.programEnrollmentId) return null;
  const { program, weekIndex } = current;
  const day = program.days[routine.programDay];
  if (!day) return null;
  await applyBreak(user, current);
  const items = await dayItems(day);
  const states = await liftStates(user, current, items);
  if (program.roll) {
    for (const item of items) {
      const st = states.get(item.id);
      const patch = st && program.roll(item.ex, st, weekIndex);
      if (patch) states.set(item.id, await saveLift(st, patch));
    }
  }
  return (exerciseId) => {
    const item = items.find((i) => i.id === exerciseId);
    return item ? program.prescribe(item.ex, { state: states.get(exerciseId) ?? null, weekIndex }) : null;
  };
}

// For finishWorkout: advances the lift states of a finished program session. Returns
// what changed for next time: [{ exerciseId, exerciseName, kind, fromKg, toKg }].
export async function applyProgramProgress(user, workout) {
  if (!workout.routineId) return [];
  const routine = await db.select({ pe: R.programEnrollmentId, day: R.programDay }).from(R).where(eq(R.id, workout.routineId)).get();
  if (!routine || !routine.pe) return [];
  const e = await activeEnrollment(user.id);
  const program = e && e.id === routine.pe && PROGRAM_BY_CODE[e.programCode];
  const day = program && program.days[routine.day];
  if (!day) return [];
  const { done } = await sessions(e);   // includes this one
  const weekIndex = (await weekOffset(user, e, program, done)) + Math.floor(Math.max(0, done - 1) / daysPerWeek(program));
  const items = await dayItems(day);
  const ids = items.map((i) => i.id);
  const rows = ids.length ? await db.select().from(PL).where(and(eq(PL.enrollmentId, e.id), inArray(PL.exerciseId, ids))).all() : [];
  const states = new Map(rows.map((r) => [r.exerciseId, r]));
  const sets = await db.select().from(S).where(and(eq(S.workoutId, workout.id), eq(S.completed, true), ne(S.setType, 'warmup'))).orderBy(asc(S.position)).all();
  const changes = [];
  for (const item of items) {
    const st = states.get(item.id);
    const mine = sets.filter((x) => x.exerciseId === item.id);
    if (!st || !mine.length) continue;   // skipped: no verdict, the last reason stays
    const patch = program.advance(item.ex, st, mine, { weekIndex }) || {};
    await saveLift(st, patch);
    if (patch.change) changes.push({ exerciseId: item.id, exerciseName: item.ex.name, ...patch.change });
  }
  return changes;
}

// For getWorkout: exerciseId → { calibrate, guess, change } for an open program
// workout, or null for any other workout.
export async function programNotes(user, workout) {
  if (workout.endedAt || !workout.routineId) return null;
  const r = await db.select({ pe: R.programEnrollmentId }).from(R).where(eq(R.id, workout.routineId)).get();
  if (!r || !r.pe) return null;
  const e = await activeEnrollment(user.id);
  if (!e || e.id !== r.pe) return null;
  const rows = await db.select().from(PL).where(and(eq(PL.userId, user.id), eq(PL.enrollmentId, r.pe))).all();
  return new Map(rows.map((x) => [x.exerciseId, { calibrate: x.source === 'guess', guess: x.source === 'guess' && x.workingKg !== null, change: x.lastChange }]));
}

// True when a workout's routine came from a program (its routine targets don't apply).
export async function isProgramRoutine(routineId) {
  if (!routineId) return false;
  const r = await db.select({ pe: R.programEnrollmentId }).from(R).where(eq(R.id, routineId)).get();
  return !!(r && r.pe);
}
