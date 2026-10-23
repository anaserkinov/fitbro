import { db } from 'sdk';
import { eq, sql } from 'sdk/db';
import * as T from '../schema.js';
import { today } from './users.js';
import { goalStreak } from './streaks.js';
import { isUniqueViolation } from './db-util.js';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_CODE } from './data/achievements.js';

// Achievements: evaluated after each finished workout (and lazily when the list is
// opened). The very first evaluation of a user — before achievements_evaluated_at is
// set — grants everything their history already earns *silently*: no feed item, no
// ping. After that every new grant is announced.

const UA = T.userAchievements;

// Everything the catalogue's `metric`s need, in a few aggregate queries.
async function snapshot(user) {
  const w = await db.get(sql`
    SELECT count(*) AS workouts, coalesce(sum(total_volume_kg), 0) AS lifetimeKg, coalesce(max(total_volume_kg), 0) AS maxSessionKg
    FROM workouts WHERE user_id = ${user.id} AND ended_at IS NOT NULL`);
  // Records beaten (baselines excluded), counted once per workout · exercise · kind.
  const p = await db.get(sql`
    SELECT count(*) AS prs FROM (
      SELECT DISTINCT p.workout_id, p.exercise_id, p.type FROM personal_records p
      WHERE p.user_id = ${user.id} AND p.type != 'reps_at_weight' AND p.workout_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM personal_records q
                    WHERE q.user_id = p.user_id AND q.exercise_id = p.exercise_id AND q.type = p.type
                      AND q.id < p.id AND (q.workout_id IS NULL OR q.workout_id != p.workout_id))
        AND p.workout_id IN (SELECT id FROM workouts WHERE user_id = ${user.id} AND ended_at IS NOT NULL))`);
  return {
    workouts: Number(w.workouts), lifetimeKg: Number(w.lifetimeKg), maxSessionKg: Number(w.maxSessionKg),
    prs: Number(p.prs),
    goalStreak: await goalStreak(user, today(user)),
  };
}

// → { granted: [{ code, silent }], announced: [{ code }] } for grants made by this call.
export async function evaluateAchievements(user) {
  const fresh = await db.select({ evaluatedAt: T.users.achievementsEvaluatedAt }).from(T.users).where(eq(T.users.id, user.id)).get();
  const silent = !fresh || !fresh.evaluatedAt;
  const have = new Set((await db.select({ code: UA.code }).from(UA).where(eq(UA.userId, user.id)).all()).map((r) => r.code));
  const stats = await snapshot(user);
  const granted = [];
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.code) || !(stats[a.metric] >= a.at)) continue;
    try {
      await db.insert(UA).values({ userId: user.id, code: a.code, silent }).run();
      granted.push({ code: a.code, silent });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;   // a parallel evaluation got there first
    }
  }
  if (silent) await db.update(T.users).set({ achievementsEvaluatedAt: new Date() }).where(eq(T.users.id, user.id)).run();
  return { granted, announced: granted.filter((g) => !g.silent).map((g) => ({ code: g.code })) };
}

// The whole catalogue with what's earned, for the Progress tab.
export async function getAchievements(user) {
  await evaluateAchievements(user);
  const rows = await db.select().from(UA).where(eq(UA.userId, user.id)).all();
  const earned = new Map(rows.map((r) => [r.code, r.earnedAt]));
  return {
    achievements: ACHIEVEMENTS.map((a) => ({ code: a.code, earnedAt: earned.get(a.code) ?? null })),
    earnedCount: rows.filter((r) => ACHIEVEMENT_BY_CODE[r.code]).length,
  };
}

