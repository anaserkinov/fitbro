import { db } from 'sdk';
import { eq, and, ne, inArray, isNull, isNotNull, asc, desc, gte, sql } from 'sdk/db';
import { atOrAfter, isUniqueViolation } from './db-util.js';
import * as T from '../schema.js';
import * as v from './validate.js';
import { today, latestWeightKg } from './users.js';
import { daysBetween, addDays, weekStart } from './dates.js';
import { tr } from './i18n/bot.js';
import { saveRoutine, saveSchedule, archiveRoutine } from './routines.js';
import { seedCatalog } from './catalog.js';
import {
  PROGRAMS, PROGRAM_BY_CODE, trainingMax, weekInfo, daysPerWeek, roundTo, guessKg, initialReps, fromOneRepMax, planFor, advanceFor, bodyweightRange,
  resolveProgram, choicesOf,
} from './data/programs.js';

// Multi-week programs. Enrolling turns a template into ordinary routines plus a weekly
// schedule; starting one of those routines pre-fills that week's prescribed sets
// (programPlan, used by workouts.js) from each exercise's lift state (program_lifts),
// and finishing it advances those states (applyProgramProgress).
//
// Each template exercise is a slot: enrolling picks the exercise the user's equipment
// allows (and any swaps they chose), drops optional ones to fit their session length,
// and stores the result as exercise_choices.
//
// The program week counts finished sessions, so missed days don't skip weeks. A
// program ends itself — same cleanup as leaving — the first time it's looked at after
// its last week, or after IDLE_DAYS without a session.

const PE = T.programEnrollments, R = T.routines, PL = T.programLifts, W = T.workouts, S = T.sets;
const STRENGTH_DAYS = 90;
const IDLE_DAYS = 28;
const BREAK_DAYS = 14;     // this long without a session → every working weight × BREAK, once
const BREAK = 0.9;
const TRACKED = ['weight_reps', 'weighted_bodyweight', 'bodyweight_reps'];   // exercises with a lift state
const INC = { dumbbell: 2.5, machine: 5, cable: 2.5, kettlebell: 4 };          // weight steps for a swapped-in exercise

async function catalogRows(names) {
  const rows = await db.select({ id: T.exercises.id, name: T.exercises.name, trackType: T.exercises.trackType, equipment: T.exercises.equipment }).from(T.exercises)
    .where(and(eq(T.exercises.userId, 0), inArray(T.exercises.name, [...new Set(names)]))).all();
  return new Map(rows.map((r) => [r.name, r]));
}

// A program day's exercises as enrolled ({ '<day>.<i>': name } choices; null = the
// template's own), found in the catalogue: [{ ex, id, trackType }]. `ex` is the
// template exercise with the chosen name, its track type and a fitting increment;
// a swapped-in exercise loses `pattern`, so it gets no barbell-based guess.
async function dayItems(day, dayIndex, choices) {
  const list = day.exercises
    .map((ex, i) => ({ ex, name: choices ? choices[`${dayIndex}.${i}`] : ex.name }))
    .filter((x) => x.name);
  const rows = await catalogRows(list.map((x) => x.name));
  return list.filter((x) => rows.has(x.name)).map(({ ex, name }) => {
    const row = rows.get(name);
    const own = name === ex.name;
    const { pattern, ...rest } = ex;
    return { ex: { ...(own ? ex : rest), name, track: row.trackType, inc: own ? ex.inc : INC[row.equipment] ?? ex.inc ?? 2.5 }, id: row.id, trackType: row.trackType };
  });
}

const resolveFor = (user, program, swaps) => resolveProgram(program, { equipment: user.equipment || 'gym', sessionMinutes: user.sessionMinutes, swaps });

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

// A program for the app. With a user: `days` laid out for their equipment and session
// length, each exercise with the swaps on offer ({ key, name, alternatives, optional }).
function describe(p, user = null, choices = null) {
  const plan = user ? resolveFor(user, p) : null;
  return {
    code: p.code, name: p.name, about: p.about, weeks: p.weeks, cycleWeeks: p.cycleWeeks || null,
    daysPerWeek: daysPerWeek(p), needsMaxes: p.needsMaxes || null,
    levels: p.levels, equipment: p.equipment,
    days: plan
      ? plan.days.map((d) => ({ name: d.name, minutes: d.minutes, exercises: d.exercises }))
      : p.days.map((d, di) => ({ name: d.name, exercises: d.exercises.map((e, i) => ({ key: `${di}.${i}`, name: choices ? choices[`${di}.${i}`] : e.name })).filter((e) => e.name) })),
    doable: plan ? plan.doable : true,
    schedule: p.schedule,
  };
}

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
    programs: PROGRAMS.map((p) => describe(p, user)), activeCode: current ? current.e.programCode : null, suggestedMaxes: await suggestedMaxes(user),
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
    program: describe(program, null, e.exerciseChoices),
    enrollment: { id: e.id, startDate: e.startDate, trainingMaxes: e.trainingMaxes },
    weekIndex, ...weekInfo(program, weekIndex),
    sessionsDone: done, sessionsThisWeek: done % daysPerWeek(program), daysPerWeek: daysPerWeek(program),
    routines: routines.sort((a, b) => a.programDay - b.programDay).map((r) => ({ id: r.id, name: r.name, day: r.programDay })),
  };
}

const MAXES_SPEC = Object.fromEntries(['ohp', 'deadlift', 'bench', 'squat'].map((k) => [k, (x, kk) => v.num(x, kk, { min: 10, max: 500, optional: true })]));

// { '<day>.<i>': exercise name } — each must be one of that exercise's alternatives.
function validSwaps(program, user, input) {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) v.invalid('swaps must be an object', 'swaps');
  const offered = new Map(resolveFor(user, program).days.flatMap((d) => d.exercises.map((x) => [x.key, x.alternatives])));
  const full = resolveProgram(program, { equipment: user.equipment || 'gym' });   // trimmed exercises can be swapped too
  for (const d of full.days) for (const x of d.exercises) if (!offered.has(x.key)) offered.set(x.key, x.alternatives);
  for (const [key, name] of Object.entries(input)) {
    if (!(offered.get(key) || []).includes(name)) v.invalid('Not an option for this exercise', 'swaps');
  }
  return input;
}

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

  const exerciseChoices = choicesOf(resolveFor(user, program, validSwaps(program, user, input.swaps)));
  const names = new Set(Object.values(exerciseChoices));
  if ((await catalogRows([...names])).size < names.size) await seedCatalog();   // built-ins added since the catalogue was seeded
  const t = tr(user);
  const [e] = await db.insert(PE).values({ userId: user.id, programCode: program.code, startDate: today(user), trainingMaxes, weekOffset: 0, exerciseChoices }).returning();
  const routineIds = [];
  for (const [i, day] of program.days.entries()) {
    const items = (await dayItems(day, i, exerciseChoices)).map(({ ex, id }) => ({
      exerciseId: id,
      targetSets: ex.sets || 3,
      ...(ex.repsMin ? { targetRepsMin: ex.repsMin, targetRepsMax: ex.repsMax } : ex.reps ? { targetRepsMin: ex.reps } : {}),
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
  if (item.trackType === 'bodyweight_reps') return { reps: bodyweightRange(ex)[0], misses: 0, cycle: null, workingKg: null, source: 'reps' };
  const base = { reps: initialReps(ex), misses: 0, cycle: ex.main ? Math.floor(weekIndex / program.cycleWeeks) : null };
  const tm = ex.main && e.trainingMaxes && e.trainingMaxes[ex.main];
  if (tm) return { ...base, workingKg: roundTo(tm + base.cycle * ex.inc), source: 'entered' };
  if (!ex.main) {
    const prev = await lastSessionSets(e, item.id);
    const top = Math.max(0, ...prev.map((s) => s.weightKg || 0));
    if (top) {
      const seed = { ...base, workingKg: top, source: 'history' };
      const { change, ...patch } = advanceFor(program, ex, seed, prev, { weekIndex }) || {};
      return { ...seed, ...patch };
    }
  }
  const best = (await recentE1rm(user.id, [item.id])).get(item.id);
  if (best) return { ...base, workingKg: fromOneRepMax(ex, best), source: 'history' };
  const workingKg = item.trackType === 'weight_reps' ? guessKg(ex, { sex: user.sex, bodyKg: await latestWeightKg(user.id) }) : null;
  return { ...base, workingKg, source: 'guess' };
}

// exerciseId → lift state for these items, creating missing ones. Timed and cardio
// exercises have none and are prescribed by reps alone.
async function liftStates(user, current, items) {
  const ids = items.map((i) => i.id);
  const rows = ids.length ? await db.select().from(PL).where(and(eq(PL.enrollmentId, current.e.id), inArray(PL.exerciseId, ids))).all() : [];
  const byId = new Map(rows.map((r) => [r.exerciseId, r]));
  for (const item of items) {
    if (!TRACKED.includes(item.trackType) || byId.has(item.id)) continue;
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
  const items = await dayItems(day, routine.programDay, current.e.exerciseChoices);
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
    return item ? planFor(program, item.ex, { state: states.get(exerciseId) ?? null, weekIndex }) : null;
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
  const items = await dayItems(day, routine.day, e.exerciseChoices);
  const ids = items.map((i) => i.id);
  const rows = ids.length ? await db.select().from(PL).where(and(eq(PL.enrollmentId, e.id), inArray(PL.exerciseId, ids))).all() : [];
  const states = new Map(rows.map((r) => [r.exerciseId, r]));
  const sets = await db.select().from(S).where(and(eq(S.workoutId, workout.id), eq(S.completed, true), ne(S.setType, 'warmup'))).orderBy(asc(S.position)).all();
  const changes = [];
  for (const item of items) {
    const st = states.get(item.id);
    const mine = sets.filter((x) => x.exerciseId === item.id);
    if (!st || !mine.length) continue;   // skipped: no verdict, the last reason stays
    const patch = advanceFor(program, item.ex, st, mine, { weekIndex }) || {};
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

// ── Recommendations ─────────────────────────────────────────────────────────────

// Program recommendations: a transparent score of each built-in program against the
// user's training profile (experience, equipment, days a week, session length, goal)
// and what their log says about their level. Reasons go to the app as translation
// keys with params; every key is in REASONS (ru/uz in src/i18n/social.js).

const LEVELS = ['new', 'some', 'experienced'];
const SIGNAL_WEEKS = 16;
const POINTS = { days: 40, nearDays: 20, level: 30, session: 15, goal: 10, equipment: 10 };

export const REASONS = {
  days:        'Fits your {n} days a week',
  nearDays:    '{n} days a week, close to your {m}',
  new:         'Made for beginners',
  some:        'For lifters with some experience',
  experienced: 'For experienced lifters',
  inferred:    'Your log shows steady training',
  session:     'Sessions fit in {n} min',
  dumbbells:   'Built for dumbbells only',
  home:        'No equipment needed',
  bulk:        'Plenty of volume for building muscle',
  cut:         'Keeps strength up while you cut',
};

// The level a training log suggests: active weeks (2+ workouts) in the last 16 weeks
// and strength relative to body weight. Never used to move a user down.
export function inferLevel({ activeWeeks, squatRatio, benchRatio }) {
  if (activeWeeks >= 12 && (squatRatio >= 1.5 || benchRatio >= 1.1)) return 'experienced';
  if (activeWeeks >= 8 || squatRatio >= 1.0) return 'some';
  return 'new';
}

// profile: { experience, equipment, workoutsPerWeek, sessionMinutes, goal }
// → up to 3 [{ code, score, reasons: [{ key, params }] }], best first.
export function recommendPrograms(profile, signals, programs) {
  if (!profile.experience || !profile.equipment) return [];
  const inferred = inferLevel(signals);
  const raised = LEVELS.indexOf(inferred) > LEVELS.indexOf(profile.experience);
  const level = raised ? inferred : profile.experience;
  const out = [];
  for (const [order, p] of programs.entries()) {
    if (!p.equipment.includes(profile.equipment)) continue;   // templates list only equipment every required exercise resolves for
    if (LEVELS.indexOf(level) < Math.min(...p.levels.map((l) => LEVELS.indexOf(l)))) continue;   // too advanced
    const days = daysPerWeek(p);
    const gap = Math.abs(days - profile.workoutsPerWeek);
    if (gap > 1) continue;
    const reasons = [];
    let score = 0;
    if (gap === 0) { score += POINTS.days; reasons.push({ key: REASONS.days, params: { n: days } }); }
    else { score += POINTS.nearDays; reasons.push({ key: REASONS.nearDays, params: { n: days, m: profile.workoutsPerWeek } }); }
    if (p.levels.includes(level)) {
      score += POINTS.level;
      reasons.push({ key: raised ? REASONS.inferred : REASONS[level], params: {} });
    }
    const plan = resolveProgram(p, { equipment: profile.equipment, sessionMinutes: profile.sessionMinutes });   // optional exercises trimmed to fit
    const minutes = Math.ceil(Math.max(...plan.days.map((d) => d.minutes)) / 5) * 5;
    if (p.equipment[0] === profile.equipment) {   // made for exactly this setup, not just possible with it
      score += POINTS.equipment;
      if (profile.equipment !== 'gym') reasons.push({ key: REASONS[profile.equipment], params: {} });
    }
    if (profile.sessionMinutes && minutes <= profile.sessionMinutes) { score += POINTS.session; reasons.push({ key: REASONS.session, params: { n: minutes } }); }
    if ((profile.goal === 'bulk' && p.volume === 'high') || (profile.goal === 'cut' && p.volume === 'moderate')) {
      score += POINTS.goal;
      reasons.push({ key: REASONS[profile.goal], params: {} });
    }
    out.push({ code: p.code, score, order, reasons: reasons.slice(0, 3) });
  }
  return out.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, 3).map(({ order, ...r }) => r);
}

// What the log says: active weeks and best e1RM ÷ body weight on squat and bench.
export async function trainingSignals(user) {
  const now = today(user);
  const from = addDays(now, -SIGNAL_WEEKS * 7);
  const dates = await db.select({ d: W.localDate }).from(W).where(and(eq(W.userId, user.id), isNotNull(W.endedAt), gte(W.localDate, from))).all();
  const perWeek = new Map();
  for (const { d } of dates) { const k = weekStart(d); perWeek.set(k, (perWeek.get(k) || 0) + 1); }
  const activeWeeks = [...perWeek.values()].filter((n) => n >= 2).length;

  const lifts = await db.select({ id: T.exercises.id, name: T.exercises.name }).from(T.exercises)
    .where(and(eq(T.exercises.userId, 0), inArray(T.exercises.name, ['Back Squat', 'Barbell Bench Press']))).all();
  const bodyKg = await latestWeightKg(user.id);
  const ratio = { 'Back Squat': 0, 'Barbell Bench Press': 0 };
  if (bodyKg && lifts.length) {
    const rows = await db.select({ exerciseId: S.exerciseId, e1rm: S.e1rmKg }).from(S)
      .where(and(eq(S.userId, user.id), inArray(S.exerciseId, lifts.map((l) => l.id)), eq(S.completed, true), atOrAfter(S.completedAt, new Date(Date.now() - STRENGTH_DAYS * 86400e3)))).all();
    for (const l of lifts) ratio[l.name] = rows.filter((r) => r.exerciseId === l.id).reduce((m, r) => Math.max(m, r.e1rm || 0), 0) / bodyKg;
  }
  return { activeWeeks, squatRatio: ratio['Back Squat'], benchRatio: ratio['Barbell Bench Press'] };
}
