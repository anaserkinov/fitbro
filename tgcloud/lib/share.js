import { api } from 'sdk';
import * as T from '../schema.js';
import * as v from './validate.js';
import { own } from './db-util.js';
import { tr } from './i18n/bot.js';
import { formatWeight, formatDuration } from './units.js';
import { startAppLink } from './links.js';
import { cleanImage, uploadToOwnChat, toOwnChat } from './own-chat.js';

// Sharing a finished workout as an image card. The Mini App draws the card; we upload
// it to get a file_id and save a prepared inline message, which the app hands to
// Telegram.WebApp.shareMessage() so the user can pick any chat.

export async function prepareShare(user, input) {
  const w = await own(T.workouts, v.id(input.workoutId, 'workoutId'), user.id, 'Workout');
  if (!w.endedAt) v.refuse('Finish the workout first', 'NOT_FINISHED');
  const image = cleanImage(input.imageBase64);
  const t = tr(user);

  // Built here from the stored workout, not taken from the client.
  const parts = [formatDuration(w.durationSec), t.n(w.totalSets || 0, '{n} set', '{n} sets')];
  if (w.totalVolumeKg) parts.push(formatWeight(w.totalVolumeKg, user.weightUnit, { digits: 0, lang: user.language }));
  const caption = `💪 ${w.name} — ${parts.join(' · ')}\n${t('Tracked with FitBro')}`;

  const sizes = await uploadToOwnChat(user, image, { name: 'workout', caption });
  const link = await startAppLink('ref');
  const prepared = await toOwnChat(() => api.savePreparedInlineMessage({
    user_id: user.id,
    result: {
      type: 'photo',
      id: `w${w.id}-${Date.now()}`,
      photo_file_id: sizes[sizes.length - 1].file_id,
      caption,
      ...(link ? { reply_markup: { inline_keyboard: [[{ text: `📱 ${t('Open FitBro')}`, url: link }]] } } : {}),
    },
    allow_user_chats: true,
    allow_bot_chats: true,
    allow_group_chats: true,
    allow_channel_chats: true,
  }));
  return { id: prepared.id };
}
