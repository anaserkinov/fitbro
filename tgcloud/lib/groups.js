import { db } from 'sdk';
import { eq, and, inArray, asc } from 'sdk/db';
import * as T from '../schema.js';
import * as v from './validate.js';
import { refuse } from './validate.js';
import { isUniqueViolation } from './db-util.js';
import { requireMember } from './social.js';
import { startAppLink, inviteParam } from './links.js';

// Friends groups: create, invite, join, leave and the owner's admin actions.
// A link opens a preview (previewGroup); only an explicit Join (joinGroup) adds you.

const G = T.groups, M = T.groupMembers, B = T.groupBlocks;
export const MAX_GROUPS_PER_USER = 10;   // keep in step with the GROUP_LIMIT text
export const MAX_MEMBERS = 50;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function newCode() {
  const bytes = new Uint8Array(8);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

const cleanCode = (x) => {
  const code = typeof x === 'string' ? x.trim().toLowerCase().replace(/^g_/, '') : '';
  if (!/^[a-z0-9]{8}$/.test(code)) refuse('This invite link has expired', 'INVITE_INVALID');
  return code;
};

const cleanName = (x, k = 'name') => v.str(x, k, { max: 40 });

async function groupByCode(code) {
  const g = await db.select().from(G).where(eq(G.inviteCode, code)).get();
  if (!g) refuse('This invite link has expired', 'INVITE_INVALID');
  return g;
}

async function getGroupRow(groupId) {
  const g = await db.select().from(G).where(eq(G.id, groupId)).get();
  if (!g) v.notFound('Group');
  return g;
}

async function requireOwner(groupId, userId) {
  const m = await requireMember(groupId, userId);
  if (m.role !== 'owner') refuse('Only the group owner can do that', 'NOT_OWNER');
  return m;
}

const memberCount = (groupId) => db.$count(M, eq(M.groupId, groupId));
const groupCountOf = (userId) => db.$count(M, eq(M.userId, userId));

async function isBlocked(groupId, userId) {
  return !!(await db.select({ id: B.id }).from(B).where(and(eq(B.groupId, groupId), eq(B.userId, userId))).get());
}

export async function inviteLink(group) {
  return startAppLink(inviteParam(group.inviteCode));
}

// The group as its members see it in lists.
async function summary(group, me) {
  return {
    id: group.id, name: group.name, ownerId: group.ownerId,
    memberCount: await memberCount(group.id),
    role: me ? me.role : null,
    inviteLink: me ? await inviteLink(group) : null,
  };
}

// Inserts a group owned by `user` (with a fresh invite code) and their membership.
export async function insertGroup(user, name, extra = {}) {
  if ((await groupCountOf(user.id)) >= MAX_GROUPS_PER_USER) refuse('You can be in at most 10 groups', 'GROUP_LIMIT');
  let group;
  for (let attempt = 0; !group; attempt++) {
    try {
      [group] = await db.insert(G).values({ name, ownerId: user.id, inviteCode: newCode(), ...extra }).returning();
    } catch (e) {
      if (!isUniqueViolation(e) || attempt > 0) throw e;
    }
  }
  const [me] = await db.insert(M).values({ groupId: group.id, userId: user.id, role: 'owner' }).returning();
  return { group, me };
}

export async function createGroup(user, input) {
  const { group, me } = await insertGroup(user, cleanName(input.name));
  return { group: await summary(group, me) };
}

export async function listGroups(user) {
  const mine = await db.select().from(M).where(eq(M.userId, user.id)).orderBy(asc(M.joinedAt)).all();
  if (!mine.length) return { groups: [] };
  const rows = await db.select().from(G).where(inArray(G.id, mine.map((m) => m.groupId))).all();
  const byId = new Map(rows.map((g) => [g.id, g]));
  const groups = [];
  for (const m of mine) if (byId.has(m.groupId)) groups.push(await summary(byId.get(m.groupId), m));
  return { groups };
}

// What an invite link shows before joining: no members, no activity.
export async function previewGroup(user, input) {
  const g = await groupByCode(cleanCode(input.code));
  if (await isBlocked(g.id, user.id)) refuse('You were removed from this group', 'REMOVED_FROM_GROUP');
  const owner = await db.select({ firstName: T.users.firstName }).from(T.users).where(eq(T.users.id, g.ownerId)).get();
  const me = await db.select({ id: M.id }).from(M).where(and(eq(M.groupId, g.id), eq(M.userId, user.id))).get();
  return { group: { id: g.id, name: g.name, memberCount: await memberCount(g.id), ownerName: owner ? owner.firstName : null }, isMember: !!me };
}

export async function joinGroup(user, input) {
  const g = await groupByCode(cleanCode(input.code));
  if (await isBlocked(g.id, user.id)) refuse('You were removed from this group', 'REMOVED_FROM_GROUP');
  const existing = await db.select().from(M).where(and(eq(M.groupId, g.id), eq(M.userId, user.id))).get();
  if (existing) return { group: await summary(g, existing), joined: false };
  if ((await memberCount(g.id)) >= MAX_MEMBERS) refuse('This group is full', 'GROUP_FULL');
  if ((await groupCountOf(user.id)) >= MAX_GROUPS_PER_USER) refuse('You can be in at most 10 groups', 'GROUP_LIMIT');
  let me;
  try {
    [me] = await db.insert(M).values({ groupId: g.id, userId: user.id, role: 'member' }).returning();
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;   // a double tap raced us
    me = await db.select().from(M).where(and(eq(M.groupId, g.id), eq(M.userId, user.id))).get();
  }
  return { group: await summary(g, me), joined: true };
}

// Drops a membership. An owner who leaves hands the group to the longest-standing
// member; the last one out deletes the group.
async function dropMembership(groupId, userId) {
  const m = await db.select().from(M).where(and(eq(M.groupId, groupId), eq(M.userId, userId))).get();
  if (!m) return;
  await db.delete(M).where(eq(M.id, m.id)).run();
  const next = await db.select().from(M).where(eq(M.groupId, groupId)).orderBy(asc(M.joinedAt), asc(M.id)).limit(1).get();
  if (!next) return deleteGroup(groupId);
  if (m.role === 'owner') {
    await db.update(M).set({ role: 'owner' }).where(eq(M.id, next.id)).run();
    await db.update(G).set({ ownerId: next.userId }).where(eq(G.id, groupId)).run();
  }
}

export async function deleteGroup(groupId) {
  await db.delete(T.challenges).where(eq(T.challenges.groupId, groupId)).run();
  await db.delete(B).where(eq(B.groupId, groupId)).run();
  await db.delete(M).where(eq(M.groupId, groupId)).run();
  await db.delete(G).where(eq(G.id, groupId)).run();
}

export async function leaveGroup(user, input) {
  const groupId = v.id(input.groupId, 'groupId');
  await requireMember(groupId, user.id);
  await dropMembership(groupId, user.id);
  return { left: true };
}

// For "delete my data": leave every group (ownership moves on) and drop blocks.
export async function leaveAllGroups(userId) {
  const mine = await db.select({ groupId: M.groupId }).from(M).where(eq(M.userId, userId)).all();
  for (const m of mine) await dropMembership(m.groupId, userId);
  await db.delete(B).where(eq(B.userId, userId)).run();
}

export async function updateGroup(user, input) {
  const groupId = v.id(input.groupId, 'groupId');
  const name = cleanName(input.name);
  const me = await requireOwner(groupId, user.id);
  await db.update(G).set({ name }).where(eq(G.id, groupId)).run();
  return { group: await summary(await getGroupRow(groupId), me) };
}

export async function removeMember(user, input) {
  const groupId = v.id(input.groupId, 'groupId');
  const userId = v.id(input.userId, 'userId');
  await requireOwner(groupId, user.id);
  if (userId === user.id) v.invalid('Use Leave group instead', 'userId');
  await requireMember(groupId, userId);
  await dropMembership(groupId, userId);
  try {
    await db.insert(B).values({ groupId, userId }).run();
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
  }
  return { removed: true };
}

// New code: old links stop working, and removed members may join again.
export async function resetInvite(user, input) {
  const groupId = v.id(input.groupId, 'groupId');
  const me = await requireOwner(groupId, user.id);
  for (let attempt = 0; ; attempt++) {
    try {
      await db.update(G).set({ inviteCode: newCode() }).where(eq(G.id, groupId)).run();
      break;
    } catch (e) {
      if (!isUniqueViolation(e) || attempt > 0) throw e;
    }
  }
  await db.delete(B).where(eq(B.groupId, groupId)).run();
  return { group: await summary(await getGroupRow(groupId), me) };
}

const MEMBERSHIP_SPEC = {
  groupId:       (x, k) => v.id(x, k),
  shareWorkouts: (x, k) => v.bool(x, k),
  sharePrs:      (x, k) => v.bool(x, k),
  shareRoutines: (x, k) => v.bool(x, k),
  shareWeight:   (x, k) => v.bool(x, k),
  mutePings:     (x, k) => v.bool(x, k),
  showInChat:    (x, k) => v.bool(x, k),
};

export async function updateMembership(user, input) {
  const { groupId, ...set } = v.patch(input, MEMBERSHIP_SPEC);
  if (!groupId) v.invalid('groupId is required', 'groupId');
  const me = await requireMember(groupId, user.id);
  if (Object.keys(set).length) await db.update(M).set(set).where(eq(M.id, me.id)).run();
  return { membership: await requireMember(groupId, user.id) };
}

export { getGroupRow };
