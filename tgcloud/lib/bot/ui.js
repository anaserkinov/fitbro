import { api } from 'sdk';
import { MINI_APP_URL } from '../config.js';
import { LANGUAGES } from '../i18n/core.js';
import { tr, translatorFor } from '../i18n/bot.js';

// Chat building blocks. The chat is button-driven: a persistent 4-button keyboard,
// inline buttons on messages, and plain numbers for weight — no command syntax.

export function buttons(t) {
  return {
    workout: `🏋️ ${t('Workout')}`,
    today: `📊 ${t('Today')}`,
    weight: `⚖️ ${t('Weight')}`,
    water: `💧 +250 ${t('ml')}`,
  };
}

// Which keyboard button a text is — in any language, since a keyboard sent before a
// language change stays on screen. null when it's not a button.
export function buttonOf(text) {
  for (const lang of LANGUAGES) {
    const b = buttons(translatorFor(lang));
    const hit = Object.keys(b).find((k) => b[k] === text);
    if (hit) return hit;
  }
  return null;
}

export function mainKeyboard(user) {
  const t = tr(user);
  const b = buttons(t);
  return {
    keyboard: [[{ text: b.workout }, { text: b.today }], [{ text: b.weight }, { text: b.water }]],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: t('Tap a button or send your weight'),
  };
}

// Inline button that opens the Mini App (at an optional hash path), or null when
// the URL isn't configured yet.
export function appButton(text, path = '') {
  return MINI_APP_URL ? { text, web_app: { url: MINI_APP_URL + path } } : null;
}

// Rows of buttons; nulls and empty rows are dropped.
export function inline(rows) {
  return { inline_keyboard: rows.map((r) => r.filter(Boolean)).filter((r) => r.length) };
}

export const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function send(chatId, text, extra = {}) {
  return api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
}

// Edits a message; "message is not modified" (same text and buttons) is not an error.
export async function edit(chatId, messageId, text, extra = {}) {
  try {
    return await api.editMessageText({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
  } catch (e) {
    if (e.code === 400 && /not modified/i.test(e.description || '')) return null;
    throw e;
  }
}

export function needsSetup(user, chatId) {
  const t = tr(user);
  return send(chatId, t('First, a one-minute setup so I can set your daily targets 👇'), { reply_markup: inline([[appButton(`📱 ${t('Set up FitBro')}`)]]) });
}
