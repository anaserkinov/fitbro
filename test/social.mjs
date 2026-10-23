// Friends: groups, feed, leaderboards, pings, sharing, challenges — through the
// endpoint wrappers, as several Mini App users would call them. Runs after bot.mjs.
import assert from 'node:assert/strict';
import { db } from './shim/sdk.js';
import { eq, and, isNull } from './shim/sdk-db.js';
import * as T from '../tgcloud/schema.js';
import { endpointFn } from './call.mjs';
import { canSee, canSeeInGroup } from '../tgcloud/lib/social.js';

const E = {};
const NAMES = { 501: 'Ali', 502: 'Bo', 503: 'Cai', 504: 'Dan', 505: 'Eve', 506: 'Fay' };
const call = async (userId, name, input = {}) => {
  E[name] ??= await endpointFn(name);
  return E[name](input, { initData: { user: { id: userId, first_name: NAMES[userId] || 'User', language_code: 'en' } } });
};
const fails = (p, code) => assert.rejects(p, (e) => (e.parameters && e.parameters.code) === code);
let n = 0; const ok = (name) => { n++; console.log('  ✓', name); };
globalThis.fakeApi = { getMe: () => ({ username: 'fitpro_bot' }) };

const onboard = (uid) => call(uid, 'completeOnboarding', { sex: 'male', birthDate: '1995-01-01', heightCm: 180, weightKg: 80, activityLevel: 'moderate', goal: 'maintain', timezone: 'UTC' });
for (const uid of [501, 502, 503, 504, 505]) await onboard(uid);
const ALI = 501, BO = 502, CAI = 503, DAN = 504, EVE = 505;

console.log('\nFriends: groups');
await fails(call(506, 'createGroup', { name: 'X' }), 'NOT_ONBOARDED'); ok('groups need onboarding');
let gym = (await call(ALI, 'createGroup', { name: 'Gym' })).group;
assert.equal(gym.role, 'owner'); assert.equal(gym.memberCount, 1); assert.match(gym.inviteLink, /^https:\/\/t\.me\/fitpro_bot\?startapp=g_[a-z0-9]{8}$/); ok('create: owner + invite link');
const code = gym.inviteLink.split('g_')[1];

let pv = await call(BO, 'previewGroup', { code });
assert.deepEqual(pv, { group: { id: gym.id, name: 'Gym', memberCount: 1, ownerName: 'Ali' }, isMember: false }); ok('preview: name, count, owner — no members');
assert.equal(await db.$count(T.groupMembers, eq(T.groupMembers.groupId, gym.id)), 1); ok('preview creates no membership');
let j = await call(BO, 'joinGroup', { code: `g_${code}` });
assert.equal(j.joined, true); assert.equal(j.group.role, 'member');
j = await call(BO, 'joinGroup', { code }); assert.equal(j.joined, false);
assert.equal(await db.$count(T.groupMembers, eq(T.groupMembers.groupId, gym.id)), 2); ok('join is idempotent');
const boM = await db.select().from(T.groupMembers).where(and(eq(T.groupMembers.groupId, gym.id), eq(T.groupMembers.userId, BO))).get();
assert.deepEqual([boM.shareWorkouts, boM.sharePrs, boM.shareRoutines, boM.shareWeight, boM.mutePings], [true, true, true, false, false]); ok('default share settings: workouts, PRs, routines on; weight off');
assert.equal((await call(BO, 'previewGroup', { code })).isMember, true); ok('preview knows you are a member');

await fails(call(CAI, 'joinGroup', { code: 'zzzzzzzz' }), 'INVITE_INVALID');
await fails(call(CAI, 'joinGroup', { code: 'bad' }), 'INVITE_INVALID'); ok('unknown or malformed code → INVITE_INVALID');
await fails(call(BO, 'updateGroup', { groupId: gym.id, name: 'Mine' }), 'NOT_OWNER');
await fails(call(BO, 'resetInvite', { groupId: gym.id }), 'NOT_OWNER');
await fails(call(BO, 'removeMember', { groupId: gym.id, userId: ALI }), 'NOT_OWNER'); ok('owner-only actions refuse members');
await fails(call(CAI, 'leaveGroup', { groupId: gym.id }), 'NOT_FOUND'); ok('non-members get NOT_FOUND');
assert.equal((await call(ALI, 'updateGroup', { groupId: gym.id, name: 'Gym Bros' })).group.name, 'Gym Bros'); ok('owner renames');

// AE6: a removed member can't come back until the link is reset.
await call(DAN, 'joinGroup', { code });
await call(ALI, 'removeMember', { groupId: gym.id, userId: DAN });
await fails(call(DAN, 'previewGroup', { code }), 'REMOVED_FROM_GROUP');
await fails(call(DAN, 'joinGroup', { code }), 'REMOVED_FROM_GROUP'); ok('removed member is blocked on the same link');
gym = (await call(ALI, 'resetInvite', { groupId: gym.id })).group;
const code2 = gym.inviteLink.split('g_')[1];
assert.notEqual(code2, code);
await fails(call(BO, 'previewGroup', { code }), 'INVITE_INVALID');
assert.equal((await call(DAN, 'joinGroup', { code: code2 })).joined, true); ok('reset: old link dead, block cleared, new link works');
await call(DAN, 'leaveGroup', { groupId: gym.id });

// Caps.
for (let i = 0; i < 10; i++) await call(CAI, 'createGroup', { name: `G${i}` });
await fails(call(CAI, 'createGroup', { name: 'G11' }), 'GROUP_LIMIT');
await fails(call(CAI, 'joinGroup', { code: code2 }), 'GROUP_LIMIT'); ok('at most 10 groups per user');
for (const g of (await call(CAI, 'listGroups')).groups) await call(CAI, 'leaveGroup', { groupId: g.id });
assert.equal((await call(CAI, 'listGroups')).groups.length, 0);
assert.equal(await db.$count(T.groups, eq(T.groups.ownerId, CAI)), 0); ok('last member out deletes the group');
const big = (await call(EVE, 'createGroup', { name: 'Big' })).group;
await db.insert(T.groupMembers).values(Array.from({ length: 49 }, (_, i) => ({ groupId: big.id, userId: 9000 + i }))).run();
await fails(call(CAI, 'joinGroup', { code: big.inviteLink.split('g_')[1] }), 'GROUP_FULL'); ok('at most 50 members');
await db.delete(T.groupMembers).where(eq(T.groupMembers.groupId, big.id)).run();
await db.delete(T.groups).where(eq(T.groups.id, big.id)).run();

// Owner leaves → the longest-standing member takes over.
const tmp = (await call(CAI, 'createGroup', { name: 'Tmp' })).group;
const tcode = tmp.inviteLink.split('g_')[1];
await call(DAN, 'joinGroup', { code: tcode }); await call(EVE, 'joinGroup', { code: tcode });
await call(CAI, 'leaveGroup', { groupId: tmp.id });
const tg = await db.select().from(T.groups).where(eq(T.groups.id, tmp.id)).get();
assert.equal(tg.ownerId, DAN); ok('owner leaves → earliest joiner becomes owner');

console.log('Friends: who can see what');
const office = (await call(CAI, 'createGroup', { name: 'Office' })).group;
await call(ALI, 'joinGroup', { code: office.inviteLink.split('g_')[1] });
await call(BO, 'joinGroup', { code: office.inviteLink.split('g_')[1] });
// Bo shares weight in Gym (with Ali) but not in Office (with Ali and Cai).
await call(BO, 'updateMembership', { groupId: gym.id, shareWeight: true });
assert.equal(await canSeeInGroup(ALI, BO, gym.id, 'weight'), true);
assert.equal(await canSeeInGroup(ALI, BO, office.id, 'weight'), false);
assert.equal(await canSeeInGroup(CAI, BO, office.id, 'workouts'), true); ok('in-group check uses that group\'s settings only');
assert.equal(await canSee(ALI, BO, 'weight'), true);
assert.equal(await canSee(CAI, BO, 'weight'), false);
assert.equal(await canSee(EVE, BO, 'workouts'), false);
assert.equal(await canSeeInGroup(EVE, BO, gym.id, 'workouts'), false); ok('anywhere check: needs a shared group that allows it');
await fails(call(BO, 'updateMembership', { groupId: gym.id, shareWeigth: true }), 'INVALID_INPUT'); ok('unknown membership field rejected');

console.log('Friends: invite links in chat');
const onMessage = (await import('../tgcloud/handlers/message.js')).default;
const onCallback = (await import('../tgcloud/handlers/callback_query.js')).default;
const sent = () => globalThis.apiCalls.filter((c) => c[0] === 'sendMessage').map((c) => c[1]);
const btns = (m) => (m.reply_markup?.inline_keyboard || []).flat();
const sayAs = (uid, text) => onMessage({ message_id: 1, from: { id: uid, first_name: NAMES[uid] || 'New', language_code: 'en' }, chat: { id: uid, type: 'private' }, text });
const tapAs = (uid, data) => onCallback({ id: 'cb', from: { id: uid, first_name: NAMES[uid] || 'New', language_code: 'en' }, data, message: { message_id: 7, chat: { id: uid, type: 'private' } } });
globalThis.fakeApi = { ...globalThis.fakeApi, sendMessage: () => ({ message_id: 7 }) };

// AE1 (bot path): link before setup → preview after onboarding, not a membership.
const NEW = 507;
globalThis.apiCalls = []; await sayAs(NEW, `/start g_${code2}`);
assert.match(sent()[0].text, /Hey, New/); ok('/start g_<code> before setup: normal welcome');
globalThis.apiCalls = []; await call(NEW, 'completeOnboarding', { sex: 'female', birthDate: '1990-01-01', heightCm: 170, weightKg: 65, activityLevel: 'moderate', goal: 'maintain', timezone: 'UTC' });
let preview = sent().find((m) => /Gym Bros/.test(m.text));
assert.ok(preview, 'preview sent after onboarding'); assert.equal(btns(preview)[0].callback_data, `g:join:${code2}`);
assert.equal(await db.$count(T.groupMembers, and(eq(T.groupMembers.groupId, gym.id), eq(T.groupMembers.userId, NEW))), 0); ok('after onboarding: group preview with Join, not yet a member');
globalThis.apiCalls = []; await tapAs(NEW, `g:join:${code2}`);
assert.match(globalThis.apiCalls.find((c) => c[0] === 'editMessageText')[1].text, /You joined <b>Gym Bros<\/b>/);
assert.equal(await db.$count(T.groupMembers, and(eq(T.groupMembers.groupId, gym.id), eq(T.groupMembers.userId, NEW))), 1); ok('tap Join → member, message edited');
globalThis.apiCalls = []; await sayAs(EVE, `/start g_${code2}`);
assert.equal(sent().length, 1); assert.match(sent()[0].text, /Ali invited you/);
assert.equal((await call(EVE, 'previewGroup', { code: code2 })).isMember, false); ok('/start g_<code> when set up: preview only');
globalThis.apiCalls = []; await sayAs(EVE, '/start g_zzzzzzzz'); assert.match(sent()[0].text, /expired/); ok('/start with a dead code: friendly text, no crash');
await call(ALI, 'removeMember', { groupId: gym.id, userId: NEW });
globalThis.apiCalls = []; await sayAs(NEW, `/start g_${code2}`); assert.match(sent()[0].text, /removed from this group/); ok('removed user gets the removed text');
globalThis.apiCalls = []; await sayAs(EVE, '/start'); assert.match(sent()[0].text, /Hey, Eve/); ok('plain /start unchanged');

console.log('Friends: feed');
const exercises = (await call(ALI, 'listExercises')).exercises;
const exId = (name) => exercises.find((e) => e.name === name).id;
// A finished workout: [[exercise, kg, reps, sets], …]
async function doWorkout(uid, items, { name, date } = {}) {
  let w = await call(uid, 'startWorkout', { ...(name ? { name } : {}), ...(date ? { date } : {}) });
  for (const [ex, , , count] of items) w = await call(uid, 'addWorkoutExercise', { workoutId: w.workout.id, exerciseId: exId(ex), sets: count });
  for (const [i, [, kg, reps]] of items.entries()) {
    for (const s of w.exercises[i].sets) await call(uid, 'updateSet', { id: s.id, weightKg: kg, reps, completed: true });
  }
  return call(uid, 'finishWorkout', { id: w.workout.id });
}
const ago = (days) => new Date(Date.now() - days * 86400 * 1000);
const setJoined = (groupId, userId, d) => db.update(T.groupMembers).set({ joinedAt: d }).where(and(eq(T.groupMembers.groupId, groupId), eq(T.groupMembers.userId, userId))).run();
for (const [g, u] of [[gym.id, ALI], [gym.id, BO], [office.id, ALI], [office.id, BO], [office.id, CAI]]) await setJoined(g, u, ago(10));

await doWorkout(ALI, [['Barbell Bench Press', 80, 5, 3]], { name: 'Push' });
const fin = await doWorkout(ALI, [['Barbell Bench Press', 85, 5, 3]], { name: 'Push' });
assert.ok(fin.prs.length > 0);
const workoutsOnly = (f) => f.items.filter((i) => i.type === 'workout');
let feed = await call(BO, 'getGroupFeed', { groupId: gym.id });
const item = workoutsOnly(feed)[0];
assert.equal(workoutsOnly(feed).length, 2); assert.equal(item.name, 'Ali'); assert.equal(item.type, 'workout');
assert.equal(item.payload.name, 'Push'); assert.equal(item.payload.totalSets, 3); assert.ok(item.payload.prs.length > 0); ok('groupmate sees finished workouts with PR highlights');
assert.ok(item.payload.prs.every((p) => p.type !== 'reps_at_weight')); ok('feed PRs skip reps-at-weight');

await call(ALI, 'updateMembership', { groupId: gym.id, sharePrs: false });
assert.deepEqual(workoutsOnly(await call(BO, 'getGroupFeed', { groupId: gym.id }))[0].payload.prs, []);
assert.ok(workoutsOnly(await call(CAI, 'getGroupFeed', { groupId: office.id }))[0].payload.prs.length > 0); ok('PRs off in Gym → hidden there, still shown in Office');
await call(ALI, 'updateMembership', { groupId: gym.id, shareWorkouts: false });
assert.equal((await call(BO, 'getGroupFeed', { groupId: gym.id })).items.length, 0);
assert.equal(workoutsOnly(await call(ALI, 'getGroupFeed', { groupId: gym.id })).length, 2); ok('workouts off → groupmates see nothing; you still see your own');
await call(ALI, 'updateMembership', { groupId: gym.id, shareWorkouts: true, sharePrs: true });

await fails(call(EVE, 'getGroupFeed', { groupId: gym.id }), 'NOT_FOUND');
await fails(call(EVE, 'react', { activityId: item.id, emoji: '🔥' }), 'NOT_FOUND'); ok('outsiders can\'t read the feed or react');

let rx = await call(BO, 'react', { activityId: item.id, emoji: '🔥' });
assert.deepEqual(rx.reactions, { '🔥': 1 }); assert.equal(rx.myReaction, '🔥');
rx = await call(BO, 'react', { activityId: item.id, emoji: '💪' }); assert.deepEqual(rx.reactions, { '💪': 1 });
await call(CAI, 'react', { activityId: item.id, emoji: '💪' });
feed = await call(BO, 'getGroupFeed', { groupId: gym.id });
assert.deepEqual(feed.items.find((i) => i.id === item.id).reactions, { '💪': 1 }); assert.equal(feed.items.find((i) => i.id === item.id).myReaction, '💪'); ok('react: one per person; Gym counts only Gym members');
rx = await call(BO, 'react', { activityId: item.id, emoji: '💪' }); assert.equal(rx.myReaction, null); ok('same emoji again removes it');
await fails(call(BO, 'react', { activityId: item.id, emoji: '😀' }), 'INVALID_INPUT'); ok('only the fixed reactions');

let w0 = await call(ALI, 'startWorkout', {}); assert.deepEqual(await call(ALI, 'finishWorkout', { id: w0.workout.id }), { discarded: true });
const wCount = () => db.$count(T.activities, and(eq(T.activities.userId, ALI), eq(T.activities.type, 'workout')));
assert.equal(await wCount(), 2); ok('an empty workout makes no feed item');
const extraW = await doWorkout(ALI, [['Deadlift', 100, 5, 1]]);
await call(BO, 'react', { activityId: workoutsOnly(await call(BO, 'getGroupFeed', { groupId: gym.id }))[0].id, emoji: '👏' });
await call(ALI, 'discardWorkout', { id: extraW.workout.id });
assert.equal(await wCount(), 2);
assert.equal(await db.$count(T.activityReactions, eq(T.activityReactions.userId, BO)), 0); ok('deleting a finished workout removes its item and reactions');

// AE7: Eve joins Gym today. Ali's item from 5 days ago and Eve's own older item stay hidden.
const old = (await db.select().from(T.activities).where(and(eq(T.activities.userId, ALI), eq(T.activities.type, 'workout'))).all())[0];
await db.update(T.activities).set({ createdAt: ago(5) }).where(eq(T.activities.id, old.id)).run();
const eveOld = await doWorkout(EVE, [['Back Squat', 60, 5, 2]]);
await db.update(T.activities).set({ createdAt: ago(3) }).where(eq(T.activities.userId, EVE)).run();   // the workout and its "First workout" badge
await call(EVE, 'joinGroup', { code: code2 });
feed = await call(EVE, 'getGroupFeed', { groupId: gym.id });
assert.ok(!feed.items.some((i) => i.id === old.id)); assert.equal(workoutsOnly(feed).length, 1); ok('new member sees only items from after they joined');
assert.ok(!(await call(BO, 'getGroupFeed', { groupId: gym.id })).items.some((i) => i.userId === EVE)); ok('their own pre-join items stay hidden from the group');
await db.update(T.activities).set({ createdAt: ago(40) }).where(eq(T.activities.id, old.id)).run();
assert.ok(!(await call(BO, 'getGroupFeed', { groupId: gym.id })).items.some((i) => i.id === old.id)); ok('items older than 30 days drop off');

console.log('Friends: leaderboard');
const { goalStreakFrom } = await import('../tgcloud/lib/streaks.js');
const { localDate, addDays, weekStart } = await import('../tgcloud/lib/dates.js');
const TODAY = localDate('UTC'), MON = weekStart(TODAY, 1);
const wk = (n, day = 0) => addDays(MON, -7 * n + day);
assert.equal(goalStreakFrom([wk(1), wk(2), wk(3)], { goal: 1, date: TODAY }), 3);
assert.equal(goalStreakFrom([wk(0), wk(1), wk(2), wk(3)], { goal: 1, date: TODAY }), 4);
assert.equal(goalStreakFrom([wk(1), wk(3)], { goal: 1, date: TODAY }), 1);
assert.equal(goalStreakFrom([wk(1), wk(1, 1), wk(2)], { goal: 2, date: TODAY }), 1); ok('goal streak: full weeks back, this week once met, gaps reset');

const P1 = 511, P2 = 512, P3 = 513;
for (const uid of [P1, P2, P3]) await onboard(uid);
await call(P1, 'updateSettings', { workoutsPerWeek: 3 }); await call(P2, 'updateSettings', { workoutsPerWeek: 2 });
const lift = (await call(P1, 'createGroup', { name: 'Lift' })).group;
for (const uid of [P2, P3]) await call(uid, 'joinGroup', { code: lift.inviteLink.split('g_')[1] });
for (let i = 0; i < 2; i++) await doWorkout(P1, [['Barbell Bench Press', 60, 5, 2]], { date: MON });
for (let i = 0; i < 3; i++) await doWorkout(P2, [['Barbell Bench Press', 60, 5, 2]], { date: MON });
await doWorkout(P1, [['Barbell Bench Press', 60, 5, 2]], { date: wk(1) });      // last week: not counted
const open = await call(P1, 'startWorkout', { date: MON });                       // unfinished: not counted
let board = (await call(P3, 'getGroup', { groupId: lift.id })).leaderboard;
assert.equal(board.from, MON);
const c1 = board.consistency.find((r) => r.userId === P1), c2 = board.consistency.find((r) => r.userId === P2);
assert.deepEqual([c1.done, c1.goal, c1.pct], [2, 3, 67]); assert.deepEqual([c2.done, c2.goal, c2.pct], [3, 2, 100]);
assert.ok(c2.rank < c1.rank); ok('consistency: 2 of 3 = 67%, 3 of 2 = 100% ranked higher; other weeks and open workouts ignored');
assert.equal(board.volume.find((r) => r.userId === P2).sets, 6); assert.equal(board.volume.find((r) => r.userId === P2).volumeKg, 1800); ok('volume: weekly kg and sets');
assert.equal(board.strength.length, 1); assert.equal(board.strength[0].userId, P3); ok('strength: only members sharing weight (and yourself)');
await call(P1, 'discardWorkout', { id: open.workout.id });

// AE2 + KTD7: Bo shares weight in Gym, not Office.
await doWorkout(BO, [['Barbell Bench Press', 100, 1, 1]]);
const gymStr = (await call(ALI, 'getGroup', { groupId: gym.id })).leaderboard.strength;
const boRow = gymStr.find((r) => r.userId === BO);
assert.equal(boRow.lifts[0].e1rmKg, 100); assert.equal(boRow.lifts[0].ratio, 1.25); assert.equal(boRow.lifts[1].ratio, null); ok('bench e1RM 100 kg at 80 kg body weight → 1.25× BW; no squat → empty, not zero');
const offBoard = (await call(CAI, 'getGroup', { groupId: office.id })).leaderboard;
assert.ok(!offBoard.strength.some((r) => r.userId === BO));
assert.ok(offBoard.consistency.some((r) => r.userId === BO)); ok('AE2: Bo missing from Office strength, still on consistency');
await call(P2, 'updateMembership', { groupId: lift.id, shareWeight: true });
await db.delete(T.bodyWeights).where(eq(T.bodyWeights.userId, P2)).run();
assert.ok(!(await call(P1, 'getGroup', { groupId: lift.id })).leaderboard.strength.some((r) => r.userId === P2)); ok('no weigh-in → left off strength, no error');
await fails(call(EVE, 'getGroup', { groupId: lift.id }), 'NOT_FOUND'); ok('outsiders can\'t load a group');
const g = await call(P2, 'getGroup', { groupId: lift.id });
assert.equal(g.members.length, 3); assert.equal(g.me.shareWeight, true); assert.ok(g.group.inviteLink); ok('getGroup: members, my settings, invite link');

console.log('Friends: pings & weekly summary');
const { processActivityPings, processReminders } = await import('../tgcloud/lib/notify.js');
const { BotApiError } = await import('./shim/sdk.js');
const pings = () => globalThis.apiCalls.filter((c) => c[0] === 'sendMessage').map((c) => c[1]);
await db.update(T.activities).set({ notifiedAt: new Date() }).run();
for (const uid of [ALI, BO, EVE, NEW]) await call(uid, 'updateSettings', { quietStart: '00:00', quietEnd: '00:00' });   // no quiet window, whatever the clock says
// AE3: Eve muted Gym, Cai is in quiet hours. Bo shares Gym and Office with Ali.
await call(EVE, 'updateMembership', { groupId: gym.id, mutePings: true });
const hh = (d) => d.toISOString().slice(11, 16);
await call(CAI, 'updateSettings', { quietStart: hh(new Date(Date.now() - 3600e3)), quietEnd: hh(new Date(Date.now() + 3600e3)) });
const a1 = await doWorkout(ALI, [['Barbell Bench Press', 70, 5, 2]], { name: 'Push Day' });
globalThis.apiCalls = []; let pr = await processActivityPings();
assert.deepEqual(pings().map((m) => m.chat_id), [BO]); assert.equal(pr.sent, 1); ok('one ping per recipient across shared groups; muted and quiet-hours recipients skipped');
assert.match(pings()[0].text, /💪 Ali finished Push Day — 2 sets · 700 kg/);
assert.match(pings()[0].reply_markup.inline_keyboard[0][0].web_app.url, /\?group=\d+$/); ok('ping text and a button that opens the group');
assert.ok((await call(EVE, 'getGroupFeed', { groupId: gym.id })).items.some((i) => i.payload.name === 'Push Day'));
assert.ok((await call(CAI, 'getGroupFeed', { groupId: office.id })).items.some((i) => i.payload.name === 'Push Day')); ok('skipped recipients still see it in the feed');
assert.ok(!pings().some((m) => m.chat_id === ALI)); ok('no ping to yourself');
globalThis.apiCalls = []; pr = await processActivityPings(); assert.equal(pings().length, 0); ok('a handled item is never pinged again');
await doWorkout(ALI, [['Barbell Bench Press', 70, 5, 1]]);
globalThis.apiCalls = []; pr = await processActivityPings(); assert.equal(pings().length, 0); assert.equal(pr.skipped, 1); ok('second finish within an hour → no new ping');

await db.update(T.activities).set({ pingedAt: ago(1) }).where(eq(T.activities.workoutId, a1.workout.id)).run();
await call(CAI, 'updateSettings', { quietStart: '23:59', quietEnd: '23:59' });
await call(ALI, 'updateMembership', { groupId: office.id, sharePrs: false });
const a3 = await doWorkout(ALI, [['Barbell Bench Press', 95, 5, 1]]);
assert.ok(a3.prs.length > 0);
const prev = globalThis.fakeApi.sendMessage;
globalThis.fakeApi.sendMessage = (p) => { if (p.chat_id === BO) throw new BotApiError(403, 'Forbidden: bot was blocked by the user'); return { message_id: 8 }; };
globalThis.apiCalls = []; pr = await processActivityPings();
globalThis.fakeApi.sendMessage = prev;
assert.deepEqual([pr.sent, pr.failed], [1, 1]);
const toCai = pings().find((m) => m.chat_id === CAI);
assert.ok(toCai && !/new record/.test(toCai.text)); ok('a blocked recipient doesn\'t stop the others; PR line hidden where PRs aren\'t shared');
const toBo = pings().find((m) => m.chat_id === BO);
assert.match(toBo.text, /🏆 1 new record|🏆 \d+ new records/); ok('PR line shown where PRs are shared (Gym)');
assert.ok((await db.select().from(T.activities).where(eq(T.activities.workoutId, a3.workout.id)).get()).notifiedAt); ok('marked handled even when a send fails');
await call(ALI, 'updateMembership', { groupId: office.id, sharePrs: true });

// Stale: an item from before the scheduler was running isn't pinged (the feed has it).
const staleW = await doWorkout(ALI, [['Barbell Bench Press', 60, 5, 1]]);
await db.update(T.activities).set({ createdAt: new Date(Date.now() - 2 * 3600e3), pingedAt: null }).where(eq(T.activities.workoutId, staleW.workout.id)).run();
await db.update(T.activities).set({ pingedAt: ago(1) }).where(eq(T.activities.userId, ALI)).run();   // no cooldown in the way
globalThis.apiCalls = []; pr = await processActivityPings();
assert.equal(pings().length, 0); assert.ok((await db.select().from(T.activities).where(eq(T.activities.workoutId, staleW.workout.id)).get()).notifiedAt); ok('an item over an hour old is marked handled, not pinged');

// Stale reminders: way overdue → rescheduled without a message.
{
  const R = T.reminders;
  const r = await db.select().from(R).where(and(eq(R.userId, ALI), eq(R.type, 'weekly_summary'))).get();
  await db.update(R).set({ nextRunAt: new Date(Date.now() + 86400e3) }).run();
  await db.update(R).set({ enabled: true, nextRunAt: new Date(Date.now() - 3 * 86400e3) }).where(eq(R.id, r.id)).run();
  globalThis.apiCalls = []; const out = await processReminders();
  assert.equal(pings().length, 0); assert.equal(out.skipped, 1);
  assert.ok((await db.select().from(R).where(eq(R.id, r.id)).get()).nextRunAt > new Date()); ok('a reminder days overdue is skipped and rescheduled, not sent late');
}

// Send budget: 6 activities × 49 recipients > 200 → the 6th waits for the next tick.
const crowd = Array.from({ length: 50 }, (_, i) => 9100 + i);
await db.insert(T.users).values(crowd.map((id) => ({ id, firstName: `C${id}`, quietStart: '00:00', quietEnd: '00:00' }))).run();
const [cg] = await db.insert(T.groups).values({ name: 'Crowd', ownerId: crowd[0], inviteCode: 'crowd001' }).returning();
await db.insert(T.groupMembers).values(crowd.map((userId) => ({ groupId: cg.id, userId }))).run();
await db.insert(T.activities).values(crowd.slice(0, 6).map((userId) => ({ userId, type: 'workout', localDate: TODAY, payload: { name: 'W', totalSets: 1 } }))).run();
globalThis.apiCalls = []; pr = await processActivityPings();
assert.equal(pr.activities, 5); assert.equal(pr.sent, 245);
globalThis.apiCalls = []; pr = await processActivityPings(); assert.equal(pr.activities, 1); assert.equal(pr.sent, 49); ok('send budget: the rest goes out on the next tick');
for (const id of crowd) await db.delete(T.groupMembers).where(eq(T.groupMembers.userId, id)).run();
await db.delete(T.groups).where(eq(T.groups.id, cg.id)).run();
for (const id of crowd) { await db.delete(T.activities).where(eq(T.activities.userId, id)).run(); await db.delete(T.users).where(eq(T.users.id, id)).run(); }

const R = T.reminders;
const dueSummary = (uid) => db.update(R).set({ enabled: true, nextRunAt: new Date(Date.now() - 60e3) }).where(and(eq(R.userId, uid), eq(R.type, 'weekly_summary'))).run();
await db.update(R).set({ nextRunAt: new Date(Date.now() + 86400e3) }).run();
await dueSummary(ALI); await dueSummary(NEW);
globalThis.apiCalls = []; await processReminders();
const sumAli = pings().find((m) => m.chat_id === ALI), sumNew = pings().find((m) => m.chat_id === NEW);
assert.match(sumAli.text, /👥 Gym Bros: #\d of \d in consistency/); assert.match(sumAli.text, /👥 Office: #\d of 3 in consistency/); ok('weekly summary: a standing line per group');
assert.ok(!/👥/.test(sumNew.text)); ok('no groups → weekly summary unchanged');

console.log('Friends: copy a routine');
const landmine = (await call(ALI, 'saveExercise', { name: 'Landmine Press', muscle: 'shoulders', trackType: 'weight_reps', notes: 'Brace' })).exercise;
const pushA = (await call(ALI, 'saveRoutine', { name: 'Push A', items: [
  { exerciseId: exId('Barbell Bench Press'), targetSets: 4, targetRepsMin: 6, targetRepsMax: 8, targetWeightKg: 90, restSec: 150, supersetGroup: 1 },
  { exerciseId: landmine.id, targetSets: 3, targetRepsMin: 10, targetWeightKg: 30, supersetGroup: 1 },
] })).routine;
let mr = await call(BO, 'listMemberRoutines', { userId: ALI });
assert.equal(mr.member.name, 'Ali'); assert.ok(mr.routines.some((r) => r.name === 'Push A')); ok('groupmate\'s routines are listed');
// AE5: Bo has no "Landmine Press" → gets his own copy; target weights empty.
let copied = (await call(BO, 'copyRoutine', { routineId: pushA.id })).routine;
assert.equal(copied.name, 'Push A'); assert.equal(copied.userId, BO);
assert.deepEqual(copied.items.map((i) => [i.targetSets, i.targetRepsMin, i.targetRepsMax, i.targetWeightKg, i.supersetGroup]), [[4, 6, 8, null, 1], [3, 10, 10, null, 1]]);
assert.equal(copied.items[0].exerciseId, exId('Barbell Bench Press'));
const boLandmine = await db.select().from(T.exercises).where(eq(T.exercises.id, copied.items[1].exerciseId)).get();
assert.equal(boLandmine.userId, BO); assert.equal(boLandmine.name, 'Landmine Press'); assert.equal(boLandmine.notes, 'Brace'); ok('AE5: custom exercise cloned, built-ins shared, weights empty, supersets kept');
copied = (await call(BO, 'copyRoutine', { routineId: pushA.id })).routine;
assert.equal(copied.name, 'Push A (Ali)'); assert.equal(copied.items[1].exerciseId, boLandmine.id); ok('second copy: name gets a suffix, existing exercise reused');
const cw = await call(BO, 'startWorkout', { routineId: copied.id }); assert.equal(cw.exercises.length, 2); await call(BO, 'discardWorkout', { id: cw.workout.id }); ok('a copied routine starts a workout');
await call(CAI, 'saveExercise', { name: 'landmine press', muscle: 'shoulders', trackType: 'weight_reps' });
const caiCopy = (await call(CAI, 'copyRoutine', { routineId: pushA.id })).routine;
assert.equal((await db.select().from(T.exercises).where(eq(T.exercises.id, caiCopy.items[1].exerciseId)).get()).userId, CAI); ok('same name in a different case → reused');
await call(ALI, 'updateMembership', { groupId: gym.id, shareRoutines: false });
await call(ALI, 'updateMembership', { groupId: office.id, shareRoutines: false });
await fails(call(BO, 'listMemberRoutines', { userId: ALI }), 'NOT_FOUND');
await fails(call(BO, 'copyRoutine', { routineId: pushA.id }), 'NOT_FOUND'); ok('routines off → can\'t list or copy');
await call(ALI, 'updateMembership', { groupId: gym.id, shareRoutines: true });
await fails(call(CAI, 'copyRoutine', { routineId: pushA.id }), 'NOT_FOUND'); ok('allowed only via a group that shares routines (Office doesn\'t)');
await fails(call(DAN, 'listMemberRoutines', { userId: ALI }), 'NOT_FOUND'); ok('outsiders can\'t see routines');


console.log('Sharing: workout card');
{
  const { encodeBase64 } = await import('../tgcloud/lib/base64.js');
  const png = encodeBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]));
  const prevApi = { ...globalThis.fakeApi };
  globalThis.fakeApi.sendPhoto = () => ({ message_id: 55, photo: [{ file_id: 'small' }, { file_id: 'card' }] });
  globalThis.fakeApi.savePreparedInlineMessage = () => ({ id: 'prep1', expiration_date: 0 });
  const done = await doWorkout(BO, [['Barbell Bench Press', 80, 5, 3]], { name: 'Push Day' });
  globalThis.apiCalls = [];
  const r = await call(BO, 'prepareShare', { workoutId: done.workout.id, imageBase64: `data:image/png;base64,${png}` });
  assert.deepEqual(r, { id: 'prep1' });
  assert.deepEqual(globalThis.apiCalls.map((c) => c[0]).filter((m) => m !== 'getMe'), ['sendPhoto', 'deleteMessage', 'savePreparedInlineMessage']);   // getMe is cached
  const prep = globalThis.apiCalls.find((c) => c[0] === 'savePreparedInlineMessage')[1];
  assert.equal(prep.user_id, BO); assert.equal(prep.result.type, 'photo'); assert.equal(prep.result.photo_file_id, 'card');
  assert.match(prep.result.caption, /^💪 Push Day — .* · 3 sets · 1,200 kg\nTracked with FitPro$/);
  assert.equal(prep.result.reply_markup.inline_keyboard[0][0].url, 'https://t.me/fitpro_bot?startapp=ref'); ok('share: upload → file_id → prepared message with an Open FitPro link');
  await fails(call(ALI, 'prepareShare', { workoutId: done.workout.id, imageBase64: png }), 'NOT_FOUND'); ok("can't share someone else's workout");
  const openW = await call(BO, 'startWorkout', {});
  await fails(call(BO, 'prepareShare', { workoutId: openW.workout.id, imageBase64: png }), 'NOT_FINISHED');
  await call(BO, 'discardWorkout', { id: openW.workout.id }); ok('unfinished workout → NOT_FINISHED');
  await fails(call(BO, 'prepareShare', { workoutId: done.workout.id, imageBase64: encodeBase64(new Uint8Array([1, 2, 3])) }), 'INVALID_INPUT'); ok('not an image → INVALID_INPUT');
  globalThis.fakeApi.deleteMessage = () => { throw new BotApiError(400, 'message can\'t be deleted'); };
  assert.deepEqual(await call(BO, 'prepareShare', { workoutId: done.workout.id, imageBase64: png }), { id: 'prep1' }); ok('a failed cleanup delete doesn\'t fail the share');
  globalThis.fakeApi.sendPhoto = () => { throw new BotApiError(403, 'Forbidden: bot can\'t initiate conversation with a user'); };
  await fails(call(BO, 'prepareShare', { workoutId: done.workout.id, imageBase64: png }), 'BOT_CHAT_REQUIRED'); ok('never opened the bot chat → BOT_CHAT_REQUIRED');
  globalThis.fakeApi = prevApi;
}

console.log('Achievements');
{
  const UA = T.userAchievements;
  const codes = async (uid, where = {}) => (await db.select().from(UA).where(eq(UA.userId, uid)).all())
    .filter((r) => where.silent === undefined || r.silent === where.silent).map((r) => r.code).sort();
  // AE4: an existing user with 60 workouts — backfilled silently, then the 100th is announced.
  const OLD = 521;
  await onboard(OLD);
  await db.update(T.users).set({ achievementsEvaluatedAt: null }).where(eq(T.users.id, OLD)).run();   // onboarded before achievements existed
  const fake = (count) => Array.from({ length: count }, (_, i) => ({ userId: OLD, name: 'Old', localDate: addDays(TODAY, -400 + i), startedAt: ago(400 - i), endedAt: ago(400 - i), totalSets: 1, totalVolumeKg: 100 }));
  await db.insert(T.workouts).values(fake(60)).run();
  const list = await call(OLD, 'getAchievements');
  assert.deepEqual(await codes(OLD, { silent: true }), ['first_workout', 'workouts_10', 'workouts_50']);
  assert.equal(list.earnedCount, 3); assert.equal(list.achievements.length, 12);
  assert.equal(await db.$count(T.activities, eq(T.activities.userId, OLD)), 0); ok('AE4: history backfilled silently — no feed items');
  await call(OLD, 'getAchievements'); assert.equal((await codes(OLD)).length, 3); ok('evaluating again never duplicates');
  await db.insert(T.workouts).values(fake(39)).run();
  const hundred = await doWorkout(OLD, [['Back Squat', 60, 5, 1]]);
  assert.deepEqual(hundred.achievements, [{ code: 'workouts_100' }]);
  const achAct = await db.select().from(T.activities).where(and(eq(T.activities.userId, OLD), eq(T.activities.type, 'achievement'))).get();
  assert.deepEqual(achAct.payload, { codes: ['workouts_100'] }); ok('the 100th workout is announced, with a feed item');
  const quiet = await doWorkout(OLD, [['Back Squat', 50, 5, 1]]);
  assert.deepEqual(quiet.achievements, []); ok('a finish that crosses no threshold earns nothing');

  // A brand-new user: their first workout is announced; PR baselines don't count.
  const NEWBIE = 522;
  await onboard(NEWBIE);
  await call(NEWBIE, 'getAchievements');
  const first = await doWorkout(NEWBIE, [['Barbell Bench Press', 40, 5, 1]]);
  assert.deepEqual(first.achievements, [{ code: 'first_workout' }]); ok('new user: "First workout" announced, not silent');
  assert.ok(!(await codes(NEWBIE)).includes('first_pr')); ok('baseline records don\'t count as a first record');
  const second = await doWorkout(NEWBIE, [['Barbell Bench Press', 45, 5, 1]]);
  assert.deepEqual(second.achievements, [{ code: 'first_pr' }]); ok('beating a record → "First record"');
}

console.log('Challenges');
{
  const [X, Y, Z, J] = [531, 532, 533, 534];
  for (const uid of [X, Y, Z, J]) { await onboard(uid); await call(uid, 'updateSettings', { quietStart: '00:00', quietEnd: '00:00' }); }
  const cg = (await call(X, 'createGroup', { name: 'Chal' })).group;
  const ccode = cg.inviteLink.split('g_')[1];
  for (const uid of [Y, Z, J]) await call(uid, 'joinGroup', { code: ccode });
  const week = { startDate: TODAY, endDate: addDays(TODAY, 6) };
  await doWorkout(X, [['Barbell Bench Press', 50, 10, 2]], { date: addDays(TODAY, -1) });   // before the start: ignored
  await doWorkout(X, [['Barbell Bench Press', 50, 10, 2]], { date: TODAY });
  await doWorkout(X, [['Barbell Bench Press', 50, 10, 2]], { date: TODAY });
  await doWorkout(Y, [['Push-up', null, 20, 3]], { date: TODAY });
  await doWorkout(Z, [['Push-up', null, 30, 3]], { date: TODAY });
  await call(Z, 'updateMembership', { groupId: cg.id, shareWorkouts: false });
  await doWorkout(J, [['Push-up', null, 50, 3]], { date: TODAY });
  await setJoined(cg.id, J, new Date(Date.now() + 60e3));                                     // "joined after that workout"
  const pushUp = exId('Push-up');
  const results = {};
  for (const metric of ['workouts', 'volume_kg', 'sets', 'active_days', 'exercise_reps']) {
    const c = (await call(Y, 'createChallenge', { groupId: cg.id, metric, ...week, ...(metric === 'exercise_reps' ? { exerciseId: pushUp } : {}) })).challenge;
    results[metric] = Object.fromEntries(c.standings.map((r) => [r.userId, r.value]));
    if (metric !== 'exercise_reps') await call(Y, 'deleteChallenge', { id: c.id });
  }
  assert.deepEqual(results.workouts, { [X]: 2, [Y]: 1, [J]: 0 });
  assert.deepEqual(results.volume_kg, { [X]: 2000, [Y]: 0, [J]: 0 });
  assert.deepEqual(results.sets, { [X]: 4, [Y]: 3, [J]: 0 });
  assert.deepEqual(results.active_days, { [X]: 1, [Y]: 1, [J]: 0 });
  assert.deepEqual(results.exercise_reps, { [Y]: 60, [X]: 0, [J]: 0 }); ok('standings for every metric; two workouts on one day = one active day');
  ok('out-of-range workouts ignored, members not sharing workouts absent, pre-join workouts excluded');

  await fails(call(Y, 'createChallenge', { groupId: cg.id, metric: 'workouts', startDate: addDays(TODAY, -1), endDate: TODAY }), 'INVALID_INPUT');
  await fails(call(Y, 'createChallenge', { groupId: cg.id, metric: 'workouts', startDate: TODAY, endDate: addDays(TODAY, 90) }), 'INVALID_INPUT');
  const custom = (await call(Y, 'saveExercise', { name: 'My Curl', muscle: 'arms', trackType: 'weight_reps' })).exercise;
  await fails(call(Y, 'createChallenge', { groupId: cg.id, metric: 'exercise_reps', exerciseId: custom.id, ...week }), 'INVALID_INPUT'); ok('bad dates, over 90 days, custom exercise → INVALID_INPUT');
  for (let i = 0; i < 4; i++) await call(X, 'createChallenge', { groupId: cg.id, metric: 'sets', ...week });
  await fails(call(X, 'createChallenge', { groupId: cg.id, metric: 'sets', ...week }), 'CHALLENGE_LIMIT'); ok('at most 5 running challenges');
  const listed = (await call(J, 'listChallenges', { groupId: cg.id })).challenges;
  assert.equal(listed.length, 5); assert.equal(listed[0].status, 'running');
  await fails(call(J, 'deleteChallenge', { id: listed[0].id }), 'NOT_OWNER'); ok('only the creator or owner can delete');
  await fails(call(EVE, 'listChallenges', { groupId: cg.id }), 'NOT_FOUND'); ok('outsiders can\'t see challenges');

  // Results: once, after the end date. Y (the creator of the reps challenge) deletes their data first.
  const { processEndedChallenges } = await import('../tgcloud/lib/challenges.js');
  const reps = listed.find((c) => c.metric === 'exercise_reps');
  await db.update(T.challenges).set({ startDate: TODAY, endDate: TODAY, target: 50 }).where(eq(T.challenges.id, reps.id)).run();
  globalThis.apiCalls = []; let pc = await processEndedChallenges(); assert.equal(pc.challenges, 0); ok('not sent before the end date');
  await call(Y, 'deleteMyData', { confirm: 'DELETE' });
  assert.equal((await db.select().from(T.challenges).where(eq(T.challenges.id, reps.id)).get()).createdBy, X);
  assert.equal(await db.$count(T.challenges, eq(T.challenges.createdBy, Y)), 0); ok('creator deletes their data → the owner becomes the creator');
  await db.update(T.challenges).set({ startDate: addDays(TODAY, -1), endDate: addDays(TODAY, -1) }).where(eq(T.challenges.id, reps.id)).run();
  await doWorkout(X, [['Push-up', null, 60, 1]], { date: addDays(TODAY, -1) });
  globalThis.apiCalls = []; pc = await processEndedChallenges();
  const msgs = globalThis.apiCalls.filter((c) => c[0] === 'sendMessage').map((c) => c[1]);
  assert.equal(pc.challenges, 1); assert.deepEqual(msgs.map((m) => m.chat_id).sort(), [X, J].sort());
  const toX = msgs.find((m) => m.chat_id === X).text;
  assert.match(toX, /^🏁 Challenge over: Most Push-up reps\n\n🥇 User — 60 reps/); assert.match(toX, /You: #1 of 2 — 60 reps\n🎯 Target reached!/); ok('results go to every participant, with medals, rank and target');
  globalThis.apiCalls = []; pc = await processEndedChallenges(); assert.equal(pc.challenges, 0); ok('results are sent only once');
  await call(X, 'leaveGroup', { groupId: cg.id }); await call(J, 'leaveGroup', { groupId: cg.id }); await call(Z, 'leaveGroup', { groupId: cg.id });
  assert.equal(await db.$count(T.challenges, eq(T.challenges.groupId, cg.id)), 0); ok('deleting a group deletes its challenges');
}

console.log('Export');
{
  const { cell, toCsv } = await import('../tgcloud/lib/export.js');
  assert.equal(cell('a,b'), '"a,b"'); assert.equal(cell('say "hi"'), '"say ""hi"""'); assert.equal(cell('two\nlines'), '"two\nlines"');
  assert.equal(cell('Жим лёжа'), 'Жим лёжа'); assert.equal(cell(82.5), '82.5'); assert.equal(cell(null), ''); assert.equal(cell(-5), '-5');
  assert.equal(cell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`); assert.equal(cell('+1'), "'+1"); assert.equal(cell('@me'), "'@me"); ok('CSV cells: quoting, Cyrillic, formula guard (numbers untouched)');
  assert.equal(toCsv(['a', 'b'], [[1, 'x']]), 'a,b\r\n1,x\r\n'); ok('CSV rows end with CRLF');

  const XP = 541;
  await onboard(XP);
  const decode = (f) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(f.bytes);   // keep the BOM visible
  globalThis.apiCalls = [];
  assert.deepEqual(await call(XP, 'exportData'), { files: ['fitpro-weight.csv'] });
  const docCall = globalThis.apiCalls.find((c) => c[0] === 'sendDocument');
  assert.ok(docCall && !globalThis.apiCalls.some((c) => c[0] === 'sendMediaGroup'));
  assert.equal(decode(docCall[1].document), '﻿date,weight_kg\r\n' + `${TODAY},80\r\n`); ok('only body weight (right after onboarding) → one sendDocument, BOM, kg');
  await assert.rejects(call(XP, 'exportData'), (e) => e.parameters.code === 'RATE_LIMITED' && e.parameters.retryAfterSec > 3500); ok('again within the hour → RATE_LIMITED with retryAfterSec');
  await db.update(T.users).set({ lastExportAt: ago(1 / 12) }).where(eq(T.users.id, XP)).run();   // 2 hours ago
  const lm = (await call(XP, 'saveExercise', { name: '=HYPERLINK("x")', muscle: 'arms', trackType: 'weight_reps' })).exercise;
  let xw = await call(XP, 'startWorkout', { name: 'Arms' });
  xw = await call(XP, 'addWorkoutExercise', { workoutId: xw.workout.id, exerciseId: lm.id, sets: 1 });
  await call(XP, 'updateSet', { id: xw.exercises[0].sets[0].id, weightKg: 20, reps: 10, completed: true });
  await call(XP, 'finishWorkout', { id: xw.workout.id });
  globalThis.apiCalls = [];
  assert.deepEqual((await call(XP, 'exportData')).files, ['fitpro-workouts.csv', 'fitpro-weight.csv']);
  const group = globalThis.apiCalls.find((c) => c[0] === 'sendMediaGroup')[1];
  assert.equal(group.media.length, 2); assert.equal(group.media[0].type, 'document'); assert.ok(group.media[1].caption && !group.media[0].caption);
  assert.match(decode(group.media[0].media), /\r\n\d{4}-\d{2}-\d{2},Arms,"'=HYPERLINK\(""x""\)",working,20,10,/); ok('workouts + weight → one media group of 2 documents; formula-looking names neutralised');
  await db.update(T.users).set({ lastExportAt: null }).where(eq(T.users.id, XP)).run();
  const prevApi = { ...globalThis.fakeApi };
  globalThis.fakeApi.sendMediaGroup = () => { throw new BotApiError(403, 'Forbidden: bot was blocked by the user'); };
  await fails(call(XP, 'exportData'), 'BOT_CHAT_REQUIRED');
  assert.equal((await db.select().from(T.users).where(eq(T.users.id, XP)).get()).lastExportAt, null); ok("send fails → BOT_CHAT_REQUIRED, and the hourly limit isn't used up");
  globalThis.fakeApi = prevApi;
  const EMPTY = 542;
  await onboard(EMPTY);
  await db.delete(T.bodyWeights).where(eq(T.bodyWeights.userId, EMPTY)).run();
  await fails(call(EMPTY, 'exportData'), 'NOTHING_TO_EXPORT'); ok('no data at all → NOTHING_TO_EXPORT');
}

console.log('Programs');
{
  const PU = 551;
  await onboard(PU);
  const PE = T.programEnrollments;
  const lp = await call(PU, 'listPrograms');
  assert.deepEqual(lp.programs.map((p) => p.code), ['full_body_beginner', 'ppl_12', 'wendler_531']); assert.equal(lp.activeCode, null);
  assert.deepEqual(lp.suggestedMaxes, { ohp: null, deadlift: null, bench: null, squat: null }); ok('three programs; no history → no suggested maxes');
  let my = await call(PU, 'enrollProgram', { code: 'wendler_531', oneRepMaxes: { bench: 111, squat: 160, deadlift: 200, ohp: 70 } });
  assert.equal(my.program.code, 'wendler_531'); assert.deepEqual(my.enrollment.trainingMaxes, { ohp: 62.5, deadlift: 180, bench: 100, squat: 145 });
  assert.equal(my.routines.length, 4); assert.equal(my.week, 1); ok('enrol in 5/3/1: training maxes from the 1RMs, four routines');
  const sched = (await call(PU, 'listRoutines')).week;
  const byDay = Object.fromEntries(sched.map((d) => [d.weekday, d.routineId]));
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((d) => !!byDay[d]), [true, true, false, true, true, false, false]); ok('schedule replaced with the program\'s week');
  await fails(call(PU, 'enrollProgram', { code: 'ppl_12' }), 'PROGRAM_ACTIVE'); ok('one program at a time');

  await db.update(PE).set({ startDate: addDays(TODAY, -7) }).where(eq(PE.userId, PU)).run();   // now in week 2
  const benchDay = my.routines.find((r) => r.day === 2);
  let pw = await call(PU, 'startWorkout', { routineId: benchDay.id });
  assert.deepEqual(pw.exercises[0].sets.map((x) => [x.weightKg, x.reps]), [[70, 3], [80, 3], [90, 3]]);
  assert.deepEqual(pw.exercises[1].sets.map((x) => [x.weightKg, x.reps]), Array(5).fill([null, 10])); ok('week 2 bench day: 70/80/90 × 3, then 5 × 10 rows — not the routine targets');
  assert.equal(pw.exercises[0].target, null); ok('program workouts show no uniform routine target');
  for (const e of pw.exercises) for (const x of e.sets) await call(PU, 'updateSet', { id: x.id, weightKg: x.weightKg ?? 30, reps: x.reps, completed: true });
  const pf = await call(PU, 'finishWorkout', { id: pw.workout.id });
  assert.deepEqual(pf.progression, []); ok('progression rules leave program routines alone');

  await call(PU, 'leaveProgram');
  assert.equal(await db.$count(T.routines, and(eq(T.routines.userId, PU), isNull(T.routines.archivedAt))), 0);
  assert.ok((await call(PU, 'listRoutines')).week.every((d) => !d.routineId));
  assert.equal(await db.$count(T.workouts, eq(T.workouts.userId, PU)), 1);
  assert.equal((await call(PU, 'getMyProgram')).program, null); ok('leave: routines archived, schedule cleared, workouts kept');
  pw = await call(PU, 'startWorkout', { routineId: benchDay.id });
  assert.deepEqual(pw.exercises[0].sets.map((x) => x.weightKg), [70, 80, 90]); ok('a routine from an ended program starts like any routine (copies last session)');
  await call(PU, 'discardWorkout', { id: pw.workout.id });
  assert.ok((await call(PU, 'listPrograms')).suggestedMaxes.bench > 0); ok('history → suggested 1RM for the next enrolment');

  my = await call(PU, 'enrollProgram', { code: 'ppl_12' });
  await db.update(PE).set({ startDate: addDays(TODAY, -21) }).where(and(eq(PE.userId, PU), eq(PE.programCode, 'ppl_12'))).run();
  my = await call(PU, 'getMyProgram'); assert.equal(my.week, 4); assert.equal(my.deload, true);
  pw = await call(PU, 'startWorkout', { routineId: my.routines.find((r) => r.day === 0).id });
  assert.equal(pw.exercises[0].sets.length, 2); assert.equal(pw.exercises[0].sets[0].weightKg, 90); ok('PPL week 4: deload sets at last session\'s weight');
  await call(PU, 'discardWorkout', { id: pw.workout.id });
  await call(PU, 'leaveProgram');

  my = await call(PU, 'enrollProgram', { code: 'full_body_beginner' });
  await db.update(PE).set({ startDate: addDays(TODAY, -56) }).where(and(eq(PE.userId, PU), isNull(PE.endedAt))).run();   // past its 8 weeks
  my = await call(PU, 'getMyProgram');
  assert.equal(my.program, null); assert.equal(my.lastEnded.code, 'full_body_beginner');
  assert.ok((await call(PU, 'listRoutines')).week.every((d) => !d.routineId)); ok('a finished 8-week program ends itself, with the same cleanup');
  await fails(call(PU, 'leaveProgram'), 'NOT_FOUND'); ok('nothing to leave → NOT_FOUND');
  await fails(call(PU, 'enrollProgram', { code: 'nope' }), 'INVALID_INPUT'); ok('unknown program → INVALID_INPUT');
}

console.log('Group chats');
{
  const onMember = (await import('../tgcloud/handlers/my_chat_member.js')).default;
  const { processGroupChatPosts } = await import('../tgcloud/lib/bot/group-chat.js');
  const [OW, NOPE, TAP] = [561, 562, 564];
  for (const uid of [OW, TAP]) await onboard(uid);
  await sayAs(OW, '/start');   // the owner has a private chat with the bot
  const prevApi = { ...globalThis.fakeApi };
  const admins = new Set([`-1001:${OW}`, `-1003:${OW}`]);
  globalThis.fakeApi.getChatMember = ({ chat_id, user_id }) => ({ status: admins.has(`${chat_id}:${user_id}`) ? 'administrator' : 'member' });
  const tgUser = (id) => ({ id, first_name: NAMES[id] || `U${id}`, language_code: 'en' });
  const chat = (id) => ({ id, type: 'supergroup', title: `Chat ${id}` });
  const added = (chatId, by) => onMember({ chat: chat(chatId), from: tgUser(by), date: 0, old_chat_member: { status: 'left' }, new_chat_member: { status: 'member' } });
  const removed = (chatId, by) => onMember({ chat: chat(chatId), from: tgUser(by), date: 0, old_chat_member: { status: 'member' }, new_chat_member: { status: 'left' } });
  const linkedTo = (chatId) => db.select().from(T.groups).where(eq(T.groups.chatId, chatId)).get();
  const posted = () => globalThis.apiCalls.filter((c) => c[0] === 'sendMessage').map((c) => c[1]);
  const groupSay = (chatId, uid, text, extra = {}) => onMessage({ message_id: 9, from: tgUser(uid), chat: chat(chatId), text, ...extra });
  const groupTap = (chatId, uid, data) => onCallback({ id: `cb${uid}`, from: tgUser(uid), data, message: { message_id: 9, chat: chat(chatId) } });
  const answered = () => globalThis.apiCalls.filter((c) => c[0] === 'answerCallbackQuery').at(-1)[1];

  globalThis.apiCalls = []; await added(-1001, OW);
  const linked = await linkedTo(-1001);
  assert.ok(linked); assert.equal(linked.ownerId, OW); assert.equal(linked.name, 'Chat -1001'); assert.ok(linked.nextPostAt > new Date());
  const joinMsg = posted()[0];
  assert.match(joinMsg.text, /This chat now has a FitPro group/); assert.equal(joinMsg.reply_markup.inline_keyboard[0][0].callback_data, `g:join:${linked.inviteCode}`); ok('bot added by a set-up admin → linked group + Join button');
  admins.add(`-1001:${TAP}`);
  globalThis.apiCalls = []; await added(-1001, TAP);
  assert.equal(await db.$count(T.groups, eq(T.groups.chatId, -1001)), 1); assert.equal((await linkedTo(-1001)).ownerId, OW); ok('re-added by another admin → same group, same owner');
  globalThis.apiCalls = []; await added(-1002, OW);
  assert.ok(!(await linkedTo(-1002))); assert.match(posted()[0].text, /a chat admin who uses FitPro/); assert.ok(posted()[0].reply_markup.inline_keyboard[0][0].url); ok('adder not a chat admin → no group, setup message with a link button');
  globalThis.apiCalls = []; await added(-1003, NOPE);
  assert.ok(!(await linkedTo(-1003))); ok('adder without FitPro → no group');
  const extra = [];
  for (let i = 0; i < 9; i++) extra.push((await call(OW, 'createGroup', { name: `Cap ${i}` })).group.id);
  admins.add(`-1004:${OW}`);
  globalThis.apiCalls = []; await added(-1004, OW);
  assert.ok(!(await linkedTo(-1004))); assert.match(posted()[0].text, /a chat admin who uses FitPro/); ok('adder already in 10 groups → no group');
  for (const id of extra) await call(OW, 'leaveGroup', { groupId: id });
  assert.ok(posted().every((m) => (m.reply_markup?.inline_keyboard || []).flat().every((b) => !b.web_app))); ok('no web_app buttons in group chats');

  globalThis.apiCalls = []; await groupTap(-1001, TAP, `g:join:${linked.inviteCode}`);
  assert.match(answered().url, new RegExp(`start=g_${linked.inviteCode}$`));
  assert.equal(await db.$count(T.groupMembers, and(eq(T.groupMembers.groupId, linked.id), eq(T.groupMembers.userId, TAP))), 0); ok('Join without a private chat with the bot → link to start it, no membership');
  await sayAs(TAP, '/start');
  globalThis.apiCalls = []; await groupTap(-1001, TAP, `g:join:${linked.inviteCode}`);
  assert.match(answered().text, /You joined Chat -1001/);
  assert.ok(!globalThis.apiCalls.some((c) => c[0] === 'sendMessage')); ok('after /start: Join adds them, answered in place (nothing posted)');

  await doWorkout(TAP, [['Barbell Bench Press', 60, 5, 2]]);
  globalThis.apiCalls = []; await groupSay(-1001, TAP, '/leaderboard');
  assert.match(posted()[0].text, /Nobody is shown here yet/); ok('/leaderboard lists nobody until members opt in');
  await call(TAP, 'updateMembership', { groupId: linked.id, showInChat: true });
  globalThis.apiCalls = []; await groupSay(-1001, OW, '/leaderboard@fitpro_bot');
  const board = posted()[0];
  assert.equal(board.text, '📊 <b>Chat -1001</b> — this week\n1. User — 1/4');   // only the opted-in member
  assert.match(board.reply_markup.inline_keyboard[0][0].url, /startapp=g_/); ok('/leaderboard@bot: only opted-in members, link button into the app');
  globalThis.apiCalls = []; await groupSay(-1002, OW, '/leaderboard'); assert.match(posted()[0].text, /a chat admin who uses FitPro/); ok('/leaderboard in an unlinked chat explains the setup');
  globalThis.apiCalls = []; await groupSay(-1001, OW, 'hello everyone'); assert.equal(globalThis.apiCalls.length, 0); ok('other group messages are ignored');
  const tapGetGroup = await call(TAP, 'getGroup', { groupId: linked.id });
  assert.equal(tapGetGroup.group.chatLinked, true); assert.equal(tapGetGroup.me.showInChat, true); ok('the app knows the group is linked');

  await groupSay(-1001, OW, '', { migrate_to_chat_id: -1009 });
  assert.equal((await db.select().from(T.groups).where(eq(T.groups.id, linked.id)).get()).chatId, -1009); ok('chat upgraded to a supergroup → link follows the new id');
  await db.update(T.groups).set({ nextPostAt: new Date(Date.now() - 1000) }).where(eq(T.groups.id, linked.id)).run();
  globalThis.apiCalls = []; let pp = await processGroupChatPosts();
  assert.equal(pp.sent, 1); assert.equal(posted()[0].chat_id, -1009); assert.match(posted()[0].text, /this week/);
  assert.ok((await db.select().from(T.groups).where(eq(T.groups.id, linked.id)).get()).nextPostAt > new Date());
  globalThis.apiCalls = []; pp = await processGroupChatPosts(); assert.equal(pp.sent, 0); ok('weekly post goes out once, then rescheduled to next Monday');
  await db.update(T.groups).set({ nextPostAt: new Date(Date.now() - 1000) }).where(eq(T.groups.id, linked.id)).run();
  globalThis.fakeApi.sendMessage = () => { throw new BotApiError(403, 'Forbidden: bot was kicked from the supergroup chat'); };
  pp = await processGroupChatPosts(); globalThis.fakeApi = { ...prevApi, getChatMember: globalThis.fakeApi.getChatMember };
  assert.equal(pp.unlinked, 1); assert.equal((await db.select().from(T.groups).where(eq(T.groups.id, linked.id)).get()).chatId, null); ok('a chat the bot was kicked from gets unlinked');

  await db.update(T.groups).set({ chatId: -1001 }).where(eq(T.groups.id, linked.id)).run();
  await removed(-1001, OW);
  const after = await db.select().from(T.groups).where(eq(T.groups.id, linked.id)).get();
  assert.equal(after.chatId, null); assert.equal(await db.$count(T.groupMembers, eq(T.groupMembers.groupId, linked.id)), 2); ok('bot removed → chat unlinked, group and members kept');
  globalThis.fakeApi = prevApi;
}

console.log('Friends: delete my data');
{
  // Dan owns "Tmp" with Eve. His feed item has Eve's reaction; he reacted to Eve's.
  // He also has achievements, a program and a challenge he created.
  const dW = await doWorkout(DAN, [['Deadlift', 120, 3, 1]]);
  await call(DAN, 'enrollProgram', { code: 'full_body_beginner' });
  await call(DAN, 'createChallenge', { groupId: tmp.id, metric: 'workouts', startDate: TODAY, endDate: addDays(TODAY, 6) });
  assert.ok(await db.$count(T.userAchievements, eq(T.userAchievements.userId, DAN)));
  const dAct = await db.select().from(T.activities).where(eq(T.activities.workoutId, dW.workout.id)).get();
  await call(EVE, 'react', { activityId: dAct.id, emoji: '🔥' });
  const eAct = await db.select().from(T.activities).where(eq(T.activities.userId, EVE)).get();
  await call(DAN, 'react', { activityId: eAct.id, emoji: '👏' });
  await call(DAN, 'deleteMyData', { confirm: 'DELETE' });
  const tmpNow = await db.select().from(T.groups).where(eq(T.groups.id, tmp.id)).get();
  assert.equal(tmpNow.ownerId, EVE);
  assert.equal((await db.select().from(T.groupMembers).where(and(eq(T.groupMembers.groupId, tmp.id), eq(T.groupMembers.userId, EVE))).get()).role, 'owner'); ok('owner deletes their data → the other member owns the group');
  const left = [];
  for (const [name, tbl] of Object.entries({ groupMembers: T.groupMembers, groupBlocks: T.groupBlocks, activities: T.activities, activityReactions: T.activityReactions, userAchievements: T.userAchievements, programEnrollments: T.programEnrollments })) {
    if (await db.$count(tbl, eq(tbl.userId, DAN))) left.push(name);
  }
  if (await db.$count(T.groups, eq(T.groups.ownerId, DAN))) left.push('groups');
  if (await db.$count(T.challenges, eq(T.challenges.createdBy, DAN))) left.push('challenges');
  if (await db.$count(T.activityReactions, eq(T.activityReactions.activityId, dAct.id))) left.push('reactions on his items');
  assert.deepEqual(left, []); ok('no friends rows left for the deleted user');
}

console.log('Friends: translations');
{
  // The bot only has shared + friends + bot strings; the Mini App has shared + friends + its own.
  const fs = await import('node:fs');
  const { mergeDicts } = await import('../tgcloud/lib/i18n/core.js');
  const load = async (f) => { const m = await import(f); return m.default || m.BOT; };
  const common = await Promise.all(['../tgcloud/lib/i18n/shared.js', '../tgcloud/lib/i18n/friends.js'].map(load));
  const BOT_DICT = mergeDicts(...common, await load('../tgcloud/lib/i18n/bot.js'));
  const APP_DICT = mergeDicts(...common, ...await Promise.all(['common', 'account', 'workout', 'food', 'progress', 'guides', 'social'].map((f) => load(`../src/i18n/${f}.js`))));
  const BOT_FILES = ['tgcloud/lib/bot/friends.js', 'tgcloud/lib/notify.js', 'tgcloud/lib/share.js', 'tgcloud/lib/bot/workout.js', 'tgcloud/lib/challenges.js', 'tgcloud/lib/data/achievements.js', 'tgcloud/lib/export.js', 'tgcloud/lib/bot/group-chat.js'];
  const APP_FILES = [
    'src/screens/Friends.jsx', 'src/screens/Group.jsx', 'src/screens/GroupSettings.jsx', 'src/screens/GroupInvite.jsx', 'src/screens/MemberRoutines.jsx',
    'src/lib/share-card.js', 'src/ui/ShareButton.jsx', 'src/screens/Progress.jsx', 'src/screens/WorkoutSummary.jsx', 'src/ui/Challenges.jsx', 'src/screens/Settings.jsx',
    'src/screens/Programs.jsx', 'src/screens/Train.jsx', 'src/screens/Home.jsx',
    'tgcloud/lib/data/achievements.js',
  ];
  // Server errors from the friends modules are shown by both, so they must be shared.
  const ERROR_FILES = ['tgcloud/lib/groups.js', 'tgcloud/lib/activity.js', 'tgcloud/lib/challenges.js', 'tgcloud/lib/share.js', 'tgcloud/lib/own-chat.js', 'tgcloud/lib/export.js', 'tgcloud/lib/programs.js'];
  const keysOf = (f, { errors = false } = {}) => {
    const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    const keys = new Set();
    const add = (re) => { for (const m of src.matchAll(re)) keys.add(m[1]); };
    if (errors) {
      add(/\b(?:refuse|invalid)\(\s*'((?:[^'\\]|\\.)+)'/g);
      return keys;
    }
    add(/\bt\('((?:[^'\\]|\\.)+)'/g);
    add(/\bt\.n\([^,]+,\s*'(?:[^'\\]|\\.)+',\s*'((?:[^'\\]|\\.)+)'/g);
    add(/\b(?:title|hint|label|sub): '((?:[^'\\]|\\.)+)'/g);
    return keys;
  };
  const missing = [];
  const check = (files, dict, opts) => { for (const f of files) for (const k of keysOf(f, opts)) for (const l of ['ru', 'uz']) if (!(k in dict[l])) missing.push(`${f} [${l}] ${k}`); };
  check(BOT_FILES, BOT_DICT);
  check(APP_FILES, APP_DICT);
  check(ERROR_FILES, mergeDicts(...common), { errors: true });
  // Program names, descriptions and day names: routines get them from the bot's translator.
  const { PROGRAMS } = await import('../tgcloud/lib/data/programs.js');
  for (const p of PROGRAMS) for (const k of [p.name, p.about, ...p.days.map((d) => d.name)]) for (const l of ['ru', 'uz']) if (!(k in BOT_DICT[l]) || !(k in APP_DICT[l])) missing.push(`programs [${l}] ${k}`);
  assert.deepEqual(missing, []); ok('every friends string has ru and uz, in the dictionary its runtime loads');
}
console.log(`\nAll ${n} friends checks passed`);
