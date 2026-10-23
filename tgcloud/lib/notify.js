import { db, api, BotApiError } from 'sdk';
import { eq, and, isNull, isNotNull, asc, inArray } from 'sdk/db';
import { atOrBefore, atOrAfter } from './db-util.js';
import * as T from '../schema.js';
import { MINI_APP_URL, TICK_CHANNEL_ID } from './config.js';
import { getUser, today } from './users.js';
import { dueReminders, markSent } from './reminders.js';
import { localTime, inWindow, daysBetween } from './dates.js';
import { formatEnergy, formatWeight } from './units.js';
import { tr, shortDate } from './i18n/bot.js';
import { catalogName } from './i18n/catalog.js';
import { sumNutrients } from './nutrition.js';
import { dayLogs } from './food.js';
import { routineForDate } from './routines.js';
import { weekStats, lastTrainedByMuscle, TRACKED_MUSCLES } from './stats.js';
import { prHighlights } from './prs.js';
import { groupmatesOf } from './social.js';
import { computeLeaderboard } from './leaderboard.js';
import { processEndedChallenges } from './challenges.js';
import { processGroupChatPosts } from './bot/group-chat.js';

const MUSCLE = { chest: 'Chest', back: 'Back', legs: 'Legs', shoulders: 'Shoulders', arms: 'Arms', core: 'Core', cardio: 'Cardio', full_body: 'Full body' };

// Called by the `tick` endpoint once a minute: sends due reminders and rest-over
// pings for workouts logged in chat. Each reminder is rescheduled even when it is
// skipped (nothing to say) or fails, so one bad row can't jam the queue.

function openApp(user, path = '') {
  if (!MINI_APP_URL) return {};
  return { reply_markup: { inline_keyboard: [[{ text: tr(user)('Open FitPro'), web_app: { url: MINI_APP_URL + path } }]] } };
}

async function composeReminder(r, user, now) {
  const t = tr(user);
  const date = today(user);
  const energy = (kcal) => formatEnergy(kcal, user.energyUnit, { lang: user.language });
  switch (r.type) {
    case 'meal': {
      const eaten = sumNutrients(await dayLogs(user.id, date));
      return `🍽 ${user.kcalTarget
        ? t('Time to log your meal. Today so far: {eaten} of {target}.', { eaten: energy(eaten.kcal), target: energy(user.kcalTarget) })
        : t('Time to log your meal. Today so far: {eaten}.', { eaten: energy(eaten.kcal) })}`;
    }
    case 'weigh_in': {
      const done = await db.select({ id: T.bodyWeights.id }).from(T.bodyWeights)
        .where(and(eq(T.bodyWeights.userId, user.id), eq(T.bodyWeights.localDate, date))).get();
      if (done) return null;
      return `⚖️ ${t('Morning weigh-in. Send your weight, like {sample}, or log it in the app.', { sample: user.weightUnit === 'lb' ? '180' : user.language === 'en' ? '82.4' : '82,4' })}`;
    }
    case 'workout_day': {
      const plan = await routineForDate(user, date);
      if (!plan) return null;
      const trained = await db.select({ id: T.workouts.id }).from(T.workouts)
        .where(and(eq(T.workouts.userId, user.id), eq(T.workouts.localDate, date))).get();
      if (trained) return null;
      return `🏋️ ${t('Today')}: ${plan.name} · ${t.n(plan.exerciseCount, '{n} exercise', '{n} exercises')} · ~${plan.estMinutes} ${t('min')}`;
    }
    case 'missed_muscle': {
      if (inWindow(localTime(user.timezone, now), user.quietStart, user.quietEnd)) return null;
      const days = (r.params && r.params.days) || 7;
      const last = await lastTrainedByMuscle(user.id);
      const missed = TRACKED_MUSCLES.filter((m) => last.has(m) && daysBetween(last.get(m), date) >= days);
      if (!missed.length) return null;
      const list = missed.map((m) => `${t(MUSCLE[m] || m)} (${t.n(daysBetween(last.get(m), date), '{n} day', '{n} days')})`).join(', ');
      return `👀 ${t('Not trained lately: {list}.', { list })}`;
    }
    case 'weekly_summary': {
      const w = await weekStats(user, date);
      const prs = await prHighlights(user.id, { from: w.from, to: w.to });
      const lines = [
        `📊 ${t('Your week ({from} – {to})', { from: shortDate(user.language, w.from), to: shortDate(user.language, w.to) })}`,
        t('Workouts: {done} of {target}', { done: w.workouts, target: w.target }),
        t('Volume: {v}', { v: formatWeight(w.volumeKg, user.weightUnit, { digits: 0, lang: user.language }) }),
      ];
      if (w.avgKcal) lines.push(t('Average intake: {v}', { v: energy(w.avgKcal) }));
      if (prs.length) lines.push(t('New records: {n}', { n: prs.length }));
      lines.push(...await groupStandings(user, date));
      return lines.join('\n');
    }
    default:
      return null;
  }
}

// One line per friends group for the weekly summary: "Gym: #2 of 5 in consistency".
async function groupStandings(user, date) {
  const t = tr(user);
  const mine = await db.select({ groupId: T.groupMembers.groupId }).from(T.groupMembers).where(eq(T.groupMembers.userId, user.id)).all();
  if (!mine.length) return [];
  const groups = await db.select().from(T.groups).where(inArray(T.groups.id, mine.map((m) => m.groupId))).all();
  const lines = [];
  for (const g of groups) {
    const board = (await computeLeaderboard(g.id, user.id, date)).consistency;
    const me = board.find((r) => r.userId === user.id);
    if (me && board.length > 1) lines.push(`👥 ${t('{group}: #{rank} of {n} in consistency', { group: g.name, rank: me.rank, n: board.length })}`);
  }
  return lines.length ? ['', ...lines] : [];
}

async function disableReminders(userId) {
  await db.update(T.reminders).set({ enabled: false }).where(eq(T.reminders.userId, userId)).run();
}

async function send(user, text) {
  await api.sendMessage({ chat_id: user.id, text, ...openApp(user) });
}

// A reminder this late (the scheduler was down, or never ran) would arrive at the wrong
// time of day — skip it and move on to its next run.
const REMINDER_STALE_MS = 15 * 60 * 1000;

export async function processReminders(now = new Date()) {
  const due = await dueReminders(now);
  const out = { due: due.length, sent: 0, skipped: 0, failed: 0 };
  for (const r of due) {
    const user = await getUser(r.userId);
    if (!user) { await db.delete(T.reminders).where(eq(T.reminders.id, r.id)).run(); continue; }
    if (now.getTime() - r.nextRunAt.getTime() > REMINDER_STALE_MS) { out.skipped++; await markSent(r, user, now); continue; }
    try {
      const text = await composeReminder(r, user, now);
      if (text) { await send(user, text); out.sent++; } else out.skipped++;
      await markSent(r, user, now);
    } catch (e) {
      out.failed++;
      await markSent(r, user, now);
      if (e instanceof BotApiError && e.code === 403) await disableReminders(user.id);   // user blocked the bot
      else console.error('reminder failed', r.id, e);
    }
  }
  return out;
}

// The next set still to do in a workout: "Bench Press 80 kg × 8".
async function nextSetText(user, workoutId) {
  const sets = await db.select().from(T.sets)
    .where(and(eq(T.sets.workoutId, workoutId), eq(T.sets.completed, false)))
    .orderBy(asc(T.sets.position)).all();
  if (!sets.length) return null;
  const wes = await db.select().from(T.workoutExercises).where(eq(T.workoutExercises.workoutId, workoutId)).all();
  const order = new Map(wes.map((w) => [w.id, w.position]));
  sets.sort((a, b) => (order.get(a.workoutExerciseId) - order.get(b.workoutExerciseId)) || a.position - b.position);
  const s = sets[0];
  const ex = await db.select({ name: T.exercises.name }).from(T.exercises).where(eq(T.exercises.id, s.exerciseId)).get();
  const load = s.weightKg ? `${formatWeight(s.weightKg, user.weightUnit, { lang: user.language })} × ${s.reps ?? '?'}` : s.reps ? `× ${s.reps}` : '';
  return `${ex ? catalogName(user.language, ex.name) : tr(user)('Next set')} ${load}`.trim();
}

// Only workouts logged in chat (chat_message_id set) get a ping — the Mini App
// shows its own countdown.
export async function processRestTimers(now = new Date()) {
  const W = T.workouts;
  const due = await db.select().from(W)
    .where(and(isNull(W.endedAt), isNotNull(W.restEndsAt), isNotNull(W.chatMessageId), atOrBefore(W.restEndsAt, now)))
    .limit(200).all();
  let sent = 0;
  for (const w of due) {
    await db.update(W).set({ restEndsAt: null }).where(eq(W.id, w.id)).run();
    const user = await getUser(w.userId);
    if (!user) continue;
    const next = await nextSetText(user, w.id);
    try {
      const t = tr(user);
      await api.sendMessage({ chat_id: user.id, text: `⏱ ${next ? t('Rest over — next: {next}', { next }) : t('Rest over')}` });
      sent++;
    } catch (e) {
      console.warn('rest ping failed', w.id, e.description || e.message);
    }
  }
  return sent;
}

// ── Friends: "Ali finished Push Day" ─────────────────────────────────────────────

const PING_BATCH = 100;          // activities per tick
const PING_SEND_BUDGET = 200;    // messages per tick, so reminders aren't starved
const PING_COOLDOWN_MS = 60 * 60 * 1000;
const PING_STALE_MS = 60 * 60 * 1000;        // older news isn't worth a message (the feed still has it)

// Who gets a ping for an activity and what it says. A recipient needs a shared group
// where the actor shows workouts and that the recipient hasn't muted; the PR line
// needs a shared group where the actor also shows PRs.
function pingRecipients(mates) {
  const out = [];
  for (const mate of mates) {
    const visible = mate.groups.filter((g) => g.member.shareWorkouts);
    const unmuted = visible.filter((g) => !g.viewer.mutePings);
    if (!unmuted.length) continue;
    out.push({ userId: mate.userId, groupId: unmuted[0].groupId, prs: visible.some((g) => g.member.sharePrs) });
  }
  return out;
}

function pingText(recipient, actor, a, showPrs) {
  const t = tr(recipient);
  const p = a.payload || {};
  const parts = [t.n(p.totalSets || 0, '{n} set', '{n} sets')];
  if (p.totalVolumeKg) parts.push(formatWeight(p.totalVolumeKg, recipient.weightUnit, { digits: 0, lang: recipient.language }));
  const lines = [`💪 ${t('{name} finished {workout}', { name: actor.firstName || t('A friend'), workout: p.name || t('a workout') })} — ${parts.join(' · ')}`];
  const prs = (p.prs || []).length;
  if (showPrs && prs) lines.push(`🏆 ${t.n(prs, '{n} new record', '{n} new records')}`);
  return lines.join('\n');
}

export async function processActivityPings(now = new Date()) {
  const A = T.activities;
  const pending = await db.select().from(A)
    .where(and(isNull(A.notifiedAt), eq(A.type, 'workout'))).orderBy(asc(A.id)).limit(PING_BATCH).all();
  const out = { activities: 0, sent: 0, skipped: 0, failed: 0 };
  for (const a of pending) {
    if (out.sent >= PING_SEND_BUDGET) break;
    await db.update(A).set({ notifiedAt: now }).where(eq(A.id, a.id)).run();
    out.activities++;
    if (now.getTime() - a.createdAt.getTime() > PING_STALE_MS) { out.skipped++; continue; }
    const recent = await db.select({ id: A.id }).from(A)
      .where(and(eq(A.userId, a.userId), atOrAfter(A.pingedAt, new Date(now.getTime() - PING_COOLDOWN_MS)))).get();
    if (recent) { out.skipped++; continue; }   // one ping per person per hour
    const actor = await getUser(a.userId);
    if (!actor) continue;
    let pinged = false;
    for (const r of pingRecipients(await groupmatesOf(a.userId))) {
      const recipient = await getUser(r.userId);
      if (!recipient) continue;
      if (inWindow(localTime(recipient.timezone, now), recipient.quietStart, recipient.quietEnd)) { out.skipped++; continue; }
      try {
        await api.sendMessage({ chat_id: recipient.id, text: pingText(recipient, actor, a, r.prs), ...openApp(recipient, `?group=${r.groupId}`) });
        out.sent++; pinged = true;
      } catch (e) {
        out.failed++;
        if (!(e instanceof BotApiError && e.code === 403)) console.warn('friend ping failed', a.id, e.description || e.message);
      }
    }
    if (pinged) await db.update(A).set({ pingedAt: now }).where(eq(A.id, a.id)).run();
  }
  return out;
}

// handlers/channel_post: the heartbeat channel's "tick" runs the scheduler; any other
// channel post is ignored. `channelId` is a parameter for tests.
// "ping" does the same and answers in the channel with what it did — a health check
// you can post by hand (or have the worker post) to see the heartbeat is wired up.
export async function onChannelPost(post, channelId = TICK_CHANNEL_ID) {
  if (!channelId || !post || !post.chat || post.chat.id !== channelId) return null;
  const text = (post.text || '').trim().toLowerCase();   // phones capitalise: "Ping"
  if (text !== 'tick' && text !== 'ping') return null;
  const out = await tick();
  if (text === 'ping') {
    const r = out.reminders;
    await api.sendMessage({
      chat_id: channelId,
      text: `pong ✓ ${out.at.toISOString().slice(0, 16)} UTC\nreminders: ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed (${r.due} due)\nrest pings: ${out.restPings} · friend pings: ${out.friendPings.sent} · challenge results: ${out.challengeResults.sent} · chat posts: ${out.chatPosts.sent}`,
      disable_notification: true,
    });
  }
  return out;
}

// Endpoint shape (caller, input); the caller is the scheduler identity, not a user.
export async function tick() {
  const now = new Date();
  const reminders = await processReminders(now);
  const restPings = await processRestTimers(now);
  const friendPings = await processActivityPings(now);
  const challengeResults = await processEndedChallenges();
  const chatPosts = await processGroupChatPosts(now);
  return { at: now, reminders, restPings, friendPings, challengeResults, chatPosts };
}

