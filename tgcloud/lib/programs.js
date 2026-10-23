import { db } from 'sdk';
import { eq, and, inArray, isNull, desc } from 'sdk/db';
import { atOrAfter } from './db-util.js';
import * as T from '../schema.js';
import * as v from './validate.js';
import { today } from './users.js';
import { daysBetween } from './dates.js';
import { tr } from './i18n/bot.js';
import { saveRoutine, saveSchedule, archiveRoutine } from './routines.js';
import { PROGRAMS, PROGRAM_BY_CODE, trainingMax, weekInfo } from './data/programs.js';

// Multi-week programs. Enrolling turns a template into ordinary routines plus a weekly
// schedule; starting one of those routines pre-fills that week's prescribed sets
// (programPlan, used by workouts.js). A fixed-length program ends itself the first
// time it's looked at after its last week, with the same cleanup as leaving.

const PE = T.programEnrollments, R = T.routines;
const STRENGTH_DAYS = 90;

async function catalogIds(names) {
  const rows = await db.select({ id: T.exercises.id, name: T.exercises.name }).from(T.exercises)
    .where(and(eq(T.exercises.userId, 0), inArray(T.exercises.name, [...new Set(names)]))).all();
  return new Map(rows.map((r) => [r.name, r.id]));
}

// Best estimated 1RM per 5/3/1 lift in the last 90 days — the suggested maxes.
async function suggestedMaxes(user) {
  const lifts = { ohp: 'Overhead Press', deadlift: 'Deadlift', bench: 'Barbell Bench Press', squat: 'Back Squat' };
  const ids = await catalogIds(Object.values(lifts));
  const S = T.sets;
  const rows = ids.size ? await db.select({ exerciseId: S.exerciseId, e1rm: S.e1rmKg }).from(S)
    .where(and(eq(S.userId, user.id), inArray(S.exerciseId, [...ids.values()]), eq(S.completed, true), atOrAfter(S.completedAt, new Date(Date.now() - STRENGTH_DAYS * 86400e3)))).all() : [];
  const out = {};
  for (const [key, name] of Object.entries(lifts)) {
    const best = rows.filter((r) => r.exerciseId === ids.get(name) && r.e1rm).reduce((m, r) => Math.max(m, r.e1rm), 0);
    out[key] = best || null;
  }
  return out;
}

const describe = (p) => ({
  code: p.code, name: p.name, about: p.about, weeks: p.weeks, cycleWeeks: p.cycleWeeks || null,
  daysPerWeek: Object.keys(p.schedule).length, needsMaxes: p.needsMaxes || null,
  days: p.days.map((d) => ({ name: d.name, exercises: d.exercises.map((e) => e.name) })),
  schedule: p.schedule,
});

async function activeEnrollment(userId) {
  return db.select().from(PE).where(and(eq(PE.userId, userId), isNull(PE.endedAt))).get();
}

const weekIndexOf = (user, e) => Math.max(0, Math.floor(daysBetween(e.startDate, today(user)) / 7));

async function endEnrollment(user, e) {
  const routines = await db.select({ id: R.id }).from(R).where(and(eq(R.userId, user.id), eq(R.programEnrollmentId, e.id), isNull(R.archivedAt))).all();
  for (const r of routines) await archiveRoutine(user, { id: r.id });   // also clears their schedule days
  await db.update(PE).set({ endedAt: new Date() }).where(eq(PE.id, e.id)).run();
}

// The active enrolment, ending it first if a fixed-length program has run its course.
async function currentEnrollment(user) {
  const e = await activeEnrollment(user.id);
  if (!e) return null;
  const program = PROGRAM_BY_CODE[e.programCode];
  if (!program || weekInfo(program, weekIndexOf(user, e)).finished) {
    await endEnrollment(user, e);
    return null;
  }
  return { e, program };
}

export async function listPrograms(user) {
  const current = await currentEnrollment(user);
  return { programs: PROGRAMS.map(describe), activeCode: current ? current.e.programCode : null, suggestedMaxes: await suggestedMaxes(user) };
}

export async function getMyProgram(user) {
  const current = await currentEnrollment(user);
  if (!current) {
    const last = await db.select().from(PE).where(eq(PE.userId, user.id)).orderBy(desc(PE.id)).limit(1).get();
    return { program: null, lastEnded: last ? { code: last.programCode, endedAt: last.endedAt } : null };
  }
  const { e, program } = current;
  const weekIndex = weekIndexOf(user, e);
  const routines = await db.select().from(R).where(and(eq(R.userId, user.id), eq(R.programEnrollmentId, e.id), isNull(R.archivedAt))).all();
  return {
    program: describe(program),
    enrollment: { id: e.id, startDate: e.startDate, trainingMaxes: e.trainingMaxes },
    weekIndex, ...weekInfo(program, weekIndex),
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

  const ids = await catalogIds(program.days.flatMap((d) => d.exercises.map((e) => e.name)));
  const t = tr(user);
  const [e] = await db.insert(PE).values({ userId: user.id, programCode: program.code, startDate: today(user), trainingMaxes }).returning();
  const routineIds = [];
  for (const [i, day] of program.days.entries()) {
    const items = day.exercises.filter((x) => ids.has(x.name)).map((x) => ({
      exerciseId: ids.get(x.name),
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

// For startWorkout: when `routine` belongs to the active program, a function giving the
// planned sets for one of its exercises this week (or null to use routine targets).
export async function programPlan(user, routine) {
  if (!routine || !routine.programEnrollmentId) return null;
  const current = await currentEnrollment(user);
  if (!current || current.e.id !== routine.programEnrollmentId) return null;
  const { e, program } = current;
  const day = program.days[routine.programDay];
  if (!day) return null;
  const ids = await catalogIds(day.exercises.map((x) => x.name));
  const weekIndex = weekIndexOf(user, e);
  return (exerciseId, previous) => {
    const ex = day.exercises.find((x) => ids.get(x.name) === exerciseId);
    return ex ? program.prescribe(ex, { previous, weekIndex, trainingMaxes: e.trainingMaxes }) : null;
  };
}

// True when a workout's routine came from a program (its routine targets don't apply).
export async function isProgramRoutine(routineId) {
  if (!routineId) return false;
  const r = await db.select({ pe: R.programEnrollmentId }).from(R).where(eq(R.id, routineId)).get();
  return !!(r && r.pe);
}
