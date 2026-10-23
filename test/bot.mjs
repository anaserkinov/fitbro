// Chat bot flows through handlers/message.js and handlers/callback_query.js, with a
// fake Bot API that records what the bot sends. Runs after endpoints.mjs.
import assert from 'node:assert/strict';
import { db } from './shim/sdk.js';
import { eq } from './shim/sdk-db.js';
import * as T from '../tgcloud/schema.js';
import { endpointFn } from './call.mjs';
import onMessage from '../tgcloud/handlers/message.js';
import onCallback from '../tgcloud/handlers/callback_query.js';
import { getWorkout } from '../tgcloud/lib/workouts.js';
import { getUser } from '../tgcloud/lib/users.js';
import { weekday, localDate } from '../tgcloud/lib/dates.js';

const UID = 444;
const from = { id: UID, first_name: 'Chat', language_code: 'en' };
let msgId = 100;
globalThis.fakeApi = {
  sendMessage: () => ({ message_id: ++msgId }),
  editMessageText: () => ({}),
};
const calls = () => globalThis.apiCalls;
const reset = () => { globalThis.apiCalls = []; };
const sent = (method = 'sendMessage') => calls().filter((c) => c[0] === method).map((c) => c[1]);
const last = (method) => sent(method).at(-1);
const say = (text, extra = {}) => onMessage({ message_id: ++msgId, from, chat: { id: UID, type: 'private' }, text, ...extra });
const tap = async (data, messageId = msgId) => {
  await onCallback({ id: 'cb' + messageId, from, data, message: { message_id: messageId, chat: { id: UID, type: 'private' } } });
  return calls().filter((c) => c[0] === 'answerCallbackQuery').at(-1)[1].text;
};
const buttons = (m) => (m.reply_markup?.inline_keyboard || []).flat();
const endpoint = async (name, input) => (await endpointFn(name))(input, { initData: { user: from } });
let n = 0; const ok = (name) => { n++; console.log('  ✓', name); };

console.log('\nChat bot');
reset(); await say('/start');
assert.match(sent()[0].text, /Hey, Chat/); assert.ok(sent()[0].reply_markup.keyboard); assert.equal(sent().length, 2);
assert.equal(buttons(sent()[1])[0].text, '📱 Set up FitPro'); ok('/start: welcome, 4-button keyboard, setup button');
assert.equal(calls().filter((c) => c[0] === 'setChatMenuButton').length, 1); ok('menu button opens the app');
reset(); await say('82.4'); assert.match(last().text, /one-minute setup/); ok('nothing works before setup — points to the app');

await endpoint('completeOnboarding', { sex: 'male', birthDate: '1995-03-01', heightCm: 178, weightKg: 80, activityLevel: 'moderate', goal: 'maintain', timezone: 'UTC' });
reset(); await say('82,4');
assert.match(last().text, /Saved <b>82\.4 kg<\/b>/); assert.equal(buttons(last())[0].text, '↩️ Undo'); ok('plain number "82,4" logs weight');
assert.equal(await tap(buttons(last())[0].callback_data), 'Removed'); assert.match(last('editMessageText').text, /removed/); ok('undo weigh-in');
reset(); await say('181 lb'); assert.match(last().text, /82\.1 kg/); ok('"181 lb" converts');
reset(); await say('7'); assert.match(last().text, /Tap a button/); ok('random text → short hint, nothing logged');

reset(); await say('💧 +250 ml'); assert.match(last().text, /0\.25<\/b> \/ 3\.0 L/);
await tap('h2o:add'); assert.match(last('editMessageText').text, /0\.50/);
await tap('h2o:undo'); assert.match(last('editMessageText').text, /0\.25/); ok('water: +250, again, undo — one message updated');

reset(); await say('🏋️ Workout'); assert.match(last().text, /no routines/); ok('no routines → link to create one');
const ex = (await endpoint('listExercises', {})).exercises; const id = (name) => ex.find((e) => e.name === name).id;
const routine = (await endpoint('saveRoutine', { name: 'Upper', items: [
  { exerciseId: id('Barbell Bench Press'), targetSets: 2, targetRepsMin: 8, targetWeightKg: 80 },
  { exerciseId: id('Pull-up'), targetSets: 2, targetRepsMin: 6 } ] })).routine;
await endpoint('saveSchedule', { days: [{ weekday: weekday(localDate('UTC')), routineId: routine.id }] });
reset(); await say('🏋️ Workout');
assert.deepEqual(buttons(last()).map((b) => b.text).slice(0, 1), ['▶️ Upper · today']); ok('routine picker, today’s first');

reset(); await tap(`w:go:${routine.id}`);
const card = last(); const cardId = msgId;
assert.match(card.text, /Barbell Bench Press<\/b> — set 1 of 2/); assert.match(card.text, /▶️ <b>80 kg × 8<\/b>/);
assert.deepEqual(buttons(card).map((b) => b.text), ['✅ Done', '−2.5 kg', '+2.5 kg', '−1 rep', '+1 rep', '⏭ Skip set', 'Next exercise ▸', '📱 App', '🏁 Finish']);
let w = (await getWorkout(await getUser(UID), {})).workout; assert.equal(w.chatMessageId, cardId); ok('start → workout card with the next set and buttons');

const setId = (b) => Number(b.callback_data.split(':')[2]);
reset(); await tap(buttons(card)[2].callback_data, cardId);
assert.match(last('editMessageText').text, /82\.5 kg × 8/); ok('+2.5 kg edits the card in place');
reset(); const doneAnswer = await tap(`w:d:${setId(buttons(card)[0])}`, cardId);
assert.equal(doneAnswer, 'Done ✓'); assert.match(last('editMessageText').text, /set 2 of 2/); assert.match(last('editMessageText').text, /⏱ Rest/); ok('✅ Done → next set, rest time shown');
const card2 = last('editMessageText');
reset(); await tap(`w:n:${w.id}`, cardId); assert.match(last('editMessageText').text, /Pull-up<\/b> — set 1 of 2/); assert.match(last('editMessageText').text, /▶️ <b>6 reps<\/b>/); assert.deepEqual(buttons(last('editMessageText')).slice(1, 5).map((b) => b.text), ['−2.5 kg', '+2.5 kg', '−1 rep', '+1 rep']); ok('Next exercise → pull-ups (reps, optional added weight)');
const pull = last('editMessageText');
reset(); await tap(`w:s:${setId(buttons(pull)[0])}`, cardId); assert.match(last('editMessageText').text, /Pull-up<\/b> — set 1 of 1/); ok('skip removes a set');
reset(); await tap(`w:d:${setId(buttons(card2)[0])}`, cardId);
reset(); await tap(`w:d:${setId(buttons(last('editMessageText') || pull)[0])}`, cardId);
reset(); const fin = await tap(`w:f:${w.id}`, cardId);
assert.equal(fin, 'Finished 💪'); assert.match(last('editMessageText').text, /✅ <b>Upper<\/b> done/); ok('finish → summary in the same message');
assert.equal(await db.$count(T.activities, eq(T.activities.workoutId, w.id)), 1); ok('finishing in chat adds a friends feed item');
assert.match(last('editMessageText').text, /🏅 <b>Achievement unlocked<\/b>\n🏁 First workout/); ok('first workout in chat → achievement line');
reset(); const prsBefore = await db.$count(T.personalRecords, eq(T.personalRecords.userId, UID));
const stale = await tap(`w:d:${setId(buttons(card)[0])}`, cardId);
assert.equal(stale, 'Already done'); assert.match(last('editMessageText').text, /already finished/);
assert.equal(await db.$count(T.personalRecords, eq(T.personalRecords.userId, UID)), prsBefore); ok('old card: refreshes only, changes nothing');

reset(); await say('📊 Today'); assert.match(last().text, /📊 <b>Today<\/b>/); assert.match(last().text, /Done ✓: Upper/); ok('Today summary');

reset(); await onMessage({ message_id: ++msgId, from, chat: { id: UID, type: 'private' }, photo: [{ file_id: 's', file_unique_id: 's1', width: 90, height: 90 }, { file_id: 'L', file_unique_id: 'L1', width: 1280, height: 1280 }] });
assert.match(last().text, /progress photo/); await tap('ph:side');
const photos = await db.select().from(T.progressPhotos).where(eq(T.progressPhotos.userId, UID)).all();
assert.equal(photos.length, 1); assert.equal(photos[0].fileId, 'L'); assert.equal(photos[0].pose, 'side'); ok('photo → pick pose → saved (largest size)');

reset(); await onMessage({ message_id: 1, from, chat: { id: -100, type: 'group' }, text: '82' }); assert.equal(calls().length, 0); ok('ignores group chats');

await endpoint('deleteMyData', { confirm: 'DELETE' });

// Languages: a new user starts in their Telegram language and can switch in the app.
const ru = { id: 445, first_name: 'Аня', language_code: 'ru' };
const sayAs = (u, text) => onMessage({ message_id: ++msgId, from: u, chat: { id: u.id, type: 'private' }, text });
const endpointAs = async (u, name, input) => (await endpointFn(name))(input, { initData: { user: u } });
reset(); await sayAs(ru, '/start');
assert.match(sent()[0].text, /Привет, Аня!/); assert.equal(sent()[0].reply_markup.keyboard[0][1].text, '📊 Сегодня');
assert.equal(buttons(sent()[1])[0].text, '📱 Настроить FitPro'); ok('Telegram language ru → Russian welcome and keyboard');
await endpointAs(ru, 'completeOnboarding', { sex: 'female', birthDate: '1998-05-01', heightCm: 165, weightKg: 60, activityLevel: 'moderate', goal: 'cut', timezone: 'UTC' });
reset(); await sayAs(ru, '62,5'); assert.match(last().text, /Записал <b>62,5 кг<\/b>/); assert.equal(buttons(last())[0].text, '↩️ Отменить'); ok('ru: weight with decimal comma and кг');
reset(); await endpointAs(ru, 'updateSettings', { language: 'uz' });
assert.match(last().text, /o‘zbekcha/); assert.equal(last().reply_markup.keyboard[0][0].text, '🏋️ Mashg‘ulot'); ok('switching language sends a fresh keyboard');
reset(); await sayAs(ru, '📊 Сегодня'); assert.match(last().text, /📊 <b>Bugun<\/b>/); ok('an old-language button still works, reply in the new language');
await endpointAs(ru, 'deleteMyData', { confirm: 'DELETE' });

console.log(`\nAll ${n} chat checks passed`);
