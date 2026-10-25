import { api } from 'sdk';
import { MINI_APP_URL } from '../config.js';
import { today, setBotState } from '../users.js';
import { getToday } from '../stats.js';
import { logWeight, deleteWeight, savePhotoSizes } from '../body.js';
import { logWater, undoWater } from '../food.js';
import { toKg, fromKg, formatWeight, formatEnergy, unitLabel, thousands } from '../units.js';
import { tr, longDate } from '../i18n/bot.js';
import { send, edit, inline, appButton, esc, mainKeyboard } from './ui.js';
import { sendInvitePreview } from './friends.js';
import { inviteCodeOf } from '../links.js';

const signed = (v, lang) => (v > 0 ? `+${thousands(v, 1, lang).replace(/[.,]0$/, '')}` : v < 0 ? `−${thousands(-v, 1, lang).replace(/[.,]0$/, '')}` : '±0');
// A kg difference shown in the user's unit, e.g. '−0.5 kg'.
const delta = (kg, user) => `${signed(Math.round(fromKg(kg, user.weightUnit) * 10) / 10, user.language)} ${unitLabel(user.weightUnit, user.language)}`;
const weight = (kg, user) => formatWeight(kg, user.weightUnit, { lang: user.language });
const energy = (kcal, user, opts) => formatEnergy(kcal, user.energyUnit, { lang: user.language, ...opts });
// 2450 ml → '2.45' (en) / '2,45' (ru, uz)
const litres = (ml, digits, user) => thousands(ml / 1000, digits, user.language);

// ── /start ──────────────────────────────────────────────────────────────────────

// The chat menu button and the reply keyboard are per chat, so they're re-sent
// after a language change too.
export async function setMenuButton(user, chatId) {
  if (!MINI_APP_URL) return;
  await api.setChatMenuButton({ chat_id: chatId, menu_button: { type: 'web_app', text: tr(user)('Open app'), web_app: { url: MINI_APP_URL } } });
}

// `payload` is what follows /start — an invite link brings 'g_<code>'. A user who is
// set up sees the group straight away; anyone else gets it after onboarding.
export async function start(user, chatId, payload = '') {
  const code = inviteCodeOf(payload);
  if (code && user.onboardedAt) return sendInvitePreview(user, chatId, code);
  if (code) await setBotState(user.id, { ...(user.botState || {}), pendingInvite: code });
  const t = tr(user);
  if (MINI_APP_URL) {
    try {
      await setMenuButton(user, chatId);
    } catch (e) {
      console.warn('setChatMenuButton failed', e.description || e.message);
    }
  }
  const hello = user.firstName ? t('Hey, {name}! I’m FitBro 💪', { name: esc(user.firstName) }) : t('Hey! I’m FitBro 💪');
  const sample = user.language === 'en' ? '82.4' : '82,4';
  await send(chatId, [
    hello,
    '',
    t('Use the buttons below for quick things:'),
    `🏋️ <b>${t('Workout')}</b> — ${t('tick off sets while you train')}`,
    `📊 <b>${t('Today')}</b> — ${t('calories, water, weight, plan')}`,
    `⚖️ <b>${t('Weight')}</b> — ${t('or just send a number like {sample}', { sample: `<code>${sample}</code>` })}`,
    `💧 <b>+250 ${t('ml')}</b> — ${t('log a glass of water')}`,
    '',
    t('Send a photo to save it as a progress photo. Food logging, routines and charts live in the app.'),
  ].join('\n'), { reply_markup: mainKeyboard(user) });
  return send(chatId, user.onboardedAt ? t('Everything else is in the app:') : t('Start with a one-minute setup so I can set your daily targets:'),
    { reply_markup: inline([[appButton(`📱 ${user.onboardedAt ? t('Open FitBro') : t('Set up FitBro')}`)]]) });
}

export function help(user, chatId) {
  const t = tr(user);
  const sample = user.language === 'en' ? '82.4' : '82,4';
  return send(chatId, t('Tap a button below, send your weight (like {sample}) or a photo. Everything else is in the app.', { sample: `<code>${sample}</code>` }),
    { reply_markup: inline([[appButton(`📱 ${t('Open FitBro')}`)]]) });
}

// After the language changes in the app: a fresh keyboard and menu button.
export async function languageChanged(user) {
  const t = tr(user);
  try {
    await send(user.id, t('Okay, I’ll speak English from now on 👌'), { reply_markup: mainKeyboard(user) });
    await setMenuButton(user, user.id);
  } catch (e) {
    console.warn('language keyboard refresh failed', e.description || e.message);   // e.g. never started the bot
  }
}

// ── 📊 Today ────────────────────────────────────────────────────────────────────

export async function todaySummary(user, chatId) {
  const t = tr(user);
  const d = await getToday(user);
  const e = (k) => energy(k, user, { suffix: false });
  const g = unitLabel('g', user.language);
  const lines = [`📊 <b>${t('Today')}</b>`];
  if (d.targets.kcal) {
    const left = d.remainingKcal;
    lines.push(`🍽 ${e(d.eaten.kcal)} / ${energy(d.targets.kcal, user)} · ${left >= 0 ? t('{n} left', { n: e(left) }) : t('{n} over', { n: e(-left) })}`);
    lines.push(`${t('P')} ${Math.round(d.eaten.proteinG)}/${d.targets.proteinG} · ${t('C')} ${Math.round(d.eaten.carbsG)}/${d.targets.carbsG} · ${t('F')} ${Math.round(d.eaten.fatG)}/${d.targets.fatG} ${g}`);
  }
  lines.push(`💧 ${litres(d.water.totalMl, 2, user)} / ${litres(d.water.targetMl, 1, user)} ${t('L')}`);
  if (d.weight.latest) {
    const change = d.weight.weekChangeKg === null ? '' : ` (${t('{delta} this week', { delta: delta(d.weight.weekChangeKg, user) })})`;
    lines.push(`⚖️ ${weight(d.weight.latest.weightKg, user)}${change}`);
  }
  const plan = (p) => `${esc(p.name)} · ${t.n(p.exerciseCount, '{n} exercise', '{n} exercises')} · ~${p.estMinutes} ${t('min')}`;
  if (d.activeWorkout) lines.push(`🏋️ ${t('In progress')}: ${esc(d.activeWorkout.name)}`);
  else if (d.plan) lines.push(`🏋️ ${d.plan.done ? t('Done ✓') : t('Plan')}: ${plan(d.plan)}`);
  else if (d.workoutsToday.length) lines.push(`🏋️ ${t('Done ✓')} ${esc(d.workoutsToday.map((w) => w.name).join(', '))}`);
  else lines.push(`🏋️ ${t('Rest day')}`);
  const streak = d.streakDays > 1 ? ` · 🔥 ${t.n(d.streakDays, '{n}-day streak', '{n}-day streak')}` : '';
  lines.push(`📅 ${t('Week: {done}/{target} workouts', { done: d.week.workouts, target: d.week.target })}${streak}`);

  const startBtn = d.activeWorkout
    ? { text: `▶️ ${t('Continue workout')}`, callback_data: 'w:show' }
    : d.plan && !d.plan.done ? { text: `▶️ ${t('Start {name}', { name: d.plan.name })}`, callback_data: `w:go:${d.plan.routineId}` } : null;
  return send(chatId, lines.join('\n'), { reply_markup: inline([[startBtn], [appButton(`📱 ${t('Open FitBro')}`)]]) });
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
  const sample = user.weightUnit === 'lb' ? '181.6' : '82.4';
  return send(chatId, tr(user)('Send today’s weight — just the number, like {sample}', { sample: `<code>${user.language === 'en' ? sample : sample.replace('.', ',')}</code>` }));
}

export async function saveWeight(user, chatId, kg) {
  const t = tr(user);
  const { weight: w } = await logWeight(user, { weightKg: kg });
  const lines = [`⚖️ ${t('Saved {w}', { w: `<b>${weight(kg, user)}</b>` })}`];
  if (w.avg7Kg) lines.push(`${t('7-day average {w}', { w: weight(w.avg7Kg, user) })}${w.weekChangeKg !== null ? ` · ${t('{delta} vs last week', { delta: delta(w.weekChangeKg, user) })}` : ''}`);
  if (w.projectedGoalDate) lines.push(t('On pace for your goal by {date}', { date: longDate(user.language, w.projectedGoalDate) }));
  return send(chatId, lines.join('\n'), { reply_markup: inline([[{ text: `↩️ ${t('Undo')}`, callback_data: `wt:u:${today(user)}` }]]) });
}

export async function undoWeight(user, chatId, messageId, date) {
  const t = tr(user);
  await deleteWeight(user, { date });
  await edit(chatId, messageId, `⚖️ ${t('Weigh-in removed.')}`);
  return t('Removed');
}

// ── 💧 Water ────────────────────────────────────────────────────────────────────

const waterText = (user, w) => `💧 ${tr(user)('{total} / {target} L today', { total: `<b>${litres(w.totalMl, 2, user)}</b>`, target: litres(w.targetMl, 1, user) })}`;
const waterButtons = (user) => {
  const t = tr(user);
  return inline([[{ text: `+250 ${t('ml')}`, callback_data: 'h2o:add' }, { text: `↩️ ${t('Undo')}`, callback_data: 'h2o:undo' }]]);
};

export async function addWater(user, chatId) {
  return send(chatId, waterText(user, await logWater(user, { amountMl: 250 })), { reply_markup: waterButtons(user) });
}

export async function onWaterButton(user, chatId, messageId, action) {
  const t = tr(user);
  const w = action === 'add' ? await logWater(user, { amountMl: 250 }) : await undoWater(user, {});
  await edit(chatId, messageId, waterText(user, w), { reply_markup: waterButtons(user) });
  return action === 'add' ? `+250 ${t('ml')}` : t('Undone');
}

// ── 📷 Progress photos ──────────────────────────────────────────────────────────

export async function askPhotoPose(user, chatId, sizes) {
  const t = tr(user);
  await setBotState(user.id, { ...(user.botState || {}), photo: sizes });
  return send(chatId, t('Save this as a progress photo?'), {
    reply_markup: inline([[
      { text: t('Front@pose'), callback_data: 'ph:front' }, { text: t('Side@pose'), callback_data: 'ph:side' },
      { text: t('Back@pose'), callback_data: 'ph:back' }, { text: '✕', callback_data: 'ph:no' },
    ]]),
  });
}

export async function onPhotoButton(user, chatId, messageId, pose) {
  const sizes = user.botState && user.botState.photo;
  const { photo, ...rest } = user.botState || {};
  const t = tr(user);
  await setBotState(user.id, Object.keys(rest).length ? rest : null);
  if (pose === 'no') { await edit(chatId, messageId, t('Okay, not saved.')); return ''; }
  if (!sizes) { await edit(chatId, messageId, t('That photo expired — send it again.')); return ''; }
  await savePhotoSizes(user, sizes, { date: today(user), pose });
  const POSE = { front: 'Saved as a front progress photo.', side: 'Saved as a side progress photo.', back: 'Saved as a back progress photo.' };
  await edit(chatId, messageId, `📷 ${t(POSE[pose] || POSE.front)}`, { reply_markup: inline([[appButton(`📱 ${t('Compare in app')}`)]]) });
  return t('Saved');
}

