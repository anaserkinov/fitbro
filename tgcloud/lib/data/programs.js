// Built-in multi-week programs — plain data and the math that prescribes each week's
// sets. Shared by lib/programs.js (enrolment, workout pre-fill) and the Mini App.
// Exercise names are built-in catalogue names. Day and program names are English
// translation keys (tgcloud/lib/i18n/friends.js); routines get them in the user's
// language when created.
//
// prescribe() returns the planned sets for one exercise in one week:
//   [{ weightKg, reps, setType }] — weightKg null when there's nothing to go on yet.

const STEP = 2.5;
export const roundTo = (kg, step = STEP) => (kg === null || kg === undefined ? null : Math.round(kg / step) * step);

// Linear progression: the last session's working weight, plus `inc` when every
// working set reached the target reps.
function linear(ex, previous) {
  const work = previous.filter((s) => s.weightKg > 0);
  if (!work.length) return { weightKg: null, reps: ex.reps };
  const weight = Math.max(...work.map((s) => s.weightKg));
  const hit = work.length >= ex.sets && work.every((s) => (s.reps ?? 0) >= ex.reps);
  return { weightKg: roundTo(hit ? weight + ex.inc : weight), reps: ex.reps };
}

// Double progression in a rep range: add a rep each session at the same weight; once
// every set reaches the top of the range, add weight and start again at the bottom.
function double(ex, previous) {
  const work = previous.filter((s) => s.weightKg > 0);
  if (!work.length) return { weightKg: null, reps: ex.repsMin };
  const weight = Math.max(...work.map((s) => s.weightKg));
  const atWeight = work.filter((s) => s.weightKg === weight);
  const low = Math.min(...atWeight.map((s) => s.reps ?? 0));
  if (atWeight.length >= ex.sets && low >= ex.repsMax) return { weightKg: roundTo(weight + ex.inc), reps: ex.repsMin };
  return { weightKg: weight, reps: Math.min(ex.repsMax, Math.max(ex.repsMin, low + 1)) };
}

const sets = (n, weightKg, reps) => Array.from({ length: n }, () => ({ weightKg, reps, setType: 'working' }));

// 5/3/1 main-lift weeks: [% of training max, reps]; the last set of weeks 1–3 is "as
// many reps as possible" (the planned reps are the minimum).
const WAVE = [
  [[0.65, 5], [0.75, 5], [0.85, 5]],
  [[0.70, 3], [0.80, 3], [0.90, 3]],
  [[0.75, 5], [0.85, 3], [0.95, 1]],
  [[0.40, 5], [0.50, 5], [0.60, 5]],   // deload
];

export const PROGRAMS = [
  {
    code: 'full_body_beginner',
    name: 'Beginner full body',
    about: 'Three full-body sessions a week. Add weight every time you hit all your reps.',
    weeks: 8,
    schedule: { 1: 0, 3: 1, 5: 0 },   // weekday → day index
    days: [
      { name: 'Full body A', exercises: [
        { name: 'Back Squat', sets: 3, reps: 5, inc: 5 },
        { name: 'Barbell Bench Press', sets: 3, reps: 5, inc: 2.5 },
        { name: 'Barbell Row', sets: 3, reps: 5, inc: 2.5 },
      ] },
      { name: 'Full body B', exercises: [
        { name: 'Back Squat', sets: 3, reps: 5, inc: 5 },
        { name: 'Overhead Press', sets: 3, reps: 5, inc: 2.5 },
        { name: 'Deadlift', sets: 1, reps: 5, inc: 5 },
      ] },
    ],
    prescribe(ex, { previous }) {
      const p = linear(ex, previous);
      return sets(ex.sets, p.weightKg, p.reps);
    },
  },
  {
    code: 'ppl_12',
    name: 'Push Pull Legs',
    about: 'Six days a week for 12 weeks. Work up through each rep range, then add weight. Every 4th week is lighter.',
    weeks: 12,
    schedule: { 1: 0, 2: 1, 3: 2, 4: 0, 5: 1, 6: 2 },
    deloadEvery: 4,
    days: [
      { name: 'Push', exercises: [
        { name: 'Barbell Bench Press', sets: 4, repsMin: 6, repsMax: 8, inc: 2.5 },
        { name: 'Overhead Press', sets: 3, repsMin: 8, repsMax: 10, inc: 2.5 },
        { name: 'Incline Dumbbell Press', sets: 3, repsMin: 8, repsMax: 12, inc: 2 },
        { name: 'Lateral Raise', sets: 3, repsMin: 12, repsMax: 15, inc: 1 },
        { name: 'Triceps Pushdown', sets: 3, repsMin: 10, repsMax: 12, inc: 2.5 },
      ] },
      { name: 'Pull', exercises: [
        { name: 'Barbell Row', sets: 4, repsMin: 6, repsMax: 8, inc: 2.5 },
        { name: 'Lat Pulldown', sets: 3, repsMin: 8, repsMax: 12, inc: 2.5 },
        { name: 'Seated Cable Row', sets: 3, repsMin: 10, repsMax: 12, inc: 2.5 },
        { name: 'Face Pull', sets: 3, repsMin: 12, repsMax: 15, inc: 2.5 },
        { name: 'Barbell Curl', sets: 3, repsMin: 8, repsMax: 12, inc: 2.5 },
      ] },
      { name: 'Legs', exercises: [
        { name: 'Back Squat', sets: 4, repsMin: 6, repsMax: 8, inc: 5 },
        { name: 'Romanian Deadlift', sets: 3, repsMin: 8, repsMax: 10, inc: 5 },
        { name: 'Leg Press', sets: 3, repsMin: 10, repsMax: 12, inc: 10 },
        { name: 'Lying Leg Curl', sets: 3, repsMin: 10, repsMax: 12, inc: 2.5 },
        { name: 'Standing Calf Raise', sets: 4, repsMin: 10, repsMax: 15, inc: 5 },
      ] },
    ],
    prescribe(ex, { previous, weekIndex }) {
      if ((weekIndex + 1) % 4 === 0) {   // deload: 60% of the sets, no added weight
        const work = previous.filter((s) => s.weightKg > 0);
        return sets(Math.max(1, Math.round(ex.sets * 0.6)), work.length ? Math.max(...work.map((s) => s.weightKg)) : null, ex.repsMin);
      }
      const p = double(ex, previous);
      return sets(ex.sets, p.weightKg, p.reps);
    },
  },
  {
    code: 'wendler_531',
    name: '5/3/1',
    about: 'Four days a week in 4-week waves built on your training max. The last main set: as many reps as you can. The training max goes up after every wave.',
    weeks: null,   // repeats until you leave
    cycleWeeks: 4,
    needsMaxes: ['ohp', 'deadlift', 'bench', 'squat'],
    schedule: { 1: 0, 2: 1, 4: 2, 5: 3 },
    days: [
      { name: 'Overhead press day', exercises: [
        { name: 'Overhead Press', main: 'ohp', inc: 2.5 },
        { name: 'Lat Pulldown', sets: 5, reps: 10 },
      ] },
      { name: 'Deadlift day', exercises: [
        { name: 'Deadlift', main: 'deadlift', inc: 5 },
        { name: 'Hanging Leg Raise', sets: 5, reps: 10 },
      ] },
      { name: 'Bench day', exercises: [
        { name: 'Barbell Bench Press', main: 'bench', inc: 2.5 },
        { name: 'Dumbbell Row', sets: 5, reps: 10 },
      ] },
      { name: 'Squat day', exercises: [
        { name: 'Back Squat', main: 'squat', inc: 5 },
        { name: 'Lying Leg Curl', sets: 5, reps: 10 },
      ] },
    ],
    prescribe(ex, { previous, weekIndex, trainingMaxes }) {
      if (!ex.main) {   // assistance: same weight as last time
        const work = previous.filter((s) => s.weightKg > 0);
        return sets(ex.sets, work.length ? Math.max(...work.map((s) => s.weightKg)) : null, ex.reps);
      }
      const base = trainingMaxes && trainingMaxes[ex.main];
      const tm = base ? base + Math.floor(weekIndex / 4) * ex.inc : null;
      return WAVE[weekIndex % 4].map(([pct, reps]) => ({ weightKg: tm ? roundTo(tm * pct) : null, reps, setType: 'working' }));
    },
  },
];

export const PROGRAM_BY_CODE = Object.fromEntries(PROGRAMS.map((p) => [p.code, p]));

// Training max = 90% of a one-rep max, rounded to the plate step.
export const trainingMax = (oneRepMaxKg) => (oneRepMaxKg ? roundTo(oneRepMaxKg * 0.9) : null);

// Where a program stands in a given week (0-based index from the start date).
export function weekInfo(program, weekIndex) {
  if (program.cycleWeeks) {
    const w = weekIndex % program.cycleWeeks;
    return { week: w + 1, of: program.cycleWeeks, cycle: Math.floor(weekIndex / program.cycleWeeks) + 1, deload: w === program.cycleWeeks - 1, finished: false };
  }
  return { week: weekIndex + 1, of: program.weeks, cycle: null, deload: !!program.deloadEvery && (weekIndex + 1) % program.deloadEvery === 0, finished: weekIndex >= program.weeks };
}
