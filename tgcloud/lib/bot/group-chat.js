import { db, api, BotApiError } from 'sdk';
import { eq, and, isNotNull } from 'sdk/db';
import { atOrBefore } from '../db-util.js';
import * as T from '../../schema.js';
import { ensureUser, getUser, today } from '../users.js';
import { addDays, weekStart, zonedToUtc } from '../dates.js';
import { tr } from '../i18n/bot.js';
import { isEndpointError } from '../validate.js';
import { insertGroup, joinGroup, MAX_GROUPS_PER_USER } from '../groups.js';
import { computeLeaderboard } from '../leaderboard.js';
import { startLink, startAppLink, inviteParam } from '../links.js';
import { send, esc } from './ui.js';

// Telegram group chats as FitPro groups. Adding the bot to a chat links a group to it
// (when the person who added it is a set-up FitPro user, a chat admin and under the
// group limit). Chat members join with an explicit tap. The chat gets a weekly
// leaderboard and /leaderboard — listing only members who turned on "show me in chat
// posts". Bot privacy mode stays on, so the bot only sees commands here.
// Every button in a group chat is a URL button: web_app buttons only work in private chats.

const G = T.groups;
const isGroupChat = (chat) => chat && (chat.type === 'group' || chat.type === 'supergroup');

// Next Monday 10:00 in the owner's timezone.
export function nextPostAt(owner) {
  const monday = addDays(weekStart(today(owner), 1), 7);
  return zonedToUtc(monday, '10:00', owner.timezone || 'UTC');
}

const button = (text, url) => (url ? { inline_keyboard: [[{ text, url }]] } : undefined);

async function postJoin(chatId, group, owner) {
  const t = tr(owner);
  await send(chatId, [
    `👥 ${t('This chat now has a FitPro group: {name}.', { name: `<b>${esc(group.name)}</b>` })}`,
    t('Tap Join to compare workouts with each other. Each of you chooses what the group sees.'),
  ].join('\n'), { reply_markup: { inline_keyboard: [[{ text: `✅ ${t('Join')}`, callback_data: `g:join:${group.inviteCode}` }]] } });
}

async function postSetup(chatId, from) {
  const t = tr(from);
  await send(chatId, t('To link this chat to a FitPro group, a chat admin who uses FitPro needs to add me.'),
    { reply_markup: button(`📱 ${t('Open FitPro')}`, await startLink('chat')) });
}

async function isChatAdmin(chatId, userId) {
  try {
    const m = await api.getChatMember({ chat_id: chatId, user_id: userId });
    return m && (m.status === 'creator' || m.status === 'administrator');
  } catch {
    return false;
  }
}

// handlers/my_chat_member: the bot was added to or removed from a chat.
export async function onBotMembership(update) {
  const { chat, from } = update;
  if (!isGroupChat(chat)) return;   // private chats: the user blocked or unblocked the bot
  const now = update.new_chat_member && update.new_chat_member.status;
  const was = update.old_chat_member && update.old_chat_member.status;
  const inChat = (s) => s === 'member' || s === 'administrator';

  if (!inChat(now)) {
    await db.update(G).set({ chatId: null, nextPostAt: null }).where(eq(G.chatId, chat.id)).run();
    return;
  }
  if (inChat(was)) return;   // e.g. promoted to admin — nothing to do

  const linked = await db.select().from(G).where(eq(G.chatId, chat.id)).get();
  if (linked) {
    const owner = await getUser(linked.ownerId);
    return postJoin(chat.id, linked, owner || from);
  }
  const adder = await ensureUser(from);
  const mine = await db.$count(T.groupMembers, eq(T.groupMembers.userId, adder.id));
  if (!adder.onboardedAt || mine >= MAX_GROUPS_PER_USER || !(await isChatAdmin(chat.id, adder.id))) return postSetup(chat.id, adder);
  const { group } = await insertGroup(adder, String(chat.title || 'FitPro').slice(0, 40), { chatId: chat.id, nextPostAt: nextPostAt(adder) });
  return postJoin(chat.id, group, adder);
}

// The Join button in a group chat. Joining needs a FitPro account and a private chat
// with the bot (for pings) — otherwise the button opens the bot to set that up.
export async function onGroupJoin(query, code) {
  const user = await ensureUser(query.from);
  const t = tr(user);
  const answer = (extra) => api.answerCallbackQuery({ callback_query_id: query.id, ...extra }).catch(() => {});
  if (!user.onboardedAt || !user.botStartedAt) return answer({ url: await startLink(inviteParam(code)) });
  try {
    const { group, joined } = await joinGroup(user, { code });
    return answer({ text: joined ? t('You joined {group}.', { group: group.name }) : t('You’re already in {group}.', { group: group.name }) });
  } catch (e) {
    if (isEndpointError(e)) return answer({ text: t(e.message), show_alert: true });
    throw e;
  }
}

export async function leaderboardText(group, owner) {
  const t = tr(owner);
  const members = await db.select().from(T.groupMembers).where(and(eq(T.groupMembers.groupId, group.id), eq(T.groupMembers.showInChat, true))).all();
  const shown = new Set(members.map((m) => m.userId));
  const board = (await computeLeaderboard(group.id, 0, today(owner))).consistency.filter((r) => shown.has(r.userId));
  const lines = [`📊 <b>${esc(group.name)}</b> — ${t('this week')}`];
  if (!board.length) {
    lines.push('', t('Nobody is shown here yet. Turn on “Show me in chat posts” in the group’s settings in FitPro.'));
  } else {
    board.forEach((r, i) => lines.push(`${i + 1}. ${esc(r.name || t('Member'))} — ${r.done}/${r.goal}${r.streakWeeks ? ` · 🔥${r.streakWeeks}` : ''}`));
  }
  return lines.join('\n');
}

async function postLeaderboard(chatId, group, owner) {
  const t = tr(owner);
  await send(chatId, await leaderboardText(group, owner), { reply_markup: button(`👥 ${t('Open in FitPro')}`, await startAppLink(inviteParam(group.inviteCode))) });
}

// handlers/message for group chats: /leaderboard, and a chat upgraded to a supergroup.
export async function onGroupMessage(message) {
  const chat = message.chat;
  if (message.migrate_to_chat_id) {
    await db.update(G).set({ chatId: message.migrate_to_chat_id }).where(eq(G.chatId, chat.id)).run();
    return;
  }
  const cmd = (message.text || '').trim().split(/\s+/)[0].toLowerCase();
  if (!/^\/leaderboard(@\w+)?$/.test(cmd)) return;
  const group = await db.select().from(G).where(eq(G.chatId, chat.id)).get();
  if (!group) return postSetup(chat.id, message.from || {});
  const owner = await getUser(group.ownerId);
  return postLeaderboard(chat.id, group, owner);
}

// From tick: the weekly leaderboard in linked chats. A chat that's gone gets unlinked.
export async function processGroupChatPosts(now = new Date()) {
  const due = await db.select().from(G).where(and(isNotNull(G.chatId), atOrBefore(G.nextPostAt, now))).limit(50).all();
  const out = { sent: 0, unlinked: 0 };
  for (const g of due) {
    const owner = await getUser(g.ownerId);
    await db.update(G).set({ nextPostAt: nextPostAt(owner || {}) }).where(eq(G.id, g.id)).run();
    try {
      await postLeaderboard(g.chatId, g, owner || {});
      out.sent++;
    } catch (e) {
      if (e instanceof BotApiError && (e.code === 403 || /chat not found/i.test(e.description || ''))) {
        await db.update(G).set({ chatId: null, nextPostAt: null }).where(eq(G.id, g.id)).run();
        out.unlinked++;
      } else console.warn('group chat post failed', g.id, e.description || e.message);
    }
  }
  return out;
}

