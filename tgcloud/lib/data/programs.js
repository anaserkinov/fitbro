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
// the next session calibrates it).
//
// prescribe(ex, { state, weekIndex }) → planned sets [{ weightKg, reps, setType }].
// advance(ex, state, done, { weekIndex }) → a state patch (+ `change` for the user) after
//   a session, or null for "no verdict". `done` = that exercise's completed working sets.
// roll(ex, state, weekIndex) (optional) → a patch when a new cycle starts, or null.

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

export const PROGRAMS = [
  {
    code: 'full_body_beginner',
    name: 'Beginner full body',
    about: 'Three full-body sessions a week. Add weight every time you hit all your reps.',
    weeks: 8,
    levels: ['new'], equipment: ['gym'], volume: 'moderate',   // who it suits (lib/recommend.js)
    schedule: { 1: 0, 3: 1, 5: 0 },   // weekday → day index
    days: [
      { name: 'Full body A', exercises: [
        { name: 'Back Squat', pattern: 'squat', sets: 3, reps: 5, inc: 5 },
        { name: 'Barbell Bench Press', pattern: 'h_press', sets: 3, reps: 5, inc: 2.5 },
        { name: 'Barbell Row', pattern: 'h_pull', sets: 3, reps: 5, inc: 2.5 },
      ] },
      { name: 'Full body B', exercises: [
        { name: 'Back Squat', pattern: 'squat', sets: 3, reps: 5, inc: 5 },
        { name: 'Overhead Press', pattern: 'v_press', sets: 3, reps: 5, inc: 2.5 },
        { name: 'Deadlift', pattern: 'hinge', sets: 1, reps: 5, inc: 5 },
      ] },
    ],
    prescribe: (ex, { state }) => sets(ex.sets, kgOf(state), ex.reps),
    advance: progress(linear),
  },
  {
    code: 'ppl_12',
    name: 'Push Pull Legs',
    about: 'Six days a week for 12 weeks. Work up through each rep range, then add weight. Every 4th week is lighter.',
    weeks: 12,
    levels: ['some', 'experienced'], equipment: ['gym'], volume: 'high',
    schedule: { 1: 0, 2: 1, 3: 2, 4: 0, 5: 1, 6: 2 },
    deloadEvery: 4,
    days: [
      { name: 'Push', exercises: [
        { name: 'Barbell Bench Press', pattern: 'h_press', sets: 4, repsMin: 6, repsMax: 8, inc: 2.5 },
        { name: 'Overhead Press', pattern: 'v_press', sets: 3, repsMin: 8, repsMax: 10, inc: 2.5 },
        { name: 'Incline Dumbbell Press', sets: 3, repsMin: 8, repsMax: 12, inc: 2 },
        { name: 'Lateral Raise', sets: 3, repsMin: 12, repsMax: 15, inc: 1 },
        { name: 'Triceps Pushdown', sets: 3, repsMin: 10, repsMax: 12, inc: 2.5 },
      ] },
      { name: 'Pull', exercises: [
        { name: 'Barbell Row', pattern: 'h_pull', sets: 4, repsMin: 6, repsMax: 8, inc: 2.5 },
        { name: 'Lat Pulldown', sets: 3, repsMin: 8, repsMax: 12, inc: 2.5 },
        { name: 'Seated Cable Row', sets: 3, repsMin: 10, repsMax: 12, inc: 2.5 },
        { name: 'Face Pull', sets: 3, repsMin: 12, repsMax: 15, inc: 2.5 },
        { name: 'Barbell Curl', sets: 3, repsMin: 8, repsMax: 12, inc: 2.5 },
      ] },
      { name: 'Legs', exercises: [
        { name: 'Back Squat', pattern: 'squat', sets: 4, repsMin: 6, repsMax: 8, inc: 5 },
        { name: 'Romanian Deadlift', pattern: 'hinge', sets: 3, repsMin: 8, repsMax: 10, inc: 5 },
        { name: 'Leg Press', sets: 3, repsMin: 10, repsMax: 12, inc: 10 },
        { name: 'Lying Leg Curl', sets: 3, repsMin: 10, repsMax: 12, inc: 2.5 },
        { name: 'Standing Calf Raise', sets: 4, repsMin: 10, repsMax: 15, inc: 5 },
      ] },
    ],
    prescribe(ex, { state, weekIndex }) {
      if ((weekIndex + 1) % 4 === 0) return sets(Math.max(1, Math.round(ex.sets * 0.6)), kgOf(state), ex.repsMin);   // deload: 60% of the sets
      return sets(ex.sets, kgOf(state), repsOf(ex, state));
    },
    advance: (ex, s, done, ctx) => ((ctx.weekIndex + 1) % 4 === 0 ? null : progress(double)(ex, s, done, ctx)),
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
        { name: 'Lat Pulldown', sets: 5, reps: 10 },
      ] },
      { name: 'Deadlift day', exercises: [
        { name: 'Deadlift', pattern: 'hinge', main: 'deadlift', inc: 5 },
        { name: 'Hanging Leg Raise', sets: 5, reps: 10 },
      ] },
      { name: 'Bench day', exercises: [
        { name: 'Barbell Bench Press', pattern: 'h_press', main: 'bench', inc: 2.5 },
        { name: 'Dumbbell Row', sets: 5, reps: 10 },
      ] },
      { name: 'Squat day', exercises: [
        { name: 'Back Squat', pattern: 'squat', main: 'squat', inc: 5 },
        { name: 'Lying Leg Curl', sets: 5, reps: 10 },
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
];

// Why a lift's weight changed, for the workout and the summary. `w` formats kg for
// the user; `t` translates (strings in lib/i18n/friends.js).
export function describeChange(c, t, w) {
  switch (c.kind) {
    case 'up':         return c.fromKg === null ? t('Set from your first session') : t('+{w}: all reps hit', { w: w(c.toKg - c.fromKg) });
    case 'hold':       return t('Same weight: your last set was all-out');
    case 'reset':      return t('Lighter: 3 sessions missed in a row');
    case 'break':      return t('Welcome back: 10% lighter');
    case 'calibrated': return t('Set from your first session');
    default:           return '';
  }
}

export const PROGRAM_BY_CODE = Object.fromEntries(PROGRAMS.map((p) => [p.code, p]));

export const daysPerWeek = (program) => Object.keys(program.schedule).length;

// Rough length of the longest day: 10 min to warm up, then ~2.5 min per set with rest.
export const sessionMinutes = (program) => Math.max(...program.days.map((d) => 10 + d.exercises.reduce((n, ex) => n + (ex.sets || 3) * 2.5, 0)));

// Where a program stands in a given program week (0-based).
export function weekInfo(program, weekIndex) {
  if (program.cycleWeeks) {
    const w = weekIndex % program.cycleWeeks;
    return { week: w + 1, of: program.cycleWeeks, cycle: Math.floor(weekIndex / program.cycleWeeks) + 1, deload: w === program.cycleWeeks - 1, finished: false };
  }
  return { week: weekIndex + 1, of: program.weeks, cycle: null, deload: !!program.deloadEvery && (weekIndex + 1) % program.deloadEvery === 0, finished: weekIndex >= program.weeks };
}
