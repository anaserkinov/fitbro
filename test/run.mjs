import assert from 'node:assert/strict';
import { sqlite, ddl } from './shim/sdk-db.js';
import { db } from './shim/sdk.js';
import * as T from '../tgcloud/schema.js';
const L = (p) => import(`../tgcloud/lib/${p}.js`);
const [dates, units, nutrition, strength, users, prs, prog, rem, catalog, off] =
  await Promise.all(['dates','units','nutrition','strength','users','prs','progression','reminders','catalog','openfoodfacts'].map(L));
let n = 0; const ok = (name) => { n++; console.log('  ✓', name); };

console.log('DDL');
const tables = Object.values(T);
for (const t of tables) for (const s of ddl(t)) sqlite.exec(s);
ok(`${tables.length} tables + indexes created in real SQLite`);

console.log('Pure logic');
assert.equal(dates.weekday('2026-10-22'), 4); ok('22 Oct 2026 is a Thursday');
assert.equal(dates.weekStart('2026-10-22', 1), '2026-10-19'); assert.equal(dates.weekStart('2026-10-22', 7), '2026-10-18'); ok('weekStart Mon/Sun');
assert.equal(dates.monthEnd('2026-02-10'), '2026-02-28'); ok('monthEnd');
assert.equal(dates.localDate('Asia/Tokyo', new Date('2026-10-22T20:00:00Z')), '2026-10-23'); ok('localDate rolls over in Tokyo');
assert.equal(dates.zonedToUtc('2026-07-01', '09:00', 'America/New_York').toISOString(), '2026-07-01T13:00:00.000Z');
assert.equal(dates.zonedToUtc('2026-12-01', '09:00', 'America/New_York').toISOString(), '2026-12-01T14:00:00.000Z'); ok('zonedToUtc across DST');
assert.equal(dates.zonedToUtc('2026-03-08', '02:30', 'America/New_York').toISOString(), '2026-03-08T07:30:00.000Z'); ok('skipped DST hour resolves after the jump'); assert.equal(dates.zonedToUtc('2026-11-01', '01:30', 'America/New_York').toISOString(), '2026-11-01T05:30:00.000Z'); ok('repeated DST hour picks the first');
assert.equal(dates.inWindow('23:30', '23:00', '07:00'), true); assert.equal(dates.inWindow('12:00', '23:00', '07:00'), false); ok('quiet hours across midnight');
assert.equal(dates.isValidTimezone('Nope/Zone'), false); assert.equal(dates.localDate('Nope/Zone', new Date('2026-01-01T12:00:00Z')), '2026-01-01'); ok('bad timezone falls back to UTC');
assert.equal(units.formatWeight(80), '80 kg'); assert.equal(units.formatWeight(82.4, 'lb'), '181.7 lb'); assert.equal(units.formatEnergy(2850), '2,850 kcal'); assert.equal(units.formatEnergy(2850, 'kj'), '11,924 kJ'); ok('unit formatting');
assert.equal(strength.e1rm(80, 8), 101.3); assert.equal(strength.e1rm(100, 1), 100); assert.equal(strength.e1rm(60, 15), null); ok('Epley e1RM');
const t = nutrition.computeTargets({ sex: 'male', birthDate: '2000-01-15', heightCm: 180, weightKg: 82.4, activityLevel: 'active', goal: 'cut' }, '2026-10-22');
assert.deepEqual(t, { kcalTarget: 2850, proteinTargetG: 180, carbsTargetG: 330, fatTargetG: 90 }); ok('targets match the design: 2850 kcal · 180/330/90');
assert.equal(nutrition.computeTargets({ sex: 'male' }, '2026-10-22'), null); ok('targets null until profile complete');

console.log('Catalog');
let r = await catalog.seedCatalog(); assert.ok(r.exercisesAdded > 80 && r.foodsAdded > 60); ok(`seeded ${r.exercisesAdded} exercises, ${r.foodsAdded} foods`);
r = await catalog.seedCatalog(); assert.deepEqual(r, { exercisesAdded: 0, foodsAdded: 0 }); ok('re-seed is a no-op');
const bench = await db.select().from(T.exercises).where((await import('./shim/sdk-db.js')).eq(T.exercises.name, 'Barbell Bench Press')).get();
assert.deepEqual(bench.aliases, ['bench', 'bench press', 'bb bench']); ok('json column round-trips');
assert.throws(() => sqlite.prepare("INSERT INTO exercises (user_id, name, muscle) VALUES (0, 'barbell bench press', 'chest')").run(), /UNIQUE/); ok('exercise names unique per user, case-insensitive');

console.log('Users');
const tg = { id: 111, first_name: 'Test', username: 'tester', language_code: 'en' };
let u = await users.ensureUser(tg); assert.equal(u.id, 111); assert.equal(u.timezone, 'UTC'); assert.equal(u.weightUnit, 'kg'); ok('ensureUser creates with defaults');
u = await users.ensureUser({ ...tg, first_name: 'Renamed' }); assert.equal(u.firstName, 'Renamed'); ok('ensureUser updates Telegram fields');
await db.insert(T.bodyWeights).values({ userId: 111, localDate: '2026-10-22', weightKg: 82.4 }).run();
u = await users.updateUser(111, { sex: 'male', birthDate: '2000-01-15', heightCm: 180, activityLevel: 'active', goal: 'cut', timezone: 'Asia/Tashkent' });
assert.equal(u.kcalTarget, 2850); assert.equal(u.targetsManual, false); ok('profile update computes targets');
u = await users.updateUser(111, { kcalTarget: 2500 }); assert.equal(u.targetsManual, true); assert.equal(u.kcalTarget, 2500); ok('manual target switches to manual mode');
u = await users.updateUser(111, { goal: 'bulk' }); assert.equal(u.kcalTarget, 2500); ok('manual targets survive profile changes');
u = await users.updateUser(111, { targetsManual: false }); assert.notEqual(u.kcalTarget, 2500); ok(`back to formula → ${u.kcalTarget} kcal for bulk`);
await assert.rejects(users.updateUser(111, { heightCm: 20 }), (e) => e.parameters.code === 'INVALID_INPUT' && e.parameters.field === 'heightCm'); ok('validation rejects bad height');
await assert.rejects(users.updateUser(111, { hieght: 180 }), /Unknown field/); ok('unknown fields rejected');

console.log('Workout, PRs, progression');
const { eq } = await import('./shim/sdk-db.js');
const [routine] = await db.insert(T.routines).values({ userId: 111, name: 'Push A' }).returning();
const [re] = await db.insert(T.routineExercises).values({ userId: 111, routineId: routine.id, exerciseId: bench.id, targetSets: 3, targetRepsMin: 8, targetRepsMax: 8, targetWeightKg: 80 }).returning();
const [w] = await db.insert(T.workouts).values({ userId: 111, routineId: routine.id, name: 'Push A', localDate: '2026-10-22' }).returning();
assert.equal(w.endedAt, null);
assert.throws(() => sqlite.prepare("INSERT INTO workouts (user_id, name, local_date) VALUES (111, 'x', '2026-10-22')").run(), /UNIQUE/); ok('only one open workout per user');
const [we] = await db.insert(T.workoutExercises).values({ userId: 111, workoutId: w.id, exerciseId: bench.id, routineExerciseId: re.id }).returning();
const addSet = async (pos, weightKg, reps, setType = 'working') => (await db.insert(T.sets).values({ userId: 111, workoutId: w.id, workoutExerciseId: we.id, exerciseId: bench.id, position: pos, setType, weightKg, reps, completed: true, completedAt: new Date(), e1rmKg: strength.e1rm(weightKg, reps) }).returning())[0];
const s0 = await addSet(0, 40, 10, 'warmup'); assert.deepEqual(await prs.recordSetPrs(111, s0, bench), []); ok('warm-up sets never count');
const s1 = await addSet(1, 80, 8); let got = await prs.recordSetPrs(111, s1, bench); assert.ok(got.length === 3 && got.every((p) => p.isFirst)); ok('first sets are silent baselines');
const s2 = await addSet(2, 80, 8); assert.deepEqual(await prs.recordSetPrs(111, s2, bench), []); ok('equal set is not a PR');
const s3 = await addSet(3, 80, 9); got = await prs.recordSetPrs(111, s3, bench);
assert.deepEqual(got.map((p) => p.type).sort(), ['e1rm', 'reps_at_weight']); assert.ok(got.every((p) => !p.isFirst)); ok('80×9 beats reps-at-80 and e1RM, not heaviest');
await prs.removeSetPrs(111, s3.id); got = await prs.recordSetPrs(111, s3, bench); assert.equal(got.length, 2); ok('undo + redo PR');
let vol = await prs.recordSessionVolumePrs(111, w.id); assert.equal(vol[0].value, 80 * 8 * 2 + 80 * 9); assert.equal(vol[0].isFirst, true); ok('session volume excludes warm-up');
const recs = await prs.exerciseRecords(111, bench.id); assert.deepEqual(recs.map((x) => x.type).sort(), ['e1rm', 'max_weight', 'session_volume']); assert.ok(recs[0].achievedAt instanceof Date); ok('exerciseRecords returns current bests');
let ch = await prog.applyProgression(111, w.id); assert.deepEqual(ch.map((c) => c.toKg), [82.5]); ok('3×8 @80 hit → target 82.5 kg');
const s = strength.summarizeSets([s0, s1, s2, s3].map((x) => ({ ...x, trackType: 'weight_reps' }))); assert.deepEqual(s, { totalSets: 3, totalVolumeKg: 2000 }); ok('workout summary');

console.log('Reminders');
u = await users.getUser(111);
await rem.ensureDefaultReminders(u); await rem.ensureDefaultReminders(u);
let list = await rem.listReminders(111); assert.equal(list.length, 5); ok('5 default reminders, idempotent');
const weekly = list.find((x) => x.type === 'weekly_summary'); assert.equal(dates.weekday(dates.localDate('Asia/Tashkent', weekly.nextRunAt)), 7); assert.equal(dates.localTime('Asia/Tashkent', weekly.nextRunAt), '20:00'); ok('weekly summary: next Sunday 20:00 Tashkent');
const from = new Date('2026-10-22T08:00:00Z');   // 13:00 in Tashkent
assert.equal(rem.nextRunAt({ enabled: true, times: ['19:30', '12:30'] }, 'Asia/Tashkent', from).toISOString(), '2026-10-22T14:30:00.000Z'); ok('meal reminder → 19:30 same day');
const due = await rem.dueReminders(new Date(Date.now() + 8 * 86400000)); assert.equal(due.length, 4); ok('dueReminders finds enabled ones only');
await rem.markSent(due[0], u); const after = (await rem.listReminders(111)).find((x) => x.id === due[0].id); assert.ok(after.lastSentAt instanceof Date && after.nextRunAt > new Date()); ok('markSent schedules the next run');
const upd = await rem.updateReminder(u, 'missed_muscle', { enabled: true, params: { days: 5 } }); assert.equal(upd.params.days, 5); assert.ok(upd.nextRunAt); ok('updateReminder enables + reschedules');

console.log('Food & Open Food Facts');
const banana = await db.select().from(T.foods).where(eq(T.foods.name, 'Banana')).get();
assert.equal(nutrition.nutrientsFor(banana, nutrition.gramsFor(banana, 1, 'serving')).kcal, 105); ok('1 medium banana = 105 kcal');
assert.throws(() => nutrition.gramsFor(banana, 100, 'ml'), /measured in g/); ok('unit mismatch rejected');
let calls = 0;
globalThis.fakeFetch = async (url, opts) => { calls++; assert.match(opts.headers['User-Agent'], /FitPro/); return { ok: true, status: 200, json: async () => ({ status: 1, product: { product_name: 'Protein Bar Choco', brands: 'Acme, Acme EU', serving_quantity: '60', serving_size: '1 bar (60 g)', nutriments: { 'energy-kj_100g': 1590, proteins_100g: 33, carbohydrates_100g: 35, fat_100g: 12 } } }) }; };
const bar = await off.lookupBarcode('4006381333931'); assert.equal(bar.kcalPer100, 380); assert.equal(bar.brand, 'Acme'); assert.equal(bar.servingGrams, 60);
await off.lookupBarcode('4006381333931'); assert.equal(calls, 1); ok('barcode fetched once then cached (kJ → kcal)');
globalThis.fakeFetch = async () => ({ ok: false, status: 404 }); assert.equal(await off.lookupBarcode('12345678'), null); ok('unknown barcode → null');
assert.throws(() => off.cleanBarcode('12ab'), /8–14 digits/); ok('bad barcode rejected');

console.log('Delete my data');
await db.insert(T.foods).values({ userId: 111, source: 'custom', name: 'My shake', kcalPer100: 100 }).run();
await users.deleteAllData(111);
for (const tb of tables) { const c = await db.$count(tb, tb.userId ? eq(tb.userId, 111) : eq(tb.id, 111)); assert.equal(c, 0, 'left rows in ' + tb); }
assert.ok((await db.$count(T.exercises)) > 80 && (await db.$count(T.foods, eq(T.foods.userId, 0))) > 60); ok('every user row gone, shared catalogue kept');

console.log(`\nAll ${n} checks passed`);
