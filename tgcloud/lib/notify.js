import { db, api, BotApiError } from 'sdk';
import { eq, and, isNull, isNotNull, lte, asc } from 'sdk/db';
import * as T from '../schema.js';
import { MINI_APP_URL } from './config.js';
import { getUser, today } from './users.js';
import { dueReminders, markSent } from './reminders.js';
import { localTime, inWindow, daysBetween } from './dates.js';
import { formatEnergy, formatWeight } from './units.js';
import { sumNutrients } from './nutrition.js';
import { dayLogs } from './food.js';
import { routineForDate } from './routines.js';
import { weekStats, lastTrainedByMuscle, TRACKED_MUSCLES } from './stats.js';
import { prHighlights } from './prs.js';

// Called by the `tick` endpoint once a minute: sends due reminders and rest-over
// pings for workouts logged in chat. Each reminder is rescheduled even when it is
// skipped (nothing to say) or fails, so one bad row can't jam the queue.

function openApp(path = '') {
  if (!MINI_APP_URL) return {};
  return { reply_markup: { inline_keyboard: [[{ text: 'Open FitPro', web_app: { url: MINI_APP_URL + path } }]] } };
}

async function composeReminder(r, user, now) {
  const date = today(user);
  switch (r.type) {
    case 'meal': {
      const eaten = sumNutrients(await dayLogs(user.id, date));
      const target = user.kcalTarget ? ` of ${formatEnergy(user.kcalTarget, user.energyUnit)}` : '';
      return `🍽 Time to log your meal. Today so far: ${formatEnergy(eaten.kcal, user.energyUnit)}${target}.`;
    }
    case 'weigh_in': {
      const done = await db.select({ id: T.bodyWeights.id }).from(T.bodyWeights)
        .where(and(eq(T.bodyWeights.userId, user.id), eq(T.bodyWeights.localDate, date))).get();
      if (done) return null;
      return `⚖️ Morning weigh-in. Send /weight ${user.weightUnit === 'lb' ? '180' : '82.4'} or log it in the app.`;
    }
    case 'workout_day': {
      const plan = await routineForDate(user, date);
      if (!plan) return null;
      const trained = await db.select({ id: T.workouts.id }).from(T.workouts)
        .where(and(eq(T.workouts.userId, user.id), eq(T.workouts.localDate, date))).get();
      if (trained) return null;
      return `🏋️ Today: ${plan.name} · ${plan.exerciseCount} exercises · ~${plan.estMinutes} min`;
    }
    case 'missed_muscle': {
      if (inWindow(localTime(user.timezone, now), user.quietStart, user.quietEnd)) return null;
      const days = (r.params && r.params.days) || 7;
      const last = await lastTrainedByMuscle(user.id);
      const missed = TRACKED_MUSCLES.filter((m) => last.has(m) && daysBetween(last.get(m), date) >= days);
      if (!missed.length) return null;
      const list = missed.map((m) => `${m} (${daysBetween(last.get(m), date)} days)`).join(', ');
      return `👀 Not trained lately: ${list}.`;
    }
    case 'weekly_summary': {
      const w = await weekStats(user, date);
      const prs = await prHighlights(user.id, { from: w.from, to: w.to });
      const lines = [
        `📊 Your week (${w.from} – ${w.to})`,
        `Workouts: ${w.workouts} of ${w.target}`,
        `Volume: ${formatWeight(w.volumeKg, user.weightUnit, { digits: 0 })}`,
      ];
      if (w.avgKcal) lines.push(`Average intake: ${formatEnergy(w.avgKcal, user.energyUnit)}`);
      if (prs.length) lines.push(`New records: ${prs.length}`);
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
  await api.sendMessage({ chat_id: user.id, text, ...openApp() });
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
  const load = s.weightKg ? `${formatWeight(s.weightKg, user.weightUnit)} × ${s.reps ?? '?'}` : s.reps ? `× ${s.reps}` : '';
  return `${ex ? ex.name : 'Next set'} ${load}`.trim();
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
      await api.sendMessage({ chat_id: user.id, text: next ? `⏱ Rest over — next: ${next}` : '⏱ Rest over' });
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

