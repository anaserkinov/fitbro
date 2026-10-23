import { db } from 'sdk';
import { eq, and, inArray, isNotNull, gte } from 'sdk/db';
import { atOrAfter } from './db-util.js';
import * as T from '../schema.js';
import { today, latestWeightKg } from './users.js';
import { addDays, weekStart } from './dates.js';
import { daysPerWeek, sessionMinutes } from './data/programs.js';

// Program recommendations: a transparent score of each built-in program against the
// user's training profile (experience, equipment, days a week, session length, goal)
// and what their log says about their level. Reasons go to the app as translation
// keys with params; every key is in REASONS (ru/uz in src/i18n/social.js).

const LEVELS = ['new', 'some', 'experienced'];
const SIGNAL_WEEKS = 16;
const STRENGTH_DAYS = 90;
const POINTS = { days: 40, nearDays: 20, level: 30, session: 15, goal: 10 };

export const REASONS = {
  days:        'Fits your {n} days a week',
  nearDays:    '{n} days a week, close to your {m}',
  new:         'Made for beginners',
  some:        'For lifters with some experience',
  experienced: 'For experienced lifters',
  inferred:    'Your log shows steady training',
  session:     'Sessions fit in {n} min',
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
    if (!p.equipment.includes(profile.equipment)) continue;
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
    const minutes = Math.ceil(sessionMinutes(p) / 5) * 5;
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
  const W = T.workouts, S = T.sets;
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
