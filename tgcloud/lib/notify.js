import { db, api, BotApiError } from 'sdk';
import { eq, and, isNull, isNotNull, lte, asc } from 'sdk/db';
import * as T from '../schema.js';
import { MINI_APP_URL } from './config.js';
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
      return lines.join('\n');
    }
    default:
      return null;
  }
}

async function disableReminders(userId) {
  await db.update(T.reminders).set({ enabled: false }).where(eq(T.reminders.userId, userId)).run();
}

async function send(user, text) {
  await api.sendMessage({ chat_id: user.id, text, ...openApp(user) });
}

export async function processReminders(now = new Date()) {
  const due = await dueReminders(now);
  const out = { due: due.length, sent: 0, skipped: 0, failed: 0 };
  for (const r of due) {
    const user = await getUser(r.userId);
    if (!user) { await db.delete(T.reminders).where(eq(T.reminders.id, r.id)).run(); continue; }
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
    .where(and(isNull(W.endedAt), isNotNull(W.restEndsAt), isNotNull(W.chatMessageId), lte(W.restEndsAt, now)))
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

// Endpoint shape (caller, input); the caller is the scheduler identity, not a user.
export async function tick() {
  const now = new Date();
  const reminders = await processReminders(now);
  const restPings = await processRestTimers(now);
  return { at: now, reminders, restPings };
}

