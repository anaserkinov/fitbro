// handlers/callback_query.js — taps on inline buttons. Data prefixes:
//   w:…   workout card (see lib/bot/workout.js)    h2o:add|undo   water
//   wt:u:<date>   undo a weigh-in                   ph:<pose>|no   progress photo

import { api } from 'sdk';
import { ensureUser } from '../lib/users.js';
import { isEndpointError } from '../lib/validate.js';
import { getActiveWorkout } from '../lib/workouts.js';
import { needsSetup } from '../lib/bot/ui.js';
import { tr } from '../lib/i18n/bot.js';
import * as chat from '../lib/bot/chat.js';
import { onWorkoutButton, showCard } from '../lib/bot/workout.js';

export default async function (query) {
  const answer = (text = '') => api.answerCallbackQuery({ callback_query_id: query.id, text }).catch(() => {});
  if (!query.message || !query.data) return answer();
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const user = await ensureUser(query.from);
  const t = tr(user);
  const [kind, action, arg] = query.data.split(':');

  try {
    if (!user.onboardedAt) { await needsSetup(user, chatId); return answer(); }
    let text = '';
    if (kind === 'w' && action === 'show') {
      const active = await getActiveWorkout(user.id);
      if (active) await showCard(user, chatId, active.id); else text = t('No workout running');
    } else if (kind === 'w') {
      text = await onWorkoutButton(user, chatId, messageId, query.data);
    } else if (kind === 'h2o') {
      text = await chat.onWaterButton(user, chatId, messageId, action);
    } else if (kind === 'wt' && action === 'u') {
      text = await chat.undoWeight(user, chatId, messageId, arg);
    } else if (kind === 'ph') {
      text = await chat.onPhotoButton(user, chatId, messageId, action);
    }
    return answer(text);
  } catch (e) {
    if (isEndpointError(e)) return answer(t(e.message));
    console.error('callback failed', query.data, e);
    return answer(t('Something went wrong — try again'));
  }
}
