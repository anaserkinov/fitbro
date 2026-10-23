import { api, InputFile, BotApiError } from 'sdk';
import * as v from './validate.js';
import { decodeBase64, imageType } from './base64.js';

// Images reach Telegram by the bot sending them to the user's own chat: that yields a
// file_id we can keep or reuse. The message is deleted right away to keep the chat
// clean. A user who never opened the bot chat can't receive it (403) — the Mini App
// then asks for write access (requestWriteAccess) and retries.

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;   // Bot API photo upload limit

export function cleanImage(imageBase64, field = 'imageBase64') {
  const bytes = typeof imageBase64 === 'string' ? decodeBase64(imageBase64) : null;
  if (!bytes || !bytes.length) v.invalid(`${field} must be a base64 image`, field);
  if (bytes.length > MAX_PHOTO_BYTES) v.invalid('Photo is larger than 10 MB', field);
  const type = imageType(bytes);
  if (!type) v.invalid('Only JPEG or PNG photos', field);
  return { bytes, type };
}

// Turns a 403 from a send to the user's own chat into a refusal the app can act on.
export async function toOwnChat(send) {
  try {
    return await send();
  } catch (e) {
    if (e instanceof BotApiError && e.code === 403) v.refuse('Open the bot chat first so I can send you files', 'BOT_CHAT_REQUIRED');
    throw e;
  }
}

// → the photo sizes Telegram made (largest last).
export async function uploadToOwnChat(user, { bytes, type }, { name, caption }) {
  const msg = await toOwnChat(() => api.sendPhoto({
    chat_id: user.id,
    photo: new InputFile(bytes, `${name}.${type === 'image/png' ? 'png' : 'jpg'}`, { type }),
    caption,
    disable_notification: true,
  }));
  try {
    await api.deleteMessage({ chat_id: user.id, message_id: msg.message_id });
  } catch (e) {
    console.warn('could not delete uploaded image', e.description || e.message);
  }
  return msg.photo;
}
