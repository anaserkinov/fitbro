import { tr } from '../i18n/bot.js';
import { isEndpointError } from '../validate.js';
import { previewGroup, joinGroup } from '../groups.js';
import { send, edit, inline, appButton, esc } from './ui.js';

// Friends in chat: an invite link that lands in the chat (/start g_<code>) shows the
// group and a Join button — joining is always an explicit tap.

export function inviteText(user, group) {
  const t = tr(user);
  return [
    `👥 <b>${esc(group.name)}</b> · ${t.n(group.memberCount, '{n} member', '{n} members')}`,
    group.ownerName
      ? t('{name} invited you to compare workouts.', { name: esc(group.ownerName) })
      : t('You’re invited to compare workouts.'),
    t('You choose what the group sees — workouts and records by default, never your food or photos.'),
  ].join('\n');
}

export async function sendInvitePreview(user, chatId, code) {
  const t = tr(user);
  try {
    const { group, isMember } = await previewGroup(user, { code });
    if (isMember) {
      return send(chatId, t('You’re already in {group}.', { group: `<b>${esc(group.name)}</b>` }),
        { reply_markup: inline([[appButton(`👥 ${t('Open group')}`, `?group=${group.id}`)]]) });
    }
    return send(chatId, inviteText(user, group), { reply_markup: inline([[{ text: `✅ ${t('Join')}`, callback_data: `g:join:${code}` }]]) });
  } catch (e) {
    if (isEndpointError(e)) return send(chatId, `⚠️ ${t(e.message)}`);
    throw e;
  }
}

// The Join button in a private chat. Returns the callback answer text.
export async function onJoinButton(user, chatId, messageId, code) {
  const t = tr(user);
  const { group } = await joinGroup(user, { code });
  await edit(chatId, messageId, `✅ ${t('You joined {group}.', { group: `<b>${esc(group.name)}</b>` })}`,
    { reply_markup: inline([[appButton(`👥 ${t('Open group')}`, `?group=${group.id}`)]]) });
  return t('Joined');
}
