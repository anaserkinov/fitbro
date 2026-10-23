import { api } from 'sdk';

// Telegram links into the bot and the Mini App.
//   t.me/<bot>?startapp=<param>  opens the main Mini App with start_param = param
//   t.me/<bot>?start=<param>     opens the chat and sends "/start <param>"
// start params allow only [A-Za-z0-9_-]. Buttons inside the bot's own private chat use
// web_app buttons instead (appButton in bot/ui.js, e.g. MINI_APP_URL?group=<id>, which
// src/App.jsx follows) — those launches carry no start_param.

let username = null;

// The bot's @username, from getMe once per isolate.
export async function botUsername() {
  if (!username) {
    const me = await api.getMe();
    username = (me && me.username) || null;
  }
  return username;
}

export async function startAppLink(param) {
  const u = await botUsername();
  return u ? `https://t.me/${u}?startapp=${param}` : null;
}

export async function startLink(param) {
  const u = await botUsername();
  return u ? `https://t.me/${u}?start=${param}` : null;
}

export const inviteParam = (code) => `g_${code}`;
export const inviteCodeOf = (param) => (/^g_([a-z0-9]{8})$/.exec(String(param || '')) || [])[1] || null;
