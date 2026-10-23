// Built-in multi-week programs — plain data and the math that prescribes each week's
// sets. Shared by lib/programs.js (enrolment, workout pre-fill, progression) and the
// Mini App. Exercise names are built-in catalogue names. Day and program names are
// English translation keys (tgcloud/lib/i18n/friends.js); routines get them in the
// user's language when created. Templates are append-only (see the plan): active
// enrolments index days and exercises by position.
//
// Each program exercise has a lift state (a program_lifts row):
//   { workingKg, reps, misses, cycle, source }
// source: 'entered' (typed 1RM) | 'history' | 'calibrated' | 'guess' (nothing known yet:
// the next session calibrates it) | 'reps' (bodyweight: only a rep target).
//
// prescribe(ex, { state, weekIndex }) → planned sets [{ weightKg, reps, setType }].
// advance(ex, state, done, { weekIndex }) → a state patch (+ `change` for the user) after
//   a session, or null for "no verdict". `done` = that exercise's completed working sets.
// roll(ex, state, weekIndex) (optional) → a patch when a new cycle starts, or null.
// Bodyweight exercises skip both and progress by reps (planFor / advanceFor).

const STEP = 2.5;
export const roundTo = (kg, step = STEP) => (kg === null || kg === undefined ? null : Math.round(kg / step) * step);
export const roundDown = (kg, step = STEP) => Math.floor(kg / step + 1e-9) * step;

const MISS_LIMIT = 3;     // missed sessions in a row before the weight drops back
const RESET = 0.9;        // …to 90%
const RIR_DEFAULT = 1;    // reps left when the user didn't say: errs on the light side

// Estimated 1RM from a set and the reps it had left (Epley on reps + reps in reserve).
export function e1rmWithRir(set) {
  const rir = set.rir ?? (set.rpe ? Math.max(0, 10 - set.rpe) : RIR_DEFAULT);
  return set.weightKg * (1 + Math.min(15, set.reps + rir) / 30);
}

// The weight that leaves about 2 reps in the tank at `reps` reps.
export const workingWeight = (oneRepMaxKg, reps) => roundTo(oneRepMaxKg / (1 + (reps + 2) / 30));

// Training max = 90% of a one-rep max, rounded to the plate step.
export const trainingMax = (oneRepMaxKg) => (oneRepMaxKg ? roundTo(oneRepMaxKg * 0.9) : null);

// A starting weight from an estimated 1RM (history or calibration).
export const fromOneRepMax = (ex, oneRepMaxKg) => (ex.main ? trainingMax(oneRepMaxKg) : workingWeight(oneRepMaxKg, ex.repsMin ?? ex.reps));

// First-session guess: working weight as a share of body weight, by movement. Kept
// low on purpose — calibration replaces it the same day.
const STARTER = { squat: 0.5, hinge: 0.6, h_press: 0.4, v_press: 0.25, h_pull: 0.35 };
const FEMALE = 0.6;

export function guessKg(ex, { sex, bodyKg }) {
  const ratio = STARTER[ex.pattern];
  if (!ratio || !bodyKg) return null;
  const kg = roundDown(bodyKg * ratio * (sex === 'female' ? FEMALE : 1));
  return ex.main ? roundDown(kg / 0.65) : kg;   // 5/3/1 lifts start from 65% of the training max
}

export const initialReps = (ex) => ex.repsMin ?? ex.reps ?? null;

const sets = (n, weightKg, reps) => Array.from({ length: n }, () => ({ weightKg, reps, setType: 'working' }));
const kgOf = (state) => (state ? state.workingKg : null);
const repsOf = (ex, state) => (state && state.reps) || initialReps(ex);

// ── Advance building blocks ─────────────────────────────────────────────────────

// Last working set logged as all-out: hold the weight even when every rep was hit.
const allOut = (done) => { const last = done[done.length - 1]; return !!last && (last.rir === 0 || (last.rpe ?? 0) >= 9.5); };

const change = (kind, fromKg, toKg) => ({ kind, fromKg: fromKg ?? null, toKg: toKg ?? null });
const up = (s, from, inc, reps) => { const kg = roundTo(from + inc); return { workingKg: kg, reps, misses: 0, change: change('up', s.workingKg, kg) }; };
const hold = (s, at, reps) => ({ workingKg: at, reps, misses: 0, change: change('hold', s.workingKg, at) });
function miss(s, at, resetReps) {
  const misses = (s.misses || 0) + 1;
  if (misses < MISS_LIMIT) return { workingKg: at, misses, change: null };
  const kg = roundDown(at * RESET);
  return { workingKg: kg, reps: resetReps, misses: 0, change: change('reset', at, kg) };
}

// Working sets at (or above) the planned weight; null when the user went lighter — no verdict.
function atPlan(s, done) {
  const work = done.filter((x) => x.weightKg > 0 && x.reps > 0);
  if (!work.length) return null;
  const top = Math.max(...work.map((x) => x.weightKg));
  if (s.workingKg && top < s.workingKg - 0.01) return null;
  return { top, work: work.filter((x) => x.weightKg >= top - 0.01) };
}

// First session with nothing to go on: the heaviest honest set sets the weight.
function calibrate(ex, s, done) {
  const work = done.filter((x) => x.weightKg > 0 && x.reps > 0);
  if (!work.length) return null;
  const kg = fromOneRepMax(ex, Math.max(...work.map(e1rmWithRir)));
  return { workingKg: kg, reps: initialReps(ex), misses: 0, source: 'calibrated', change: change('calibrated', s.workingKg, kg) };
}

// Linear: every set at the target reps → +inc next time.
function linear(ex, s, done) {
  const p = atPlan(s, done);
  if (!p) return null;
  const hit = p.work.length >= ex.sets && p.work.every((x) => x.reps >= ex.reps);
  if (hit) return allOut(p.work) ? hold(s, p.top, ex.reps) : up(s, p.top, ex.inc, ex.reps);
  return miss(s, p.top, ex.reps);
}

// Double progression in a rep range: a rep more each session at the same weight; once
// every set reaches the top, add weight and start again at the bottom.
function double(ex, s, done) {
  const p = atPlan(s, done);
  if (!p) return null;
  const low = Math.min(...p.work.map((x) => x.reps));
  const full = p.work.length >= ex.sets;
  if (full && low >= ex.repsMax) return allOut(p.work) ? hold(s, p.top, ex.repsMax) : up(s, p.top, ex.inc, ex.repsMin);
  if (full && low >= repsOf(ex, s)) return { workingKg: p.top, reps: Math.min(ex.repsMax, low + 1), misses: 0, change: null };
  return miss(s, p.top, ex.repsMin);
}

// Same weight each time; a heavier weight the user chose (with all reps) becomes the new one.
function steady(ex, s, done) {
  const p = atPlan(s, done);
  if (!p || !(p.work.length >= ex.sets && p.work.every((x) => x.reps >= ex.reps)) || p.top <= (s.workingKg || 0)) return null;
  return { workingKg: p.top, misses: 0, change: null };
}

const progress = (rule) => (ex, s, done, ctx) => (s.source === 'guess' ? calibrate(ex, s, done) : rule(ex, s, done, ctx));

// 5/3/1 main-lift weeks: [% of training max, reps]; the last set of weeks 1–3 is "as
// many reps as possible" (the planned reps are the minimum).
const WAVE = [
  [[0.65, 5], [0.75, 5], [0.85, 5]],
  [[0.70, 3], [0.80, 3], [0.90, 3]],
  [[0.75, 5], [0.85, 3], [0.95, 1]],
  [[0.40, 5], [0.50, 5], [0.60, 5]],   // deload
];

// A program whose exercises follow their own rule: double progression when the
// exercise has a rep range, linear otherwise. `deloadEvery` weeks: 60% of the sets at
// the same weight, and the session never advances.
function standard({ deloadEvery = null } = {}) {
  const isDeload = (w) => !!deloadEvery && (w + 1) % deloadEvery === 0;
  return {
    deloadEvery,
    prescribe: (ex, { state, weekIndex }) => (isDeload(weekIndex)
      ? sets(Math.max(1, Math.round(ex.sets * 0.6)), kgOf(state), initialReps(ex))
      : sets(ex.sets, kgOf(state), repsOf(ex, state))),
    advance: (ex, s, done, ctx) => (isDeload(ctx.weekIndex) ? null : progress(ex.repsMax ? double : linear)(ex, s, done, ctx)),
  };
}

// Template exercises: `slot` (SLOTS, below) lets enrolling swap in an exercise
// the user's equipment allows; `optional` ones are dropped first to fit a session
// length. `pattern` (barbell lifts only) drives the first-session guess.
export const PROGRAMS = [
  {
    code: 'full_body_beginner',
    name: 'Beginner full body',
    about: 'Three full-body sessions a week. Add weight every time you hit all your reps.',
    weeks: 8,
    levels: ['new'], equipment: ['gym'], volume: 'moderate',   // who it suits (recommendPrograms in lib/programs.js)
    schedule: { 1: 0, 3: 1, 5: 0 },   // weekday → day index
    days: [
      { name: 'Full body A', exercises: [
        { name: 'Back Squat', slot: 'squat', pattern: 'squat', sets: 3, reps: 5, inc: 5 },
        { name: 'Barbell Bench Press', slot: 'h_press', pattern: 'h_press', sets: 3, reps: 5, inc: 2.5 },
        { name: 'Barbell Row', slot: 'h_pull', pattern: 'h_pull', sets: 3, reps: 5, inc: 2.5 },
      ] },
      { name: 'Full body B', exercises: [
        { name: 'Back Squat', slot: 'squat', pattern: 'squat', sets: 3, reps: 5, inc: 5 },
        { name: 'Overhead Press', slot: 'v_press', pattern: 'v_press', sets: 3, reps: 5, inc: 2.5 },
        { name: 'Deadlift', slot: 'hinge', pattern: 'hinge', sets: 1, reps: 5, inc: 5 },
      ] },
    ],
    ...standard(),
  },
  {
    code: 'ppl_12',
    name: 'Push Pull Legs',
    about: 'Six days a week for 12 weeks. Work up through each rep range, then add weight. Every 4th week is lighter.',
    weeks: 12,
    levels: ['some', 'experienced'], equipment: ['gym'], volume: 'high',
    schedule: { 1: 0, 2: 1, 3: 2, 4: 0, 5: 1, 6: 2 },
    days: [
      { name: 'Push', exercises: [
        { name: 'Barbell Bench Press', slot: 'h_press', pattern: 'h_press', sets: 4, repsMin: 6, repsMax: 8, inc: 2.5 },
        { name: 'Overhead Press', slot: 'v_press', pattern: 'v_press', sets: 3, repsMin: 8, repsMax: 10, inc: 2.5 },
        { name: 'Incline Dumbbell Press', slot: 'incline', sets: 3, repsMin: 8, repsMax: 12, inc: 2 },
        { name: 'Lateral Raise', slot: 'lateral', sets: 3, repsMin: 12, repsMax: 15, inc: 1, optional: true },
        { name: 'Triceps Pushdown', slot: 'triceps', sets: 3, repsMin: 10, repsMax: 12, inc: 2.5, optional: true },
      ] },
      { name: 'Pull', exercises: [
        { name: 'Barbell Row', slot: 'h_pull', pattern: 'h_pull', sets: 4, repsMin: 6, repsMax: 8, inc: 2.5 },
        { name: 'Lat Pulldown', slot: 'v_pull', sets: 3, repsMin: 8, repsMax: 12, inc: 2.5 },
        { name: 'Seated Cable Row', slot: 'cable_row', sets: 3, repsMin: 10, repsMax: 12, inc: 2.5, optional: true },
        { name: 'Face Pull', slot: 'rear_delt', sets: 3, repsMin: 12, repsMax: 15, inc: 2.5, optional: true },
        { name: 'Barbell Curl', slot: 'biceps', sets: 3, repsMin: 8, repsMax: 12, inc: 2.5, optional: true },
      ] },
      { name: 'Legs', exercises: [
        { name: 'Back Squat', slot: 'squat', pattern: 'squat', sets: 4, repsMin: 6, repsMax: 8, inc: 5 },
        { name: 'Romanian Deadlift', slot: 'rdl', pattern: 'hinge', sets: 3, repsMin: 8, repsMax: 10, inc: 5 },
        { name: 'Leg Press', slot: 'leg_press', sets: 3, repsMin: 10, repsMax: 12, inc: 10 },
        { name: 'Lying Leg Curl', slot: 'leg_curl', sets: 3, repsMin: 10, repsMax: 12, inc: 2.5, optional: true },
        { name: 'Standing Calf Raise', slot: 'calf', sets: 4, repsMin: 10, repsMax: 15, inc: 5, optional: true },
      ] },
    ],
    ...standard({ deloadEvery: 4 }),
  },
  {
    code: 'wendler_531',
    name: '5/3/1',
    about: 'Four days a week in 4-week waves built on your training max. The last main set: as many reps as you can. The training max goes up after every wave.',
    weeks: null,   // repeats until you leave
    cycleWeeks: 4,
    needsMaxes: ['ohp', 'deadlift', 'bench', 'squat'],
    levels: ['some', 'experienced'], equipment: ['gym'], volume: 'moderate',
    schedule: { 1: 0, 2: 1, 4: 2, 5: 3 },
    days: [
      { name: 'Overhead press day', exercises: [
        { name: 'Overhead Press', pattern: 'v_press', main: 'ohp', inc: 2.5 },
        { name: 'Lat Pulldown', slot: 'v_pull', sets: 5, reps: 10, optional: true },
      ] },
      { name: 'Deadlift day', exercises: [
        { name: 'Deadlift', pattern: 'hinge', main: 'deadlift', inc: 5 },
        { name: 'Hanging Leg Raise', slot: 'core', sets: 5, reps: 10, optional: true },
      ] },
      { name: 'Bench day', exercises: [
        { name: 'Barbell Bench Press', pattern: 'h_press', main: 'bench', inc: 2.5 },
        { name: 'Dumbbell Row', slot: 'h_pull', sets: 5, reps: 10, optional: true },
      ] },
      { name: 'Squat day', exercises: [
        { name: 'Back Squat', pattern: 'squat', main: 'squat', inc: 5 },
        { name: 'Lying Leg Curl', slot: 'leg_curl', sets: 5, reps: 10, optional: true },
      ] },
    ],
    // Main lifts: the state's workingKg is the training max for the current wave.
    prescribe(ex, { state, weekIndex }) {
      if (!ex.main) return sets(ex.sets, kgOf(state), ex.reps);
      const tm = kgOf(state);
      return WAVE[weekIndex % 4].map(([pct, reps]) => ({ weightKg: tm ? roundTo(tm * pct) : null, reps, setType: 'working' }));
    },
    // The AMRAP set falling short of its reps marks the wave (misses = 1); roll() decides.
    advance(ex, s, done, { weekIndex }) {
      if (!ex.main) return progress(steady)(ex, s, done);
      const w = weekIndex % 4;
      if (w === 3) return null;
      if (s.source === 'guess') return calibrate(ex, s, done);
      const last = WAVE[w][2];
      const top = done.filter((x) => s.workingKg && x.weightKg >= roundTo(s.workingKg * last[0]) - 0.01);
      if (!top.length) return null;
      return Math.max(...top.map((x) => x.reps || 0)) < last[1] ? { misses: 1, change: null } : null;
    },
    // A new wave: training max +inc, or back to 90% after a short AMRAP.
    roll(ex, s, weekIndex) {
      if (!ex.main) return null;
      const cycle = Math.floor(weekIndex / 4);
      if (s.cycle !== null && s.cycle !== undefined && cycle <= s.cycle) return null;
      if (!s.workingKg || s.cycle === null || s.cycle === undefined) return { cycle, change: null };
      if (s.misses) { const kg = roundDown(s.workingKg * RESET); return { workingKg: kg, misses: 0, cycle, change: change('reset', s.workingKg, kg) }; }
      const kg = roundTo(s.workingKg + (cycle - s.cycle) * ex.inc);
      return { workingKg: kg, misses: 0, cycle, change: change('up', s.workingKg, kg) };
    },
  },
  {
    code: 'full_body_2day',
    name: 'Two-day full body',
    about: 'Two full-body sessions a week for busy weeks. Main lifts go up by weight, the rest through a rep range.',
    weeks: 8,
    levels: ['new', 'some'], equipment: ['gym', 'dumbbells'], volume: 'moderate',
    schedule: { 1: 0, 4: 1 },
    days: [
      { name: 'Full body A', exercises: [
        { name: 'Back Squat', slot: 'squat', pattern: 'squat', sets: 3, reps: 5, inc: 5 },
        { name: 'Barbell Bench Press', slot: 'h_press', pattern: 'h_press', sets: 3, reps: 5, inc: 2.5 },
        { name: 'Barbell Row', slot: 'h_pull', pattern: 'h_pull', sets: 3, repsMin: 8, repsMax: 12, inc: 2.5 },
        { name: 'Dumbbell Curl', slot: 'biceps', sets: 2, repsMin: 10, repsMax: 15, inc: 1, optional: true },
        { name: 'Crunch', slot: 'core', sets: 2, repsMin: 12, repsMax: 20, optional: true },
      ] },
      { name: 'Full body B', exercises: [
        { name: 'Deadlift', slot: 'hinge', pattern: 'hinge', sets: 3, reps: 5, inc: 5 },
        { name: 'Overhead Press', slot: 'v_press', pattern: 'v_press', sets: 3, reps: 5, inc: 2.5 },
        { name: 'Lat Pulldown', slot: 'v_pull', sets: 3, repsMin: 8, repsMax: 12, inc: 2.5, optional: true },
        { name: 'Walking Lunge', slot: 'lunge', sets: 2, repsMin: 10, repsMax: 12, inc: 2, optional: true },
        { name: 'Lateral Raise', slot: 'lateral', sets: 2, repsMin: 12, repsMax: 15, inc: 1, optional: true },
      ] },
    ],
    ...standard(),
  },
  {
    code: 'upper_lower_4',
    name: 'Upper/lower',
    about: 'Four days a week for 10 weeks: a heavy and a lighter day for each half of the body. Every 5th week is lighter.',
    weeks: 10,
    levels: ['some', 'experienced'], equipment: ['gym'], volume: 'high',
    schedule: { 1: 0, 2: 1, 4: 2, 5: 3 },
    days: [
      { name: 'Upper (heavy)', exercises: [
        { name: 'Barbell Bench Press', slot: 'h_press', pattern: 'h_press', sets: 4, reps: 5, inc: 2.5 },
        { name: 'Barbell Row', slot: 'h_pull', pattern: 'h_pull', sets: 4, reps: 5, inc: 2.5 },
        { name: 'Overhead Press', slot: 'v_press', pattern: 'v_press', sets: 3, repsMin: 8, repsMax: 10, inc: 2.5 },
        { name: 'Lat Pulldown', slot: 'v_pull', sets: 3, repsMin: 8, repsMax: 12, inc: 2.5 },
        { name: 'Triceps Pushdown', slot: 'triceps', sets: 2, repsMin: 10, repsMax: 12, inc: 2.5, optional: true },
        { name: 'Barbell Curl', slot: 'biceps', sets: 2, repsMin: 10, repsMax: 12, inc: 2.5, optional: true },
      ] },
      { name: 'Lower (heavy)', exercises: [
        { name: 'Back Squat', slot: 'squat', pattern: 'squat', sets: 4, reps: 5, inc: 5 },
        { name: 'Romanian Deadlift', slot: 'rdl', pattern: 'hinge', sets: 3, repsMin: 8, repsMax: 10, inc: 5 },
        { name: 'Leg Press', slot: 'leg_press', sets: 3, repsMin: 10, repsMax: 12, inc: 10, optional: true },
        { name: 'Lying Leg Curl', slot: 'leg_curl', sets: 3, repsMin: 10, repsMax: 12, inc: 2.5, optional: true },
        { name: 'Standing Calf Raise', slot: 'calf', sets: 3, repsMin: 10, repsMax: 15, inc: 5, optional: true },
      ] },
      { name: 'Upper (light)', exercises: [
        { name: 'Incline Dumbbell Press', slot: 'incline', sets: 3, repsMin: 8, repsMax: 12, inc: 2 },
        { name: 'Seated Cable Row', slot: 'cable_row', sets: 3, repsMin: 10, repsMax: 12, inc: 2.5 },
        { name: 'Lateral Raise', slot: 'lateral', sets: 3, repsMin: 12, repsMax: 15, inc: 1 },
        { name: 'Face Pull', slot: 'rear_delt', sets: 3, repsMin: 12, repsMax: 15, inc: 2.5, optional: true },
        { name: 'Dumbbell Curl', slot: 'biceps', sets: 2, repsMin: 10, repsMax: 15, inc: 1, optional: true },
        { name: 'Overhead Triceps Extension', slot: 'triceps', sets: 2, repsMin: 10, repsMax: 15, inc: 2.5, optional: true },
      ] },
      { name: 'Lower (light)', exercises: [
        { name: 'Leg Press', slot: 'leg_press', sets: 3, repsMin: 10, repsMax: 12, inc: 10 },
        { name: 'Walking Lunge', slot: 'lunge', sets: 3, repsMin: 10, repsMax: 12, inc: 2 },
        { name: 'Seated Leg Curl', slot: 'leg_curl', sets: 3, repsMin: 10, repsMax: 12, inc: 2.5 },
        { name: 'Seated Calf Raise', slot: 'calf', sets: 3, repsMin: 12, repsMax: 15, inc: 5, optional: true },
        { name: 'Hanging Leg Raise', slot: 'core', sets: 3, repsMin: 10, repsMax: 15, optional: true },
      ] },
    ],
    ...standard({ deloadEvery: 5 }),
  },
  {
    code: 'dumbbell_full_body_3',
    name: 'Dumbbell full body',
    about: 'Three full-body sessions a week with just dumbbells. Work up through each rep range, then go heavier.',
    weeks: 8,
    levels: ['new', 'some'], equipment: ['dumbbells', 'gym'], volume: 'moderate',
    schedule: { 1: 0, 3: 1, 5: 0 },
    days: [
      { name: 'Full body A', exercises: [
        { name: 'Goblet Squat', slot: 'squat', sets: 3, repsMin: 8, repsMax: 12, inc: 2 },
        { name: 'Dumbbell Bench Press', slot: 'h_press', sets: 3, repsMin: 8, repsMax: 12, inc: 2 },
        { name: 'Dumbbell Row', slot: 'h_pull', sets: 3, repsMin: 8, repsMax: 12, inc: 2 },
        { name: 'Lateral Raise', slot: 'lateral', sets: 2, repsMin: 12, repsMax: 15, inc: 1, optional: true },
        { name: 'Dead Bug', slot: 'core', sets: 2, repsMin: 10, repsMax: 15, optional: true },
      ] },
      { name: 'Full body B', exercises: [
        { name: 'Dumbbell Romanian Deadlift', slot: 'rdl', sets: 3, repsMin: 8, repsMax: 12, inc: 2 },
        { name: 'Seated Dumbbell Press', slot: 'v_press', sets: 3, repsMin: 8, repsMax: 12, inc: 2 },
        { name: 'Walking Lunge', slot: 'lunge', sets: 3, repsMin: 10, repsMax: 12, inc: 2 },
        { name: 'Dumbbell Curl', slot: 'biceps', sets: 2, repsMin: 10, repsMax: 12, inc: 1, optional: true },
        { name: 'Bench Dip', slot: 'triceps', sets: 2, repsMin: 8, repsMax: 15, optional: true },
      ] },
    ],
    ...standard(),
  },
  {
    code: 'home_bodyweight_3',
    name: 'Home bodyweight',
    about: 'Three sessions a week at home, no equipment. Add a rep each time until you reach the top of the range.',
    weeks: 8,
    levels: ['new'], equipment: ['home', 'dumbbells'], volume: 'moderate',
    schedule: { 1: 0, 3: 1, 5: 0 },
    days: [
      { name: 'Full body A', exercises: [
        { name: 'Bodyweight Squat', slot: 'squat', sets: 3, repsMin: 10, repsMax: 20 },
        { name: 'Push-up', slot: 'h_press', sets: 3, repsMin: 6, repsMax: 15 },
        { name: 'Inverted Row', slot: 'h_pull', sets: 3, repsMin: 6, repsMax: 12 },
        { name: 'Glute Bridge', slot: 'rdl', sets: 3, repsMin: 12, repsMax: 20 },
        { name: 'Dead Bug', slot: 'core', sets: 2, repsMin: 10, repsMax: 15, optional: true },
      ] },
      { name: 'Full body B', exercises: [
        { name: 'Reverse Lunge', slot: 'lunge', sets: 3, repsMin: 8, repsMax: 12 },
        { name: 'Pike Push-up', slot: 'v_press', sets: 3, repsMin: 5, repsMax: 12 },
        { name: 'Inverted Row', slot: 'h_pull', sets: 3, repsMin: 6, repsMax: 12 },
        { name: 'Single-Leg Calf Raise', slot: 'calf', sets: 3, repsMin: 10, repsMax: 20, optional: true },
        { name: 'Bench Dip', slot: 'triceps', sets: 2, repsMin: 8, repsMax: 15, optional: true },
      ] },
    ],
    ...standard(),
  },
];

// ── Bodyweight exercises: progress by reps ─────────────────────────────────────

// Rep range for a bodyweight exercise; programs written for weights get a sensible one.
export const bodyweightRange = (ex) => [ex.repsMin ?? Math.max(8, ex.reps ?? 8), ex.repsMax ?? Math.max(15, (ex.reps ?? 8) + 5)];
const isBodyweight = (ex) => ex.track === 'bodyweight_reps';

// Planned sets for a resolved program exercise (ex.track = its catalogue track type).
export function planFor(program, ex, ctx) {
  if (!isBodyweight(ex)) return program.prescribe(ex, ctx);
  const n = weekInfo(program, ctx.weekIndex).deload ? Math.max(1, Math.round(ex.sets * 0.6)) : ex.sets;
  return sets(n, null, (ctx.state && ctx.state.reps) || bodyweightRange(ex)[0]);
}

// A lift state's update after a session; bodyweight: every set at the target → +1 rep
// up to the top of the range, otherwise the same target.
export function advanceFor(program, ex, s, done, ctx) {
  if (!isBodyweight(ex)) return program.advance(ex, s, done, ctx);
  if (weekInfo(program, ctx.weekIndex).deload) return null;
  const [min, max] = bodyweightRange(ex);
  const target = s.reps || min;
  const work = done.filter((x) => x.reps > 0);
  if (work.length < ex.sets || !work.every((x) => x.reps >= target) || target >= max) return null;
  return { reps: target + 1, change: { kind: 'reps', fromKg: null, toKg: null, fromReps: target, toReps: target + 1 } };
}

// Why a lift's weight (or rep target) changed, for the workout and the summary. `w`
// formats kg for the user; `t` translates (strings in lib/i18n/friends.js).
export function describeChange(c, t, w) {
  switch (c.kind) {
    case 'up':         return c.fromKg === null ? t('Set from your first session') : t('+{w}: all reps hit', { w: w(c.toKg - c.fromKg) });
    case 'hold':       return t('Same weight: your last set was all-out');
    case 'reset':      return t('Lighter: 3 sessions missed in a row');
    case 'break':      return t('Welcome back: 10% lighter');
    case 'calibrated': return t('Set from your first session');
    case 'reps':       return t('+1 rep: every set hit');
    default:           return '';
  }
}

export const PROGRAM_BY_CODE = Object.fromEntries(PROGRAMS.map((p) => [p.code, p]));

export const daysPerWeek = (program) => Object.keys(program.schedule).length;

// Where a program stands in a given program week (0-based).
export function weekInfo(program, weekIndex) {
  if (program.cycleWeeks) {
    const w = weekIndex % program.cycleWeeks;
    return { week: w + 1, of: program.cycleWeeks, cycle: Math.floor(weekIndex / program.cycleWeeks) + 1, deload: w === program.cycleWeeks - 1, finished: false };
  }
  return { week: weekIndex + 1, of: program.weeks, cycle: null, deload: !!program.deloadEvery && (weekIndex + 1) % program.deloadEvery === 0, finished: weekIndex >= program.weeks };
}

// ── Movement slots ──────────────────────────────────────────────────────────────

// Movement slots: which built-in exercises can fill a program exercise, by where the
// user trains. A program exercise names its slot and a default (`name`); enrolling
// resolves each one for the user's equipment (resolveProgram), and the enrol sheet
// offers the rest as swaps. Order matters: the first unused candidate wins.
//
// gym users get the program's own exercise first, then any candidate; dumbbell users
// the dumbbell list, then home; home users the home list only.

export const SLOTS = {
  squat:     { gym: ['Back Squat', 'Front Squat', 'Hack Squat', 'Leg Press'], dumbbells: ['Goblet Squat', 'Bulgarian Split Squat'], home: ['Bodyweight Squat'] },
  h_press:   { gym: ['Barbell Bench Press', 'Dumbbell Bench Press', 'Chest Press Machine'], dumbbells: ['Dumbbell Bench Press'], home: ['Push-up'] },
  incline:   { gym: ['Incline Dumbbell Press', 'Incline Barbell Bench Press', 'Cable Fly'], dumbbells: ['Incline Dumbbell Press', 'Dumbbell Fly'], home: [] },
  v_press:   { gym: ['Overhead Press', 'Seated Dumbbell Press', 'Machine Shoulder Press'], dumbbells: ['Seated Dumbbell Press', 'Arnold Press'], home: ['Pike Push-up'] },
  h_pull:    { gym: ['Barbell Row', 'Dumbbell Row', 'Chest-Supported Row', 'T-Bar Row', 'Seated Cable Row'], dumbbells: ['Dumbbell Row'], home: ['Inverted Row'] },
  v_pull:    { gym: ['Lat Pulldown', 'Pull-up', 'Chin-up'], dumbbells: [], home: [] },
  cable_row: { gym: ['Seated Cable Row', 'Chest-Supported Row', 'Dumbbell Row'], dumbbells: [], home: [] },
  rear_delt: { gym: ['Face Pull', 'Reverse Pec Deck', 'Rear Delt Fly'], dumbbells: ['Rear Delt Fly'], home: [] },
  lateral:   { gym: ['Lateral Raise', 'Cable Lateral Raise'], dumbbells: ['Lateral Raise'], home: [] },
  biceps:    { gym: ['Barbell Curl', 'Dumbbell Curl', 'Cable Curl', 'Hammer Curl', 'Preacher Curl'], dumbbells: ['Dumbbell Curl', 'Hammer Curl'], home: [] },
  triceps:   { gym: ['Triceps Pushdown', 'Overhead Triceps Extension', 'Skull Crusher', 'Close-Grip Bench Press'], dumbbells: ['Bench Dip'], home: ['Bench Dip'] },
  hinge:     { gym: ['Deadlift', 'Romanian Deadlift', 'Sumo Deadlift', 'Rack Pull'], dumbbells: ['Dumbbell Romanian Deadlift'], home: ['Glute Bridge'] },
  rdl:       { gym: ['Romanian Deadlift', 'Dumbbell Romanian Deadlift', 'Hip Thrust'], dumbbells: ['Dumbbell Romanian Deadlift'], home: ['Glute Bridge'] },
  leg_press: { gym: ['Leg Press', 'Hack Squat', 'Bulgarian Split Squat'], dumbbells: ['Bulgarian Split Squat', 'Walking Lunge'], home: [] },
  lunge:     { gym: ['Walking Lunge', 'Bulgarian Split Squat', 'Step-up', 'Reverse Lunge'], dumbbells: ['Walking Lunge', 'Bulgarian Split Squat', 'Step-up'], home: ['Reverse Lunge'] },
  leg_curl:  { gym: ['Lying Leg Curl', 'Seated Leg Curl'], dumbbells: [], home: [] },
  calf:      { gym: ['Standing Calf Raise', 'Seated Calf Raise', 'Dumbbell Calf Raise'], dumbbells: ['Dumbbell Calf Raise'], home: ['Single-Leg Calf Raise'] },
  core:      { gym: ['Hanging Leg Raise', 'Cable Crunch', 'Ab Wheel Rollout', 'Crunch'], dumbbells: ['Dead Bug', 'Crunch'], home: ['Dead Bug', 'Crunch'] },
};

// Every exercise that may fill `ex` for this equipment, best first, without repeats.
export function candidates(ex, equipment = 'gym') {
  const s = SLOTS[ex.slot];
  if (!s) return [ex.name];
  const lists = equipment === 'gym' ? [[ex.name], s.gym, s.dumbbells, s.home] : equipment === 'dumbbells' ? [s.dumbbells, s.home] : [s.home];
  return [...new Set(lists.flat())];
}

const SET_MIN = 2.5;     // ~ minutes per set with rest
const WARM_UP = 10;
const dayMinutes = (exercises) => WARM_UP + exercises.reduce((n, ex) => n + (ex.sets || 3) * SET_MIN, 0);

// A program laid out for one user: each day's exercises resolved for their
// equipment, `swaps` applied ({ '<day>.<i>': name }, only valid ones), then optional
// exercises dropped from the end until each day fits `sessionMinutes`.
// → { days: [{ name, minutes, exercises: [{ key, name, alternatives, optional }] }],
//     doable } — doable = every required exercise found a candidate.
export function resolveProgram(program, { equipment = 'gym', sessionMinutes = null, swaps = {} } = {}) {
  let doable = true;
  const days = program.days.map((day, d) => {
    const used = new Set();
    const kept = [];
    for (const [i, ex] of day.exercises.entries()) {
      const key = `${d}.${i}`;
      const alternatives = candidates(ex, equipment);
      const pick = alternatives.includes(swaps[key]) && !used.has(swaps[key]) ? swaps[key] : alternatives.find((n) => !used.has(n));
      if (!pick) {
        if (ex.optional) continue;
        doable = false;
      }
      const name = pick || ex.name;
      used.add(name);
      kept.push({ key, name, alternatives, optional: !!ex.optional, sets: ex.sets || 3 });
    }
    while (sessionMinutes && dayMinutes(kept) > sessionMinutes) {
      const i = kept.map((x) => x.optional).lastIndexOf(true);
      if (i < 0) break;
      kept.splice(i, 1);
    }
    return { name: day.name, minutes: dayMinutes(kept), exercises: kept.map(({ sets, ...x }) => x) };
  });
  return { days, doable };
}

// { '<day>.<i>': name } for the exercises a resolved program keeps.
export const choicesOf = (resolved) => Object.fromEntries(resolved.days.flatMap((d) => d.exercises.map((x) => [x.key, x.name])));
