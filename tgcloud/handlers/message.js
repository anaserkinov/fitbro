// handlers/message.js — every chat message. The chat is button-driven: the four
// keyboard buttons, a plain number (= today's weight) or a photo (= progress photo).
// Anything else gets a short hint pointing to the buttons and the app.

import { ensureUser } from '../lib/users.js';
import { isEndpointError } from '../lib/validate.js';
import { buttonOf, send, needsSetup } from '../lib/bot/ui.js';
import { tr } from '../lib/i18n/bot.js';
import * as chat from '../lib/bot/chat.js';
import { workoutMenu } from '../lib/bot/workout.js';

export default async function (message) {
  if (!message.from || message.from.is_bot || message.chat.type !== 'private') return;
  const chatId = message.chat.id;
  const user = await ensureUser(message.from);
  const text = (message.text || '').trim();

  try {
    if (text.startsWith('/start')) return await chat.start(user, chatId);
    if (!user.onboardedAt) return await needsSetup(user, chatId);
    if (message.photo) return await chat.askPhotoPose(user, chatId, message.photo);
    const button = buttonOf(text);
    if (button === 'today' || text === '/today') return await chat.todaySummary(user, chatId);
    if (button === 'workout' || text === '/workout') return await workoutMenu(user, chatId);
    if (button === 'weight' || text === '/weight') return await chat.askWeight(user, chatId);
    if (button === 'water' || text === '/water') return await chat.addWater(user, chatId);
    const kg = chat.parseWeight(text, user.weightUnit);
    if (kg) return await chat.saveWeight(user, chatId, kg);
    return await chat.help(user, chatId);
  } catch (e) {
    if (isEndpointError(e)) return send(chatId, `⚠️ ${tr(user)(e.message)}`);
    throw e;
  }
}
