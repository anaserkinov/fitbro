import { db } from 'sdk';
import { eq, and, inArray, isNotNull, gte, lte, desc } from 'sdk/db';
import * as T from '../schema.js';
import * as v from './validate.js';
import { today } from './users.js';
import { addDays, weekStart } from './dates.js';
import { round } from './units.js';
import { goalStreakFrom } from './streaks.js';
import { requireMember, groupMembers } from './social.js';
import { atOrAfter } from './db-util.js';
import { getGroupRow, inviteLink } from './groups.js';

// A group's weekly leaderboard, built to be fair across body sizes:
//   consistency — workouts done vs. each member's own weekly goal, plus goal streak
//   volume      — total kg moved and working sets
//   strength    — best e1RM (last 90 days) ÷ latest body weight on the big three
// The week is Monday–Sunday by each member's local date, the same days for everyone.
// Members appear on a board only if they allow it in this group (you always see yourself).

const W = T.workouts;
export const BIG_LIFTS = ['Barbell Bench Press', 'Back Squat', 'Deadlift'];
const STRENGTH_DAYS = 90;

let liftIds = null;
async function bigLiftIds() {
  if (!liftIds) {
    const rows = await db.select({ id: T.exercises.id, name: T.exercises.name }).from(T.exercises)
      .where(and(eq(T.exercises.userId, 0), inArray(T.exercises.name, BIG_LIFTS))).all();
    if (rows.length < BIG_LIFTS.length) return rows;   // catalogue not seeded yet: don't cache
    liftIds = rows;
  }
  return liftIds;
}

async function latestWeights(userIds) {
  if (!userIds.length) return new Map();
  const rows = await db.select({ userId: T.bodyWeights.userId, weightKg: T.bodyWeights.weightKg, d: T.bodyWeights.localDate })
    .from(T.bodyWeights).where(inArray(T.bodyWeights.userId, userIds)).orderBy(desc(T.bodyWeights.localDate)).all();
  const out = new Map();
  for (const r of rows) if (!out.has(r.userId)) out.set(r.userId, r.weightKg);
  return out;
}

async function bestE1rms(userIds, since) {
  const lifts = await bigLiftIds();
  if (!userIds.length || !lifts.length) return { lifts, best: new Map() };
  const S = T.sets;
  const rows = await db.select({ userId: S.userId, exerciseId: S.exerciseId, e1rm: S.e1rmKg }).from(S)
    .where(and(inArray(S.userId, userIds), inArray(S.exerciseId, lifts.map((l) => l.id)), eq(S.completed, true),
      isNotNull(S.e1rmKg), atOrAfter(S.completedAt, since))).all();
  const best = new Map();   // `${userId}:${exerciseId}` → kg
  for (const r of rows) {
    const k = `${r.userId}:${r.exerciseId}`;
    if (!best.has(k) || r.e1rm > best.get(k)) best.set(k, r.e1rm);
  }
  return { lifts, best };
}

const rank = (rows, ...keys) => rows.sort((a, b) => {
  for (const k of keys) if ((b[k] ?? -1) !== (a[k] ?? -1)) return (b[k] ?? -1) - (a[k] ?? -1);
  return 0;
}).map((r, i) => ({ rank: i + 1, ...r }));

// The three boards for a group and the week containing `date`.
export async function computeLeaderboard(groupId, viewerId, date) {
  const from = weekStart(date, 1);
  const to = addDays(from, 6);
  const members = await groupMembers(groupId);
  const ids = members.map((m) => m.userId);
  const users = ids.length ? await db.select().from(T.users).where(inArray(T.users.id, ids)).all() : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const shows = (m, flag) => m.userId === viewerId || m[flag];

  const active = members.filter((m) => shows(m, 'shareWorkouts') && byId.has(m.userId));
  const activeIds = active.map((m) => m.userId);
  const history = activeIds.length
    ? await db.select({ userId: W.userId, d: W.localDate, volume: W.totalVolumeKg, sets: W.totalSets }).from(W)
      .where(and(inArray(W.userId, activeIds), isNotNull(W.endedAt), gte(W.localDate, addDays(date, -400)), lte(W.localDate, to))).all()
    : [];

  const consistency = [];
  const volume = [];
  for (const m of active) {
    const u = byId.get(m.userId);
    const mine = history.filter((h) => h.userId === m.userId);
    const week = mine.filter((h) => h.d >= from && h.d <= to);
    const goal = u.workoutsPerWeek || 0;
    const base = { userId: u.id, name: u.firstName };
    consistency.push({
      ...base, done: week.length, goal,
      ratio: goal ? round(week.length / goal, 2) : 0,
      pct: goal ? Math.min(100, Math.round((week.length / goal) * 100)) : 0,
      streakWeeks: goalStreakFrom(mine.map((h) => h.d), { goal, weekStartsOn: u.weekStartsOn, date }),
    });
    volume.push({
      ...base,
      volumeKg: round(week.reduce((a, h) => a + (h.volume || 0), 0), 0),
      sets: week.reduce((a, h) => a + (h.sets || 0), 0),
    });
  }

  const lifters = members.filter((m) => shows(m, 'shareWeight') && byId.has(m.userId));
  const weights = await latestWeights(lifters.map((m) => m.userId));
  const { lifts, best } = await bestE1rms(lifters.map((m) => m.userId), new Date(Date.now() - STRENGTH_DAYS * 86400 * 1000));
  const strength = [];
  for (const m of lifters) {
    const bw = weights.get(m.userId);
    if (!bw) continue;
    const u = byId.get(m.userId);
    const perLift = BIG_LIFTS.map((name) => {
      const lift = lifts.find((l) => l.name === name);
      const e1rm = lift ? best.get(`${m.userId}:${lift.id}`) : undefined;
      return { exercise: name, e1rmKg: e1rm ?? null, ratio: e1rm ? round(e1rm / bw, 2) : null };
    });
    const present = perLift.filter((l) => l.ratio !== null);
    strength.push({ userId: u.id, name: u.firstName, bodyWeightKg: bw, lifts: perLift, total: present.length ? round(present.reduce((a, l) => a + l.ratio, 0), 2) : null });
  }

  return {
    from, to,
    consistency: rank(consistency, 'ratio', 'streakWeeks'),
    volume: rank(volume, 'volumeKg', 'sets'),
    strength: rank(strength, 'total'),
  };
}

export async function getGroup(user, input) {
  const groupId = v.id(input.groupId, 'groupId');
  const date = v.date(input.week, 'week', { optional: true }) ?? today(user);
  const me = await requireMember(groupId, user.id);
  const group = await getGroupRow(groupId);
  const members = await groupMembers(groupId);
  const users = await db.select({ id: T.users.id, firstName: T.users.firstName }).from(T.users).where(inArray(T.users.id, members.map((m) => m.userId))).all();
  const names = new Map(users.map((u) => [u.id, u.firstName]));
  const { groupId: _g, id: _id, ...settings } = me;
  return {
    group: { id: group.id, name: group.name, ownerId: group.ownerId, inviteLink: await inviteLink(group), chatLinked: !!group.chatId },
    me: settings,
    members: members.map((m) => ({ userId: m.userId, name: names.get(m.userId) || null, role: m.role, joinedAt: m.joinedAt })),
    leaderboard: await computeLeaderboard(groupId, user.id, date),
  };
}
