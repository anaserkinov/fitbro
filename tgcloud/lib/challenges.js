import { db, api, BotApiError } from 'sdk';
import { eq, and, inArray, isNull, isNotNull, gte, lte, lt, ne, desc, asc } from 'sdk/db';
import * as T from '../schema.js';
import * as v from './validate.js';
import { today } from './users.js';
import { localDate, addDays, daysBetween } from './dates.js';
import { requireMember, groupMembers } from './social.js';
import { tr } from './i18n/bot.js';
import { catalogName } from './i18n/catalog.js';
import { formatWeight } from './units.js';

// Group challenges: a metric over a date range, everyone in the group taking part.
// Standings are computed from finished workouts when read, so edits and deletions
// need no bookkeeping. A member counts if they show workouts in the group, and only
// workouts finished after they joined. When the challenge ends (in the group owner's
// timezone) the results go to every participant once.

const C = T.challenges, W = T.workouts;
export const MAX_ACTIVE = 5;   // keep in step with the error texts below
const MAX_DAYS = 90;     // keep in step with the error texts below
const RECENT_DAYS = 30;   // ended challenges stay listed this long

async function ownerToday(groupId) {
  const g = await db.select({ ownerId: T.groups.ownerId }).from(T.groups).where(eq(T.groups.id, groupId)).get();
  const owner = g ? await db.select({ timezone: T.users.timezone }).from(T.users).where(eq(T.users.id, g.ownerId)).get() : null;
  return localDate(owner ? owner.timezone : 'UTC');
}

export async function createChallenge(user, input) {
  const groupId = v.id(input.groupId, 'groupId');
  await requireMember(groupId, user.id);
  const metric = v.oneOf(input.metric, 'challengeMetric', 'metric');
  const title = v.str(input.title, 'title', { max: 40, optional: true });
  const target = v.num(input.target, 'target', { min: 1, max: 10000000, optional: true });
  const startDate = v.date(input.startDate, 'startDate');
  const endDate = v.date(input.endDate, 'endDate');
  let exerciseId = null;
  if (metric === 'exercise_reps') {
    exerciseId = v.id(input.exerciseId, 'exerciseId');
    const ex = await db.select().from(T.exercises).where(eq(T.exercises.id, exerciseId)).get();
    if (!ex || ex.userId !== 0) v.invalid('Pick a built-in exercise so everyone can log it', 'exerciseId');   // custom exercises aren't shared
  } else if (input.exerciseId !== undefined && input.exerciseId !== null) {
    v.invalid('exerciseId is only for exercise reps', 'exerciseId');
  }
  const now = today(user);
  if (startDate < now) v.invalid('A challenge can’t start in the past', 'startDate');
  if (endDate < startDate) v.invalid('The end date is before the start date', 'endDate');
  if (daysBetween(startDate, endDate) + 1 > MAX_DAYS) v.invalid('A challenge can last at most 90 days', 'endDate');
  const active = await db.$count(C, and(eq(C.groupId, groupId), gte(C.endDate, now)));
  if (active >= MAX_ACTIVE) v.refuse('A group can have at most 5 running challenges', 'CHALLENGE_LIMIT');
  const [row] = await db.insert(C).values({ groupId, createdBy: user.id, title, metric, exerciseId, target, startDate, endDate }).returning();
  return { challenge: await withStandings(row, user.id) };
}

export async function deleteChallenge(user, input) {
  const c = await db.select().from(C).where(eq(C.id, v.id(input.id))).get();
  if (!c) v.notFound('Challenge');
  const me = await requireMember(c.groupId, user.id);
  if (c.createdBy !== user.id && me.role !== 'owner') v.refuse('Only its creator or the group owner can delete a challenge', 'NOT_OWNER');
  await db.delete(C).where(eq(C.id, c.id)).run();
  return { deleted: true };
}

// Running and recently ended challenges, each with standings.
export async function listChallenges(user, input) {
  const groupId = v.id(input.groupId, 'groupId');
  await requireMember(groupId, user.id);
  const rows = await db.select().from(C)
    .where(and(eq(C.groupId, groupId), gte(C.endDate, addDays(today(user), -RECENT_DAYS))))
    .orderBy(desc(C.endDate), desc(C.id)).all();
  const out = [];
  for (const c of rows) out.push(await withStandings(c, user.id));
  return { challenges: out };
}

async function withStandings(c, viewerId) {
  const ex = c.exerciseId ? await db.select({ name: T.exercises.name }).from(T.exercises).where(eq(T.exercises.id, c.exerciseId)).get() : null;
  const groupToday = await ownerToday(c.groupId);
  return {
    ...c,
    exerciseName: ex ? ex.name : null,
    status: groupToday < c.startDate ? 'upcoming' : groupToday > c.endDate ? 'ended' : 'running',
    standings: await standings(c, viewerId),
  };
}

// → [{ rank, userId, name, value, hitTarget }], best first.
export async function standings(c, viewerId = null) {
  const members = (await groupMembers(c.groupId)).filter((m) => m.shareWorkouts || m.userId === viewerId);
  if (!members.length) return [];
  const ids = members.map((m) => m.userId);
  const joined = new Map(members.map((m) => [m.userId, m.joinedAt]));
  const workouts = (await db.select({ id: W.id, userId: W.userId, d: W.localDate, endedAt: W.endedAt, volume: W.totalVolumeKg, sets: W.totalSets }).from(W)
    .where(and(inArray(W.userId, ids), isNotNull(W.endedAt), gte(W.localDate, c.startDate), lte(W.localDate, c.endDate))).all())
    .filter((w) => w.endedAt >= joined.get(w.userId));

  let reps = new Map();
  if (c.metric === 'exercise_reps' && workouts.length) {
    const S = T.sets;
    const rows = await db.select({ userId: S.userId, reps: S.reps }).from(S)
      .where(and(inArray(S.workoutId, workouts.map((w) => w.id)), eq(S.exerciseId, c.exerciseId), eq(S.completed, true), ne(S.setType, 'warmup'))).all();
    reps = rows.reduce((m, r) => m.set(r.userId, (m.get(r.userId) || 0) + (r.reps || 0)), new Map());
  }

  const users = await db.select({ id: T.users.id, firstName: T.users.firstName }).from(T.users).where(inArray(T.users.id, ids)).all();
  const names = new Map(users.map((u) => [u.id, u.firstName]));
  const rows = ids.map((userId) => {
    const mine = workouts.filter((w) => w.userId === userId);
    const value = {
      workouts: mine.length,
      volume_kg: Math.round(mine.reduce((a, w) => a + (w.volume || 0), 0)),
      sets: mine.reduce((a, w) => a + (w.sets || 0), 0),
      active_days: new Set(mine.map((w) => w.d)).size,
      exercise_reps: reps.get(userId) || 0,
    }[c.metric];
    return { userId, name: names.get(userId) || null, value, hitTarget: c.target ? value >= c.target : null };
  });
  rows.sort((a, b) => b.value - a.value);
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

// ── Results ──────────────────────────────────────────────────────────────────────

export function challengeTitle(t, c, exerciseName, lang) {
  if (c.title) return c.title;
  switch (c.metric) {
    case 'workouts': return t('Most workouts');
    case 'volume_kg': return t('Most volume');
    case 'sets': return t('Most sets');
    case 'active_days': return t('Most active days');
    default: return t('Most {exercise} reps', { exercise: catalogName(lang, exerciseName || '') });
  }
}

function valueText(t, user, metric, value) {
  switch (metric) {
    case 'workouts': return t.n(value, '{n} workout', '{n} workouts');
    case 'volume_kg': return formatWeight(value, user.weightUnit, { digits: 0, lang: user.language });
    case 'sets': return t.n(value, '{n} set', '{n} sets');
    case 'active_days': return t.n(value, '{n} active day', '{n} active days');
    default: return t.n(value, '{n} rep', '{n} reps');
  }
}

function resultsText(user, c, exerciseName, rows) {
  const t = tr(user);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = [`🏁 ${t('Challenge over: {title}', { title: challengeTitle(t, c, exerciseName, user.language) })}`, ''];
  for (const r of rows.slice(0, 3)) lines.push(`${medals[r.rank - 1]} ${r.name || t('Member')} — ${valueText(t, user, c.metric, r.value)}`);
  const me = rows.find((r) => r.userId === user.id);
  if (me) {
    lines.push('', t('You: #{rank} of {n} — {value}', { rank: me.rank, n: rows.length, value: valueText(t, user, c.metric, me.value) }));
    if (me.hitTarget === true) lines.push(`🎯 ${t('Target reached!')}`);
    else if (me.hitTarget === false) lines.push(t('Target: {value}', { value: valueText(t, user, c.metric, c.target) }));
  }
  return lines.join('\n');
}

// Called from tick: sends the results of challenges that have ended, once each.
export async function processEndedChallenges() {
  // Pre-filter by the earliest date on Earth (UTC+14); the owner's own date decides.
  const pending = await db.select().from(C).where(and(isNull(C.resultsSentAt), lt(C.endDate, localDate('UTC', new Date(Date.now() + 14 * 3600 * 1000)))))
    .orderBy(asc(C.endDate)).limit(50).all();
  const out = { challenges: 0, sent: 0, failed: 0 };
  for (const c of pending) {
    if (c.endDate >= await ownerToday(c.groupId)) continue;   // not over yet where the owner lives
    await db.update(C).set({ resultsSentAt: new Date() }).where(eq(C.id, c.id)).run();
    out.challenges++;
    const rows = await standings(c);
    const ex = c.exerciseId ? await db.select({ name: T.exercises.name }).from(T.exercises).where(eq(T.exercises.id, c.exerciseId)).get() : null;
    for (const r of rows) {
      const user = await db.select().from(T.users).where(eq(T.users.id, r.userId)).get();
      if (!user) continue;
      try {
        await api.sendMessage({ chat_id: user.id, text: resultsText(user, c, ex && ex.name, rows) });
        out.sent++;
      } catch (e) {
        out.failed++;
        if (!(e instanceof BotApiError && e.code === 403)) console.warn('challenge results failed', c.id, e.description || e.message);
      }
    }
  }
  return out;
}
