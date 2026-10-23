// handlers/my_chat_member — the bot was added to or removed from a chat. In group
// chats that links or unlinks a FitPro group (lib/bot/group-chat.js).

import { onBotMembership } from '../lib/bot/group-chat.js';

export default async function (update) {
  await onBotMembership(update);
}
