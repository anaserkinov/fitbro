import { api } from 'sdk';
import { MINI_APP_URL } from '../config.js';
import { today, setBotState } from '../users.js';
import { getToday } from '../stats.js';
import { logWeight, deleteWeight, savePhotoSizes } from '../body.js';
import { logWater, undoWater } from '../food.js';
import { toKg, fromKg, formatWeight, formatEnergy } from '../units.js';
import { send, edit, inline, appButton, esc, mainKeyboard } from './ui.js';

const signed = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '±0');
// A kg difference shown in the user's unit, e.g. '−0.5 kg'.
const delta = (kg, unit) => `${signed(Math.round(fromKg(kg, unit) * 10) / 10)} ${unit}`;

// ── /start ──────────────────────────────────────────────────────────────────────

export async function start(user, chatId) {
  if (MINI_APP_URL) {
    try {
      await api.setChatMenuButton({ chat_id: chatId, menu_button: { type: 'web_app', text: 'Open app', web_app: { url: MINI_APP_URL } } });
    } catch (e) {
      console.warn('setChatMenuButton failed', e.description || e.message);
    }
  }
  const name = user.firstName ? `, ${esc(user.firstName)}` : '';
  await send(chatId, [
    `Hey${name}! I'm FitPro 💪`,
    '',
    'Use the buttons below for quick things:',
    '🏋️ <b>Workout</b> — tick off sets while you train',
    '📊 <b>Today</b> — calories, water, weight, plan',
    '⚖️ <b>Weight</b> — or just send a number like <code>82.4</code>',
    '💧 <b>+250 ml</b> — log a glass of water',
    '',
    'Send a photo to save it as a progress photo. Food logging, routines and charts live in the app.',
  ].join('\n'), { reply_markup: mainKeyboard });
  return send(chatId, user.onboardedAt ? 'Everything else is in the app:' : 'Start with a one-minute setup so I can set your daily targets:',
    { reply_markup: inline([[appButton(user.onboardedAt ? '📱 Open FitPro' : '📱 Set up FitPro')]]) });
}

export function help(chatId) {
  return send(chatId, 'Tap a button below, send your weight (like <code>82.4</code>) or a photo. Everything else is in the app.',
    { reply_markup: inline([[appButton()]]) });
}

// ── 📊 Today ────────────────────────────────────────────────────────────────────

export async function todaySummary(user, chatId) {
  const t = await getToday(user);
  const e = (k) => formatEnergy(k, user.energyUnit, { suffix: false });
  const lines = [`📊 <b>Today</b>`];
  if (t.targets.kcal) {
    const left = t.remainingKcal;
    lines.push(`🍽 ${e(t.eaten.kcal)} / ${formatEnergy(t.targets.kcal, user.energyUnit)} · ${left >= 0 ? `${e(left)} left` : `${e(-left)} over`}`);
    lines.push(`P ${Math.round(t.eaten.proteinG)}/${t.targets.proteinG} · C ${Math.round(t.eaten.carbsG)}/${t.targets.carbsG} · F ${Math.round(t.eaten.fatG)}/${t.targets.fatG} g`);
  }
  lines.push(`💧 ${(t.water.totalMl / 1000).toFixed(2)} / ${(t.water.targetMl / 1000).toFixed(1)} L`);
  if (t.weight.latest) {
    const change = t.weight.weekChangeKg === null ? '' : ` (${delta(t.weight.weekChangeKg, user.weightUnit)} this week)`;
    lines.push(`⚖️ ${formatWeight(t.weight.latest.weightKg, user.weightUnit)}${change}`);
  }
  if (t.activeWorkout) lines.push(`🏋️ In progress: ${esc(t.activeWorkout.name)}`);
  else if (t.plan) lines.push(`🏋️ ${t.plan.done ? 'Done ✓' : 'Plan'}: ${esc(t.plan.name)} · ${t.plan.exerciseCount} exercises · ~${t.plan.estMinutes} min`);
  else if (t.workoutsToday.length) lines.push(`🏋️ Done ✓ ${esc(t.workoutsToday.map((w) => w.name).join(', '))}`);
  else lines.push('🏋️ Rest day');
  lines.push(`📅 Week: ${t.week.workouts}/${t.week.target} workouts${t.streakDays > 1 ? ` · 🔥 ${t.streakDays}-day streak` : ''}`);

  const startBtn = t.activeWorkout
    ? { text: '▶️ Continue workout', callback_data: 'w:show' }
    : t.plan && !t.plan.done ? { text: `▶️ Start ${t.plan.name}`, callback_data: `w:go:${t.plan.routineId}` } : null;
  return send(chatId, lines.join('\n'), { reply_markup: inline([[startBtn], [appButton()]]) });
}

// ── ⚖️ Weight ───────────────────────────────────────────────────────────────────

// "82.4", "82,4", "181 lb", "82.4kg" → { value, unit } or null.
export function parseWeight(text, defaultUnit) {
  const m = /^\s*(\d{2,3}(?:[.,]\d{1,2})?)\s*(kg|kgs|lb|lbs)?\s*$/i.exec(text || '');
  if (!m) return null;
  const unit = m[2] ? (m[2].toLowerCase().startsWith('lb') ? 'lb' : 'kg') : defaultUnit;
  const kg = toKg(Number(m[1].replace(',', '.')), unit);
  return kg >= 25 && kg <= 350 ? kg : null;
}

export function askWeight(user, chatId) {
  return send(chatId, `Send today's weight — just the number, like <code>${user.weightUnit === 'lb' ? '181.6' : '82.4'}</code>`);
}

export async function saveWeight(user, chatId, kg) {
  const { weight } = await logWeight(user, { weightKg: kg });
  const lines = [`⚖️ Saved <b>${formatWeight(kg, user.weightUnit)}</b>`];
  if (weight.avg7Kg) lines.push(`7-day average ${formatWeight(weight.avg7Kg, user.weightUnit)}${weight.weekChangeKg !== null ? ` · ${delta(weight.weekChangeKg, user.weightUnit)} vs last week` : ''}`);
  if (weight.projectedGoalDate) lines.push(`On pace for your goal by ${weight.projectedGoalDate}`);
  return send(chatId, lines.join('\n'), { reply_markup: inline([[{ text: '↩️ Undo', callback_data: `wt:u:${today(user)}` }]]) });
}

export async function undoWeight(user, chatId, messageId, date) {
  await deleteWeight(user, { date });
  await edit(chatId, messageId, '⚖️ Weigh-in removed.');
  return 'Removed';
}

// ── 💧 Water ────────────────────────────────────────────────────────────────────

const waterText = (w) => `💧 <b>${(w.totalMl / 1000).toFixed(2)}</b> / ${(w.targetMl / 1000).toFixed(1)} L today`;
const waterButtons = inline([[{ text: '+250 ml', callback_data: 'h2o:add' }, { text: '↩️ Undo', callback_data: 'h2o:undo' }]]);

export async function addWater(user, chatId) {
  return send(chatId, waterText(await logWater(user, { amountMl: 250 })), { reply_markup: waterButtons });
}

export async function onWaterButton(user, chatId, messageId, action) {
  const w = action === 'add' ? await logWater(user, { amountMl: 250 }) : await undoWater(user, {});
  await edit(chatId, messageId, waterText(w), { reply_markup: waterButtons });
  return action === 'add' ? '+250 ml' : 'Undone';
}

// ── 📷 Progress photos ──────────────────────────────────────────────────────────

export async function askPhotoPose(user, chatId, sizes) {
  await setBotState(user.id, { ...(user.botState || {}), photo: sizes });
  return send(chatId, 'Save this as a progress photo?', {
    reply_markup: inline([[
      { text: 'Front', callback_data: 'ph:front' }, { text: 'Side', callback_data: 'ph:side' },
      { text: 'Back', callback_data: 'ph:back' }, { text: '✕', callback_data: 'ph:no' },
    ]]),
  });
}

export async function onPhotoButton(user, chatId, messageId, pose) {
  const sizes = user.botState && user.botState.photo;
  const { photo, ...rest } = user.botState || {};
  await setBotState(user.id, Object.keys(rest).length ? rest : null);
  if (pose === 'no') { await edit(chatId, messageId, 'Okay, not saved.'); return ''; }
  if (!sizes) { await edit(chatId, messageId, 'That photo expired — send it again.'); return ''; }
  await savePhotoSizes(user, sizes, { date: today(user), pose });
  await edit(chatId, messageId, `📷 Saved as a ${pose} progress photo.`, { reply_markup: inline([[appButton('📱 Compare in app')]]) });
  return 'Saved';
}

