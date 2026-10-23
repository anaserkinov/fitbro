import { db } from 'sdk';
import { eq, and, inArray, sql } from 'sdk/db';
import * as T from '../schema.js';
import { notFound } from './validate.js';

// The one place that decides what a user may see of another user. Every endpoint that
// reads across users goes through here. Two kinds of check:
//   - in a group: both are members of that group and the member allows `kind` there.
//     Used by everything shown on a group's screen (feed, leaderboard, challenges).
//   - at all: there is some shared group where the member allows `kind`. Used where no
//     group is in view (reacting to an item, copying a routine, ping eligibility).
// Kinds: 'workouts' (feed items, leaderboards), 'prs', 'routines', 'weight'.

const M = T.groupMembers;
export const KIND_FLAG = { workouts: 'shareWorkouts', prs: 'sharePrs', routines: 'shareRoutines', weight: 'shareWeight' };
const KIND_COLUMN = { workouts: 'share_workouts', prs: 'share_prs', routines: 'share_routines', weight: 'share_weight' };

const flagOf = (kind) => {
  if (!KIND_FLAG[kind]) throw new Error(`social: unknown kind ${kind}`);
  return KIND_FLAG[kind];
};

export async function membership(groupId, userId) {
  return db.select().from(M).where(and(eq(M.groupId, groupId), eq(M.userId, userId))).get();
}

// The caller's membership of a group, or NOT_FOUND — the access check for group screens.
export async function requireMember(groupId, userId) {
  const m = await membership(groupId, userId);
  if (!m) notFound('Group');
  return m;
}

export async function groupMembers(groupId) {
  return db.select().from(M).where(eq(M.groupId, groupId)).all();
}

export async function canSeeInGroup(viewerId, memberId, groupId, kind) {
  const flag = flagOf(kind);
  const rows = await db.select().from(M).where(and(eq(M.groupId, groupId), inArray(M.userId, [viewerId, memberId]))).all();
  const viewer = rows.find((r) => r.userId === viewerId);
  const member = rows.find((r) => r.userId === memberId);
  if (!viewer || !member) return false;
  return viewerId === memberId || !!member[flag];
}

export async function canSee(viewerId, memberId, kind) {
  if (viewerId === memberId) return true;
  const col = KIND_COLUMN[kind];
  if (!col) throw new Error(`social: unknown kind ${kind}`);
  const row = await db.get(sql`
    SELECT 1 AS ok FROM group_members v JOIN group_members m ON m.group_id = v.group_id
    WHERE v.user_id = ${viewerId} AND m.user_id = ${memberId} AND m.${sql.raw(col)} = 1 LIMIT 1`);
  return !!row;
}

// Everyone who shares a group with `memberId`, with the shared memberships on both
// sides — for pings, where the content depends on what each recipient may see.
// → [{ userId, groups: [{ groupId, viewer, member }] }]
export async function groupmatesOf(memberId) {
  const mine = await db.select().from(M).where(eq(M.userId, memberId)).all();
  if (!mine.length) return [];
  const byGroup = new Map(mine.map((m) => [m.groupId, m]));
  const others = await db.select().from(M).where(inArray(M.groupId, [...byGroup.keys()])).all();
  const out = new Map();
  for (const o of others) {
    if (o.userId === memberId) continue;
    if (!out.has(o.userId)) out.set(o.userId, { userId: o.userId, groups: [] });
    out.get(o.userId).groups.push({ groupId: o.groupId, viewer: o, member: byGroup.get(o.groupId) });
  }
  return [...out.values()];
}
