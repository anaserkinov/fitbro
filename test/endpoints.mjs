// End-to-end flows through the endpoint wrappers, as the Mini App would call them.
// Runs after run.mjs (tables exist, catalogue seeded).
import assert from 'node:assert/strict';
import { db } from './shim/sdk.js';
import { eq, and, isNotNull } from './shim/sdk-db.js';
import * as T from '../tgcloud/schema.js';
import { endpointFn } from './call.mjs';
import { localDate, addDays, weekday } from '../tgcloud/lib/dates.js';
import { processReminders, processRestTimers } from '../tgcloud/lib/notify.js';
import { encodeBase64 } from '../tgcloud/lib/base64.js';

const E = {};
const call = async (name, input = {}, userId = 222) => {
  E[name] ??= await endpointFn(name);
  const out = await E[name](input, { initData: { user: { id: userId, first_name: 'Endpoint', language_code: 'en' } } });
  assert.ok(!hasDate(out), `${name} returned a Date (it would reach the app as {})`);
  return out;
};
const fails = (p, code) => assert.rejects(p, (e) => (e.parameters && e.parameters.code) === code);
let n = 0; const ok = (name) => { n++; console.log('  ✓', name); };
// What the platform does to a response: a Date becomes {} — so none may be left in one.
const hasDate = (v) => v instanceof Date || (Array.isArray(v) ? v.some(hasDate) : !!v && typeof v === 'object' && Object.values(v).some(hasDate));
const TZ = 'Asia/Tashkent';
const today = localDate(TZ);

console.log('\nEndpoints: router');
{
  const api = (await import('../tgcloud/endpoints/api.js')).default;
  const { ROUTES } = await import('../tgcloud/lib/api-routes.js');
  const ctx = { initData: { user: { id: 222, first_name: 'Endpoint', language_code: 'en' } } };
  await fails(api({ fn: 'nope' }, ctx), 'UNKNOWN_CALL'); await fails(api({ fn: 'toString' }, ctx), 'UNKNOWN_CALL'); await fails(api({}, ctx), 'UNKNOWN_CALL'); ok('unknown or missing call name → UNKNOWN_CALL');
  await fails(api({ fn: 'tick' }, ctx), 'UNKNOWN_CALL'); ok('tick is not reachable through the router');
  const fs = await import('node:fs');
  const documented = new Set([...fs.readFileSync(new URL('../docs/endpoints.md', import.meta.url), 'utf8').matchAll(/^\| `(\w+)`(?: \/ `(\w+)`)?/gm)].flatMap((m) => [m[1], m[2]]).filter(Boolean));
  for (const n of ['tick', 'adminSeed']) documented.delete(n);
  assert.deepEqual([...documented].filter((n) => !ROUTES[n]), [], 'documented but not routed');
  assert.deepEqual(Object.keys(ROUTES).filter((n) => !documented.has(n)), [], 'routed but not documented'); ok('route table matches docs/endpoints.md');
}

console.log('\nEndpoints: account');
let me = await call('getMe'); assert.equal(me.onboarded, false); ok('new user is not onboarded');
await fails(call('getToday'), 'NOT_ONBOARDED'); ok('dashboard needs onboarding');
await fails(call('completeOnboarding', { sex: 'male' }), 'INVALID_INPUT'); ok('onboarding requires the full profile');
me = await call('completeOnboarding', { sex: 'male', birthDate: '2000-01-15', heightCm: 180, weightKg: 82.4, activityLevel: 'active', goal: 'cut', goalWeightKg: 78, timezone: TZ });
assert.equal(me.onboarded, true); assert.equal(me.user.kcalTarget, 2850); assert.equal(me.user.timezone, TZ); ok('onboarding → 2850 kcal, Tashkent time');
let settings = await call('getSettings'); assert.equal(settings.reminders.length, 5); ok('default reminders created');
await fails(call('adminSeed'), 'FORBIDDEN'); await fails(call('tick'), 'FORBIDDEN'); ok('admin + scheduler endpoints locked by default');

console.log('Endpoints: exercises & routines');
let ex = await call('listExercises'); assert.ok(ex.exercises.length >= 88);
ex = await call('listExercises', { q: 'ohp' }); assert.equal(ex.exercises[0].name, 'Overhead Press'); ok('search matches aliases');
const all = (await call('listExercises')).exercises; const id = (name) => all.find((e) => e.name === name).id;
const custom = (await call('saveExercise', { name: 'Landmine Press', muscle: 'shoulders', trackType: 'weight_reps', aliases: ['Landmine'] })).exercise;
assert.equal(custom.userId, 222); assert.deepEqual(custom.aliases, ['landmine']); ok('custom exercise created');
await fails(call('saveExercise', { name: 'barbell bench press', muscle: 'chest', trackType: 'weight_reps' }), 'INVALID_INPUT'); ok('name clash with built-in rejected');
await fails(call('saveExercise', { id: id('Deadlift'), notes: 'x' }), 'NOT_FOUND'); ok('built-ins are read-only');
let routine = (await call('saveRoutine', { name: 'Push A', items: [
  { exerciseId: id('Barbell Bench Press'), targetSets: 3, targetRepsMin: 8, targetWeightKg: 80, restSec: 120 },
  { exerciseId: id('Overhead Press'), targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, targetWeightKg: 50 },
] })).routine;
assert.equal(routine.exerciseCount, 2); assert.equal(routine.setCount, 6); assert.equal(routine.items[0].targetRepsMax, 8); ok('routine saved with estimate ' + routine.estMinutes + ' min');
routine = (await call('saveRoutine', { id: routine.id, items: [{ id: routine.items[0].id, exerciseId: id('Barbell Bench Press'), targetSets: 3, targetRepsMin: 8, targetWeightKg: 80, restSec: 120 }, { exerciseId: custom.id, targetSets: 2 }] })).routine;
assert.deepEqual(routine.items.map((i) => i.exercise.name), ['Barbell Bench Press', 'Landmine Press']); ok('routine items updated in place, removed, added');
routine = (await call('saveRoutine', { id: routine.id, items: [{ id: routine.items[0].id, exerciseId: id('Barbell Bench Press'), targetSets: 3, targetRepsMin: 8, targetWeightKg: 80, restSec: 120 }, { exerciseId: id('Overhead Press'), targetSets: 3, targetRepsMin: 8, targetWeightKg: 50 }] })).routine;
const plan = await call('saveSchedule', { days: [{ weekday: weekday(today), routineId: routine.id }] });
assert.equal(plan.week.find((d) => d.isToday).routineName, 'Push A'); ok('schedule: today is Push A');
await fails(call('getRoutine', { id: routine.id }, 333), 'NOT_FOUND'); ok("another user can't read it");

console.log('Endpoints: dashboard');
let home = await call('getToday');
assert.equal(home.plan.name, 'Push A'); assert.equal(home.remainingKcal, 2850); assert.equal(home.streakDays, 1); assert.equal(home.weight.latest.weightKg, 82.4); ok('today: plan, kcal left, streak, weight');

console.log('Endpoints: live workout');
let w = await call('startWorkout', { routineId: routine.id });
const bench = w.exercises[0];
assert.equal(w.exercises.length, 2); assert.deepEqual(bench.sets.map((s) => [s.weightKg, s.reps, s.completed]), [[80, 8, false], [80, 8, false], [80, 8, false]]); ok('sets pre-filled from routine targets');
await fails(call('startWorkout', {}), 'WORKOUT_IN_PROGRESS'); ok('one workout at a time');
let r = await call('updateSet', { id: bench.sets[0].id, completed: true });
assert.ok(new Date(r.restEndsAt) > new Date()); assert.deepEqual(r.prs, []); assert.equal(r.set.e1rmKg, 101.3); ok('tick set → rest timer, e1RM, no PR on first ever set');
await call('updateSet', { id: bench.sets[1].id, completed: true });
await call('updateSet', { id: bench.sets[2].id, reps: 8, completed: true });
const extra = (await call('addSet', { workoutExerciseId: bench.id })).set; assert.equal(extra.weightKg, 80); assert.equal(extra.completed, false);
await call('deleteSet', { id: extra.id }); ok('add (copies last) + delete set');
w = await call('addWorkoutExercise', { workoutId: w.workout.id, exerciseId: id('Lateral Raise'), sets: 2 }); assert.equal(w.exercises.length, 3);
w = await call('removeWorkoutExercise', { id: w.exercises[2].id }); assert.equal(w.exercises.length, 2); ok('add + remove exercise mid-workout');
assert.ok((await call('setRest', { workoutId: w.workout.id, seconds: 0 })).restEndsAt === null); ok('skip rest');
let fin = await call('finishWorkout', { id: w.workout.id });
assert.equal(fin.totals.totalSets, 3); assert.equal(fin.totals.totalVolumeKg, 1920); assert.deepEqual(fin.prs, []);
assert.deepEqual(fin.progression.map((p) => p.toKg), [82.5]); ok('finish: untouched OHP dropped, 1,920 kg, bench target → 82.5');
assert.equal((await call('getWorkout')).workout, null); ok('no open workout after finishing');

w = await call('startWorkout', { routineId: routine.id });
assert.equal(w.exercises[0].sets[0].weightKg, 82.5); assert.deepEqual(w.exercises[0].previous.map((s) => s.weightKg), [80, 80, 80]); ok('next session: 82.5 kg pre-filled, previous shown');
r = await call('updateSet', { id: w.exercises[0].sets[0].id, completed: true });
assert.deepEqual(r.prs.map((p) => p.type).sort(), ['e1rm', 'max_weight']); ok('82.5×8 → PR alert (heaviest + e1RM; first set at 82.5 is just a baseline)');
fin = await call('finishWorkout', { id: w.workout.id, notes: 'felt strong' });
assert.ok(fin.prs.some((p) => p.type === 'max_weight' && p.value === 82.5 && p.exerciseName === 'Barbell Bench Press')); ok('finish summary lists PRs with exercise names');
const list = await call('listWorkouts', { from: today, to: today });
assert.equal(list.workouts.length, 2); assert.equal(list.workouts[0].notes, 'felt strong'); assert.ok(list.workouts[0].prs.length > 0); assert.equal(list.workouts[1].prs.length, 0); ok('history list with PR flags');
const empty = await call('startWorkout', { name: 'Quick' }); assert.deepEqual((await call('finishWorkout', { id: empty.workout.id })), { discarded: true }); ok('finishing an empty workout discards it');
await fails(call('getWorkout', { id: list.workouts[0].id }, 333), 'NOT_FOUND'); ok("other users can't open your workouts");

console.log('Endpoints: drop sets & supersets');
let arms = await call('startWorkout', { name: 'Arms' });
arms = await call('addWorkoutExercise', { workoutId: arms.workout.id, exerciseId: id('Barbell Curl'), sets: 2 });
arms = await call('addWorkoutExercise', { workoutId: arms.workout.id, exerciseId: id('Triceps Pushdown'), sets: 2 });
const [curl, pushdown] = arms.exercises;
await call('updateSet', { id: curl.sets[0].id, weightKg: 30, reps: 10 });
const drop = (await call('addSet', { workoutExerciseId: curl.id, setType: 'drop', afterSetId: curl.sets[0].id, weightKg: 24 })).set;
arms = await call('getWorkout', { id: arms.workout.id });
assert.deepEqual(arms.exercises[0].sets.map((s) => [s.id === drop.id ? 'drop' : s.setType, s.weightKg]), [['working', 30], ['drop', 24], ['working', null]]);
assert.equal(drop.reps, 10); ok('drop set goes right after its set, lighter, same reps');
r = await call('updateSet', { id: curl.sets[0].id, completed: true }); assert.equal(r.restEndsAt, null); ok('no rest before a drop set');
r = await call('updateSet', { id: drop.id, completed: true }); assert.ok(r.restEndsAt); ok('rest after the drop set');
arms = await call('updateWorkoutExercise', { id: curl.id, linkNext: true });
assert.ok(arms.exercises[0].supersetGroup); assert.equal(arms.exercises[0].supersetGroup, arms.exercises[1].supersetGroup); ok('superset: link with the next exercise');
r = await call('updateSet', { id: pushdown.sets[0].id, completed: true }); assert.ok(r.restEndsAt); ok('superset: rest after the round (curl + drop, pushdown)');
r = await call('updateSet', { id: curl.sets[1].id, completed: true }); assert.equal(r.restEndsAt, null);
assert.equal((await call('getWorkout', { id: arms.workout.id })).workout.restEndsAt, null); ok('superset: no rest between exercises in a round');
r = await call('updateSet', { id: pushdown.sets[1].id, completed: true }); assert.ok(r.restEndsAt); ok('superset: rest after the last exercise of the round');
arms = await call('updateWorkoutExercise', { id: pushdown.id, supersetGroup: null });
assert.deepEqual(arms.exercises.map((e) => e.supersetGroup), [null, null]); ok('unlinking leaves no group of one');
await call('discardWorkout', { id: arms.workout.id });
const grouped = (await call('saveRoutine', { name: 'SS', items: [
  { exerciseId: id('Barbell Curl'), supersetGroup: 7 }, { exerciseId: id('Triceps Pushdown'), supersetGroup: 7 }, { exerciseId: id('Plank'), supersetGroup: 9 },
] })).routine;
assert.deepEqual(grouped.items.map((i) => i.supersetGroup), [1, 1, null]); ok('routine superset groups renumbered, lone group dropped');
arms = await call('startWorkout', { routineId: grouped.id });
assert.deepEqual(arms.exercises.map((e) => e.supersetGroup), [1, 1, null]); ok('workout from routine keeps the superset');
await call('discardWorkout', { id: arms.workout.id });
await call('archiveRoutine', { id: grouped.id });

console.log('Endpoints: progress');
const hist = await call('getExerciseHistory', { exerciseId: id('Barbell Bench Press') });
assert.equal(hist.sessions.length, 2); assert.deepEqual(hist.series.map((s) => s.topWeightKg), [80, 82.5]);
assert.equal(hist.records.find((x) => x.type === 'max_weight').value, 82.5); ok('exercise history: sessions, series, records');
const cons = await call('getConsistency'); assert.equal(cons.workoutCount, 2); assert.equal(cons.days[0].date, today); ok('consistency calendar');
const mv = await call('getMuscleVolume'); assert.equal(mv.muscles[0].muscle, 'chest'); assert.equal(mv.muscles[0].sets, 4); ok('sets per muscle this week');

console.log('Endpoints: food');
const find = async (q) => (await call('searchFoods', { q })).results;
const chick = await find('chicken'); assert.match(chick[0].name, /^Chicken/); ok('food search');
const oats = (await find('oats'))[0], banana = (await find('banana'))[0];
await call('logFood', { meal: 'breakfast', foodId: oats.id, quantity: 80, unit: 'g' });
let day = (await call('logFood', { meal: 'breakfast', foodId: banana.id, quantity: 1, unit: 'serving' })).day;
day = (await call('logFood', { meal: 'snack', quickAdd: { name: 'Protein bar', kcal: 250, proteinG: 20 } })).day;
assert.equal(day.totals.kcal, Math.round(303.2 + 105 + 250)); assert.equal(day.meals[0].items.length, 2); ok('log by grams, by serving, quick add');
const oatLog = day.meals[0].items[0];
day = (await call('updateFoodLog', { id: oatLog.id, quantity: 100 })).day; assert.equal(day.meals[0].items[0].kcal, 379); ok('edit quantity recomputes');
await fails(call('updateFoodLog', { id: oatLog.id, kcal: 5 }), 'INVALID_INPUT'); ok("can't hand-edit kcal of a database food");
day = (await call('deleteFoodLog', { id: day.meals[0].items[1].id })).day; assert.equal(day.meals[0].items.length, 1); ok('delete entry');
const tomorrow = addDays(today, 1);
const copied = await call('copyFood', { fromDate: today, toDate: tomorrow, meal: 'breakfast' }); assert.equal(copied.copied, 1); ok('copy a meal to another day');
const recent = await call('searchFoods'); assert.equal(recent.recent[0].name, oats.name); ok('recent foods');
await call('setFavoriteFood', { foodId: banana.id, favorite: true }); assert.equal((await call('searchFoods')).favorites[0].id, banana.id); ok('favourites');
const shake = (await call('saveFood', { name: 'My shake', baseUnit: 'ml', kcalPer100: 60, proteinPer100: 8, carbsPer100: 5, fatPer100: 1, servingLabel: '1 bottle', servingGrams: 500 })).food;
assert.equal(shake.custom, true); assert.equal((await find('shake'))[0].id, shake.id); ok('custom food, found first in search');
const whey = (await find('whey'))[0];
const recipe = await call('saveRecipe', { name: 'Overnight oats', items: [{ foodId: oats.id, grams: 80 }, { foodId: whey.id, grams: 30 }], servingLabel: '1 jar', servingGrams: 110 });
assert.equal(recipe.food.source, 'recipe'); assert.equal(recipe.items.length, 2); assert.equal(recipe.food.kcalPer100, 384.7); ok('recipe per-100 g from ingredients');
const fruit = (await call('browseFoods', { category: 'fruit' })).foods;
assert.deepEqual(fruit.map((f) => f.name), ['Apple', 'Avocado', 'Banana', 'Blueberries', 'Grapes', 'Orange', 'Strawberries']);
assert.ok(fruit.every((f) => f.category === 'fruit')); assert.equal(fruit.find((f) => f.name === 'Banana').favorite, true); ok('browse a category, A–Z, favourites marked');
assert.deepEqual((await call('browseFoods', { category: 'mine' })).foods.map((f) => f.name), ['My shake']);
assert.deepEqual((await call('browseFoods', { category: 'recipes' })).foods.map((f) => f.name), ['Overnight oats']); ok('browse my foods and my recipes');
assert.deepEqual((await call('browseFoods', { category: 'mine' }, 333)).foods, []); ok("someone else's foods aren't listed");
await fails(call('browseFoods', { category: 'pizza' }), 'INVALID_INPUT'); ok('unknown category refused');
assert.ok((await call('searchFoods', { q: 'o', category: 'drinks' })).results.every((f) => f.category === 'drinks')); ok('search within a category');
const fast = (await call('browseFoods', { category: 'fast_food' })).foods;
const bigMac = fast.find((f) => f.name === "McDonald's Big Mac");
assert.ok(fast.length >= 50); assert.deepEqual([bigMac.kcalPer100, bigMac.servingLabel, bigMac.servingGrams], [257, '1 burger', 219]); ok('fast food: real chain items with their serving');
assert.equal((await find('big mac'))[0].id, bigMac.id); ok('search finds them');
const shawarma = fast.find((f) => f.name === 'Shawarma (chicken)');
assert.equal(shawarma.dish, true); assert.equal(bigMac.dish, false); assert.equal(shawarma.servingLabel, '1 wrap'); ok('shawarma and lavash: estimates in fast food, marked as dishes');
{
  // A bot seeded before pork was taken out still has these rows.
  const { seedCatalog } = await import('../tgcloud/lib/catalog.js');
  await db.insert(T.foods).values([{ userId: 0, source: 'builtin', name: 'Bacon, cooked', kcalPer100: 541 }, { userId: 0, source: 'builtin', name: "Domino's Pepperoni pizza", kcalPer100: 273 }]).run();
  await seedCatalog();
  assert.deepEqual(await find('bacon'), []); assert.deepEqual(await find('pepperoni'), []);
  assert.equal(await db.$count(T.foods, and(eq(T.foods.name, 'Bacon, cooked'), isNotNull(T.foods.archivedAt))), 1); ok('pork foods already in the database are archived on seed');
}
const uz = (await call('browseFoods', { category: 'uzbek' })).foods;
const plov = uz.find((f) => f.name === 'Plov');
assert.ok(uz.length >= 13); assert.ok(plov.kcalPer100 > 170 && plov.kcalPer100 < 190); ok('Uzbek dishes: plov about 180 kcal per 100 g');
let own = await call('makeOwnFood', { id: plov.id });
assert.deepEqual([own.food.source, own.food.custom, own.items.length, own.food.kcalPer100, own.food.servingGrams], ['recipe', true, 6, plov.kcalPer100, 350]);
assert.ok(own.items.every((i) => i.food && i.food.userId === 0)); ok('make my own plov → a recipe with its ingredients, same numbers');
const edited = await call('saveRecipe', { id: own.food.id, items: own.items.map((i) => ({ foodId: i.foodId, grams: i.food.name === 'Cottonseed oil' ? 20 : i.grams })) });
assert.ok(edited.food.kcalPer100 < plov.kcalPer100); assert.equal((await call('getFood', { id: plov.id })).food.kcalPer100, plov.kcalPer100); ok('less oil in my plov lowers mine; the built-in stays');
own = await call('makeOwnFood', { id: bigMac.id });
assert.deepEqual([own.food.source, own.food.kcalPer100, own.food.servingLabel, own.food.fiberPer100], ['custom', 257, '1 burger', 1.6]); ok('make my own of any other food → an editable copy');
await fails(call('makeOwnFood', { id: own.food.id }), 'INVALID_INPUT'); ok('my own food can just be edited');
await call('logWater', { amountMl: 250 }); let water = await call('logWater', { amountMl: 250 }); assert.equal(water.totalMl, 500);
water = await call('undoWater', {}); assert.equal(water.totalMl, 250); ok('water + undo');
globalThis.fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 1, product: { product_name: 'Skyr', nutriments: { 'energy-kcal_100g': 63, proteins_100g: 11 } } }) });
assert.equal((await call('lookupBarcode', { barcode: '5000112637922' })).food.name, 'Skyr'); ok('barcode lookup');

console.log('Endpoints: body');
for (let i = 14; i >= 1; i--) await call('logWeight', { date: addDays(today, -i), weightKg: 84 - (14 - i) * 0.1 });
await call('logWeight', { weightKg: 82.4 });
let body = await call('getBody');
assert.ok(body.weight.weekChangeKg < 0); assert.ok(body.weight.ratePerWeekKg < 0); assert.ok(body.weight.projectedGoalDate > today); ok(`weight trend ${body.weight.ratePerWeekKg} kg/wk, goal by ${body.weight.projectedGoalDate}`);
await call('logMeasurements', { date: addDays(today, -30), waistCm: 85.5, armsCm: 38 });
body = (await call('logMeasurements', { waistCm: 84, bodyFatPct: 17.2 }));
assert.equal(body.measurements.deltas.waistCm, -1.5); assert.equal(body.measurements.latest.armsCm.value, 38); ok('measurements merge + delta vs ≥3 weeks ago');
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
globalThis.fakeApi = {
  sendPhoto: () => ({ message_id: 9, photo: [{ file_id: 'small', file_unique_id: 'u1', width: 90, height: 90 }, { file_id: 'big', file_unique_id: 'u2', width: 1280, height: 1280 }] }),
  getFileContent: () => jpeg,
};
globalThis.apiCalls = [];
const photo = (await call('uploadPhoto', { imageBase64: 'data:image/jpeg;base64,' + encodeBase64(jpeg), pose: 'side' })).photo;
assert.equal(photo.fileId, 'big'); assert.deepEqual(globalThis.apiCalls.map((c) => c[0]), ['sendPhoto', 'deleteMessage']); ok('photo upload → largest file_id, chat message removed');
await fails(call('uploadPhoto', { imageBase64: encodeBase64(new Uint8Array([1, 2, 3])) }), 'INVALID_INPUT'); ok('non-image rejected');
const got = await call('getPhoto', { id: photo.id }); assert.equal(got.mime, 'image/jpeg'); assert.equal(got.imageBase64, encodeBase64(jpeg)); ok('photo download as base64');

console.log('Endpoints: settings & notifications');
const before = (await call('getSettings')).reminders.find((x) => x.type === 'meal').nextRunAt;
settings = await call('updateSettings', { timezone: 'Europe/Berlin', weightUnit: 'lb' });
assert.notEqual(settings.reminders.find((x) => x.type === 'meal').nextRunAt, before); ok('timezone change reschedules reminders');
await call('updateSettings', { timezone: TZ, weightUnit: 'kg' });
const meal = (await call('updateReminder', { type: 'meal', times: ['09:00'] })).reminder; assert.deepEqual(meal.times, ['09:00']); ok('edit reminder times');
await db.update(T.reminders).set({ nextRunAt: new Date(Date.now() - 1000) }).where(eq(T.reminders.userId, 222)).run();
globalThis.apiCalls = []; globalThis.fakeApi = {};
const sent = await processReminders();
const texts = globalThis.apiCalls.filter((c) => c[0] === 'sendMessage').map((c) => c[1].text);
assert.ok(texts.some((t) => t.startsWith('🍽'))); assert.ok(texts.some((t) => t.startsWith('📊'))); assert.ok(!texts.some((t) => t.startsWith('⚖️')));
assert.ok(sent.skipped >= 1); ok(`reminders sent (${sent.sent}), weigh-in skipped because already weighed`);
const after = (await call('getSettings')).reminders; assert.ok(after.every((x) => !x.enabled || new Date(x.nextRunAt) > new Date())); ok('every due reminder rescheduled');
const chatW = await call('startWorkout', { routineId: routine.id });
await db.update(T.workouts).set({ chatMessageId: 1, restEndsAt: new Date(Date.now() - 1000) }).where(eq(T.workouts.id, chatW.workout.id)).run();
globalThis.apiCalls = [];
assert.equal(await processRestTimers(), 1); assert.match(globalThis.apiCalls[0][1].text, /Rest over — next: Barbell Bench Press 82\.5 kg × 8/); ok('rest-over ping names the next set');
await call('discardWorkout', { id: chatW.workout.id });

const { onChannelPost } = await import('../tgcloud/lib/notify.js');
const HB = -1001234567890;
assert.equal(await onChannelPost({ chat: { id: HB, type: 'channel' }, text: 'tick' }, null), null); ok('heartbeat off when no channel is configured');
assert.equal(await onChannelPost({ chat: { id: -100999, type: 'channel' }, text: 'tick' }, HB), null); ok('a post in another channel does nothing');
assert.equal(await onChannelPost({ chat: { id: HB, type: 'channel' }, text: 'hello' }, HB), null); ok('other text in the heartbeat channel does nothing');
const beat = await onChannelPost({ chat: { id: HB, type: 'channel' }, text: 'tick' }, HB);
assert.ok(beat && beat.reminders && 'friendPings' in beat && 'chatPosts' in beat); ok('"tick" in the heartbeat channel runs the scheduler');
globalThis.apiCalls = [];
await onChannelPost({ chat: { id: HB, type: 'channel' }, text: 'Ping ' }, HB);   // as a phone sends it
const pong = globalThis.apiCalls.filter((c) => c[0] === 'sendMessage').at(-1)[1];
assert.equal(pong.chat_id, HB); assert.match(pong.text, /^pong ✓ .* UTC\nreminders: \d+ sent/); ok('"ping" runs it too and answers in the channel');
const onChannelHandler = (await import('../tgcloud/handlers/channel_post.js')).default;
await onChannelHandler({ chat: { id: HB, type: 'channel' }, text: 'tick' }); ok('handler with the default (unset) channel is a no-op');

console.log('Endpoints: delete my data');
await fails(call('deleteMyData', {}), 'CONFIRM_REQUIRED'); ok('needs confirmation');
assert.deepEqual(await call('deleteMyData', { confirm: 'DELETE' }), { deleted: true });
me = await call('getMe'); assert.equal(me.onboarded, false); assert.equal((await db.$count(T.workouts, eq(T.workouts.userId, 222))), 0); ok('account wiped; next open starts fresh');

console.log(`\nAll ${n} endpoint checks passed`);
