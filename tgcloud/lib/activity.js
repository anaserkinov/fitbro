import { db } from 'sdk';
import { eq, and, or, inArray, lt, desc } from 'sdk/db';
import { atOrAfter } from './db-util.js';
import * as T from '../schema.js';
import * as v from './validate.js';
import { requireMember, groupMembers, canSee } from './social.js';

// The friends feed. A row per finished workout / earned achievement, stored once per
// user. Who sees it is decided when the feed is read:
//   - the author allows workouts in the group being viewed (share_prs gates PR lines),
//   - it happened after both the author and the viewer joined that group,
//   - it is at most FEED_DAYS old.

const A = T.activities, R = T.activityReactions;
export const FEED_DAYS = 30;
export const REACTIONS = ['👏', '🔥', '💪'];
const PAGE = 30;

// PR highlights worth showing to friends (same filter as the chat finish message).
const feedPrs = (prs) => prs
  .filter((p) => p.type !== 'reps_at_weight')
  .map((p) => ({ exerciseId: p.exerciseId, exerciseName: p.exerciseName, type: p.type, value: p.value, weightKg: p.weightKg, reps: p.reps }));

export async function recordWorkoutActivity(user, workout, prs) {
  const [row] = await db.insert(A).values({
    userId: user.id, type: 'workout', workoutId: workout.id, localDate: workout.localDate,
    payload: {
      name: workout.name, durationSec: workout.durationSec,
      totalVolumeKg: workout.totalVolumeKg, totalSets: workout.totalSets,
      prs: feedPrs(prs),
    },
  }).returning();
  return row;
}

// `achievements` = [{ code }]; one feed item for everything earned at once.
export async function recordAchievementActivity(user, achievements, localDate) {
  if (!achievements.length) return null;
  const [row] = await db.insert(A).values({
    userId: user.id, type: 'achievement', localDate,
    payload: { codes: achievements.map((a) => a.code) },
  }).returning();
  return row;
}

export async function deleteWorkoutActivity(userId, workoutId) {
  const rows = await db.select({ id: A.id }).from(A).where(and(eq(A.userId, userId), eq(A.workoutId, workoutId))).all();
  if (!rows.length) return;
  const ids = rows.map((r) => r.id);
  await db.delete(R).where(inArray(R.activityId, ids)).run();
  await db.delete(A).where(inArray(A.id, ids)).run();
}

const later = (...dates) => new Date(Math.max(...dates.filter(Boolean).map((d) => d.getTime())));

export async function getGroupFeed(user, input) {
  const groupId = v.id(input.groupId, 'groupId');
  const before = v.id(input.before, 'before', { optional: true });
  const me = await requireMember(groupId, user.id);
  const members = (await groupMembers(groupId)).filter((m) => m.userId === user.id || m.shareWorkouts);
  const since = new Date(Date.now() - FEED_DAYS * 86400 * 1000);
  // Per author: only items after they joined, after I joined, and within the window.
  const visible = members.map((m) => and(eq(A.userId, m.userId), atOrAfter(A.createdAt, later(m.joinedAt, me.joinedAt, since))));
  const conds = [or(...visible)];
  if (before) conds.push(lt(A.id, before));
  const rows = await db.select().from(A).where(and(...conds)).orderBy(desc(A.id)).limit(PAGE + 1).all();
  const page = rows.slice(0, PAGE);

  const byMember = new Map(members.map((m) => [m.userId, m]));
  const users = page.length
    ? await db.select({ id: T.users.id, firstName: T.users.firstName }).from(T.users).where(inArray(T.users.id, [...new Set(page.map((r) => r.userId))])).all()
    : [];
  const names = new Map(users.map((u) => [u.id, u.firstName]));
  // Reactions from current members of this group only.
  const memberIds = (await groupMembers(groupId)).map((m) => m.userId);
  const reactions = page.length
    ? await db.select().from(R).where(and(inArray(R.activityId, page.map((r) => r.id)), inArray(R.userId, memberIds))).all()
    : [];

  const items = page.map((r) => {
    const author = byMember.get(r.userId);
    const payload = { ...(r.payload || {}) };
    if (r.type === 'workout' && r.userId !== user.id && !author.sharePrs) payload.prs = [];
    const mine = reactions.filter((x) => x.activityId === r.id);
    return {
      id: r.id, userId: r.userId, name: names.get(r.userId) || null, type: r.type,
      localDate: r.localDate, createdAt: r.createdAt, payload,
      reactions: Object.fromEntries(REACTIONS.map((e) => [e, mine.filter((x) => x.emoji === e).length]).filter(([, c]) => c > 0)),
      myReaction: (mine.find((x) => x.userId === user.id) || {}).emoji || null,
    };
  });
  return { items, nextBefore: rows.length > PAGE ? page[page.length - 1].id : null };
}

// One reaction per person per item: the same emoji again removes it, another replaces it.
export async function react(user, input) {
  const activityId = v.id(input.activityId, 'activityId');
  const emoji = input.emoji;
  if (!REACTIONS.includes(emoji)) v.invalid(`emoji must be one of: ${REACTIONS.join(' ')}`, 'emoji');
  const a = await db.select().from(A).where(eq(A.id, activityId)).get();
  if (!a || !(await canSee(user.id, a.userId, 'workouts'))) v.notFound('Activity');
  const existing = await db.select().from(R).where(and(eq(R.activityId, activityId), eq(R.userId, user.id))).get();
  if (existing && existing.emoji === emoji) {
    await db.delete(R).where(eq(R.id, existing.id)).run();
  } else if (existing) {
    await db.update(R).set({ emoji }).where(eq(R.id, existing.id)).run();
  } else {
    await db.insert(R).values({ activityId, userId: user.id, emoji }).run();
  }
  const all = await db.select({ emoji: R.emoji }).from(R).where(eq(R.activityId, activityId)).all();
  return {
    activityId,
    myReaction: existing && existing.emoji === emoji ? null : emoji,
    reactions: Object.fromEntries(REACTIONS.map((e) => [e, all.filter((x) => x.emoji === e).length]).filter(([, c]) => c > 0)),
  };
}

