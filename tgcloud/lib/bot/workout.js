import { db } from 'sdk';
import { eq } from 'sdk/db';
import * as T from '../../schema.js';
import { getWorkout, getActiveWorkout, startWorkout, updateSet, deleteSet, finishWorkout } from '../workouts.js';
import { listRoutines } from '../routines.js';
import { setBotState } from '../users.js';
import { describePr } from '../strength.js';
import { formatWeight, formatDuration, fromKg, toKg, round } from '../units.js';
import { send, edit, inline, appButton, esc } from './ui.js';

// The chat workout card: one message showing the next set, edited in place as you
// tap Done / ± / Skip / Next. Callback data (≤ 64 bytes):
//   w:d:<setId>  done      w:a:<setId>:<field>:<delta>  adjust     w:s:<setId>  skip set
//   w:n:<workoutId> next exercise   w:f:<workoutId> finish   w:go:<routineId> start

const WEIGHTED = ['weight_reps', 'weighted_bodyweight'];

function setText(set, track, unit) {
  if (track === 'duration') return formatDuration(set.durationSec || 0);
  if (track === 'distance_duration') return `${round((set.distanceM || 0) / 1000, 2)} km · ${formatDuration(set.durationSec || 0)}`;
  if (WEIGHTED.includes(track) && set.weightKg) return `${formatWeight(set.weightKg, unit)} × ${set.reps ?? '?'}`;
  return `${set.reps ?? '?'} reps`;
}

function adjustButtons(set, track, unit) {
  const a = (label, field, delta) => ({ text: label, callback_data: `w:a:${set.id}:${field}:${delta}` });
  if (WEIGHTED.includes(track)) {
    const step = unit === 'lb' ? 5 : 2.5;
    return [a(`−${step} ${unit}`, 'w', -step), a(`+${step} ${unit}`, 'w', step), a('−1 rep', 'r', -1), a('+1 rep', 'r', 1)];
  }
  if (track === 'duration') return [a('−15 s', 't', -15), a('+15 s', 't', 15)];
  if (track === 'distance_duration') return [a('−0.5 km', 'm', -500), a('+0.5 km', 'm', 500), a('−1 min', 't', -60), a('+1 min', 't', 60)];
  return [a('−1 rep', 'r', -1), a('+1 rep', 'r', 1)];
}

// Text + buttons for the open workout's next set (focus = exercise picked via "Next").
export async function renderCard(user, workoutId, note = '') {
  const d = await getWorkout(user, { id: workoutId });
  const w = d.workout;
  if (!w || w.endedAt) return null;
  const unit = user.weightUnit;
  const open = (e) => e.sets.some((s) => !s.completed);
  const focusId = user.botState && user.botState.focusWe;
  const ex = d.exercises.find((e) => e.id === focusId && open(e)) || d.exercises.find(open);
  const all = d.exercises.flatMap((e) => e.sets.filter((s) => s.setType !== 'warmup'));
  const minutes = Math.max(0, Math.round((Date.now() - w.startedAt.getTime()) / 60000));
  const lines = [`🏋️ <b>${esc(w.name)}</b> · ${minutes} min · ${all.filter((s) => s.completed).length}/${all.length} sets`];

  if (!ex) {
    lines.push('', d.exercises.length ? 'All planned sets done 💪' : 'No exercises yet — add them in the app.');
    if (note) lines.push('', note);
    return { text: lines.join('\n'), reply_markup: inline([[{ text: '🏁 Finish workout', callback_data: `w:f:${w.id}` }], [appButton('📱 Open in app')]]) };
  }

  const track = ex.exercise.trackType;
  const working = ex.sets.filter((s) => s.setType !== 'warmup');
  const set = ex.sets.find((s) => !s.completed);
  const n = working.indexOf(set) + 1;
  const prev = ex.previous.filter((p) => p.setType !== 'warmup');
  lines.push('', `<b>${esc(ex.exercise.name)}</b> — ${set.setType === 'warmup' ? 'warm-up' : `set ${n} of ${working.length}`}`);
  if (prev.length) lines.push(`Last time: ${prev.map((p) => setText(p, track, unit)).join(', ')}`);
  lines.push(`▶️ <b>${setText(set, track, unit)}</b>`);
  if (note) lines.push('', note);

  const others = d.exercises.filter((e) => e.id !== ex.id && open(e));
  return {
    text: lines.join('\n'),
    reply_markup: inline([
      [{ text: '✅ Done', callback_data: `w:d:${set.id}` }],
      adjustButtons(set, track, unit),
      [{ text: '⏭ Skip set', callback_data: `w:s:${set.id}` }, others.length ? { text: 'Next exercise ▸', callback_data: `w:n:${w.id}` } : null],
      [appButton('📱 App'), { text: '🏁 Finish', callback_data: `w:f:${w.id}` }],
    ]),
  };
}

// Sends a fresh card (and remembers it for rest pings) or edits an existing one.
export async function showCard(user, chatId, workoutId, { messageId = null, note = '' } = {}) {
  const card = await renderCard(user, workoutId, note);
  if (!card) {
    // Tapped on an old card after the workout was finished or discarded elsewhere.
    if (messageId) await edit(chatId, messageId, 'This workout is already finished — see it in the app.', { reply_markup: inline([[appButton()]]) });
    return null;
  }
  if (messageId) return edit(chatId, messageId, card.text, { reply_markup: card.reply_markup });
  const msg = await send(chatId, card.text, { reply_markup: card.reply_markup });
  await db.update(T.workouts).set({ chatMessageId: msg.message_id }).where(eq(T.workouts.id, workoutId)).run();
  return msg;
}

// "🏋️ Workout": the running workout's card, or a routine picker.
export async function workoutMenu(user, chatId) {
  const active = await getActiveWorkout(user.id);
  if (active) return showCard(user, chatId, active.id);
  const { routines, week } = await listRoutines(user);
  const todayId = (week.find((d) => d.isToday) || {}).routineId;
  if (!routines.length) {
    return send(chatId, 'You have no routines yet. Create one in the app — e.g. “Push A” with bench, overhead press and dips.', { reply_markup: inline([[appButton('📱 Create a routine')]]) });
  }
  const sorted = [...routines].sort((a, b) => (b.id === todayId) - (a.id === todayId));
  return send(chatId, 'Which workout?', {
    reply_markup: inline([
      ...sorted.filter((r) => r.exerciseCount).slice(0, 8).map((r) => [{ text: `▶️ ${r.name}${r.id === todayId ? ' · today' : ''}`, callback_data: `w:go:${r.id}` }]),
      [appButton('📱 Open app')],
    ]),
  });
}

async function startFromChat(user, chatId, messageId, routineId) {
  let workoutId;
  try {
    workoutId = (await startWorkout(user, { routineId })).workout.id;
  } catch (e) {
    if (!e.parameters || e.parameters.code !== 'WORKOUT_IN_PROGRESS') throw e;
    workoutId = (await getActiveWorkout(user.id)).id;
  }
  await setBotState(user.id, null);
  await edit(chatId, messageId, '🏋️ Workout started — let’s go.');
  return showCard({ ...user, botState: null }, chatId, workoutId);
}

const FIELD = { w: 'weightKg', r: 'reps', t: 'durationSec', m: 'distanceM' };

// Handles every "w:…" button. Returns the short text for answerCallbackQuery.
export async function onWorkoutButton(user, chatId, messageId, data) {
  const [, action, a, b, c] = data.split(':');

  if (action === 'go') { await startFromChat(user, chatId, messageId, Number(a)); return 'Started'; }

  // Set buttons only act on an open workout's not-yet-done set; anything else
  // (an old card, a double tap) just refreshes the card.
  const liveSet = async (setId) => {
    const set = await db.select().from(T.sets).where(eq(T.sets.id, setId)).get();
    if (!set || set.userId !== user.id) return { gone: true };
    const w = await db.select({ endedAt: T.workouts.endedAt }).from(T.workouts).where(eq(T.workouts.id, set.workoutId)).get();
    return { set, stale: !w || !!w.endedAt || set.completed };
  };

  if (action === 'd') {
    const { set, gone, stale } = await liveSet(Number(a));
    if (gone) return 'That set is gone';
    if (stale) { await showCard(user, chatId, set.workoutId, { messageId }); return 'Already done'; }
    const r = await updateSet(user, { id: set.id, completed: true });
    const notes = r.prs.length ? r.prs.filter((p) => p.type !== 'reps_at_weight').map((p) => `🏆 New PR · ${describePr(p, (kg) => formatWeight(kg, user.weightUnit))}`) : [];
    if (r.restEndsAt) notes.push(`⏱ Rest ${formatDuration(Math.round((new Date(r.restEndsAt).getTime() - Date.now()) / 1000))}`);
    await db.update(T.workouts).set({ chatMessageId: messageId }).where(eq(T.workouts.id, set.workoutId)).run();
    await showCard(user, chatId, set.workoutId, { messageId, note: notes.join('\n') });
    return r.prs.length ? '🏆 New PR!' : 'Done ✓';
  }

  if (action === 'a') {
    const { set, gone, stale } = await liveSet(Number(a));
    if (gone) return 'That set is gone';
    if (stale) { await showCard(user, chatId, set.workoutId, { messageId }); return 'Already done'; }
    const field = FIELD[b];
    let delta = Number(c);
    if (field === 'weightKg') delta = toKg(delta, user.weightUnit);
    const current = field === 'weightKg' ? set.weightKg || 0 : set[field] || 0;
    let next = Math.max(0, current + delta);
    if (field === 'weightKg') next = round(user.weightUnit === 'lb' ? toKg(Math.round(fromKg(next, 'lb') * 2) / 2, 'lb') : next, 3);
    await updateSet(user, { id: set.id, [field]: next });
    await showCard(user, chatId, set.workoutId, { messageId });
    return '';
  }

  if (action === 's') {
    const { set, gone, stale } = await liveSet(Number(a));
    if (gone) return 'That set is gone';
    if (stale) { await showCard(user, chatId, set.workoutId, { messageId }); return 'Already done'; }
    await deleteSet(user, { id: set.id });
    await showCard(user, chatId, set.workoutId, { messageId });
    return 'Skipped';
  }

  if (action === 'n') {
    const d = await getWorkout(user, { id: Number(a) });
    const open = d.exercises.filter((e) => e.sets.some((s) => !s.completed));
    const focusId = user.botState && user.botState.focusWe;
    // The card shows the focused exercise, or the first open one when none is focused.
    const i = Math.max(0, open.findIndex((e) => e.id === focusId));
    const next = open[(i + 1) % open.length];
    const state = { ...(user.botState || {}), focusWe: next ? next.id : null };
    await setBotState(user.id, state);
    await showCard({ ...user, botState: state }, chatId, Number(a), { messageId });
    return next ? next.exercise.name : '';
  }

  if (action === 'f') {
    const r = await finishWorkout(user, { id: Number(a) });
    await setBotState(user.id, null);
    if (r.discarded) { await edit(chatId, messageId, 'Workout discarded — nothing was logged.'); return 'Discarded'; }
    const w = r.workout;
    const lines = [
      `✅ <b>${esc(w.name)}</b> done`,
      `${formatDuration(w.durationSec)} · ${r.totals.totalSets} sets · ${formatWeight(r.totals.totalVolumeKg, user.weightUnit, { digits: 0 })}`,
    ];
    const prs = r.prs.filter((p) => p.type !== 'reps_at_weight');
    if (prs.length) lines.push('', '🏆 <b>New records</b>', ...prs.map((p) => `• ${esc(p.exerciseName)} — ${describePr(p, (kg) => formatWeight(kg, user.weightUnit))}`));
    if (r.progression.length) lines.push('', `📈 ${r.progression.length} target${r.progression.length === 1 ? '' : 's'} went up for next time`);
    await edit(chatId, messageId, lines.join('\n'), { reply_markup: inline([[appButton('📱 See in app')]]) });
    return 'Finished 💪';
  }
  return '';
}
