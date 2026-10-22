import { api } from 'sdk';
import { MINI_APP_URL } from '../config.js';

// Chat building blocks. The chat is button-driven: a persistent 4-button keyboard,
// inline buttons on messages, and plain numbers for weight — no command syntax.

export const BTN = {
  workout: '🏋️ Workout',
  today: '📊 Today',
  weight: '⚖️ Weight',
  water: '💧 +250 ml',
};

export const mainKeyboard = {
  keyboard: [[{ text: BTN.workout }, { text: BTN.today }], [{ text: BTN.weight }, { text: BTN.water }]],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: 'Tap a button or send your weight',
};

// Inline button that opens the Mini App (at an optional hash path), or null when
// the URL isn't configured yet.
export function appButton(text = '📱 Open FitPro', path = '') {
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

export function needsSetup(chatId) {
  return send(chatId, 'First, a one-minute setup so I can set your daily targets 👇', { reply_markup: inline([[appButton('📱 Set up FitPro')]]) });
}
