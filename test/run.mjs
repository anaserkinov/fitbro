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

console.log('Programs (math)');
{
  const { PROGRAM_BY_CODE, trainingMax, weekInfo, roundTo, roundDown, guessKg, e1rmWithRir, fromOneRepMax } = await import('../tgcloud/lib/data/programs.js');
  const w531 = PROGRAM_BY_CODE.wendler_531, ppl = PROGRAM_BY_CODE.ppl_12, fb = PROGRAM_BY_CODE.full_body_beginner;
  const benchMain = w531.days[2].exercises[0];
  const st = (workingKg, extra = {}) => ({ workingKg, reps: null, misses: 0, cycle: 0, source: 'history', ...extra });
  const at = (prog, ex, weekIndex, state) => prog.prescribe(ex, { state, weekIndex }).map((s) => [s.weightKg, s.reps]);
  const done = (kg, reps, extra = {}) => reps.map((r) => ({ weightKg: kg, reps: r, ...extra }));
  const adv = (prog, ex, state, sets, weekIndex = 0) => prog.advance(ex, state, sets, { weekIndex });

  assert.deepEqual(at(w531, benchMain, 1, st(100)), [[70, 3], [80, 3], [90, 3]]); ok('5/3/1 week 2, TM 100 → 70/80/90 × 3');
  assert.deepEqual(at(w531, benchMain, 3, st(100)), [[40, 5], [50, 5], [60, 5]]); ok('5/3/1 week 4 is the deload');
  assert.deepEqual(at(w531, benchMain, 0, null), [[null, 5], [null, 5], [null, 5]]); ok('no state → reps only');
  assert.equal(trainingMax(111), 100); assert.equal(roundTo(66.6), 67.5); assert.equal(roundDown(36), 35); ok('training max = 90% of 1RM; plate rounding');
  let r = w531.roll(benchMain, st(100), 4);
  assert.deepEqual([r.workingKg, r.cycle, r.change.kind], [102.5, 1, 'up']); ok('new wave: TM +2.5 kg');
  assert.equal(w531.roll(benchMain, st(100, { cycle: 1 }), 5), null); ok('same wave → no roll');
  const wave1 = (last) => [{ weightKg: 65, reps: 5 }, { weightKg: 75, reps: 5 }, { weightKg: 85, reps: last }];
  assert.equal(adv(w531, benchMain, st(100), wave1(3), 0).misses, 1);
  assert.equal(adv(w531, benchMain, st(100), wave1(7), 0), null);
  r = w531.roll(benchMain, st(100, { misses: 1 }), 4);
  assert.deepEqual([r.workingKg, r.misses, r.change.kind], [90, 0, 'reset']); ok('a short AMRAP → next wave starts from 90% of the TM');

  const pplBench = ppl.days[0].exercises[0];
  assert.deepEqual(at(ppl, pplBench, 0, st(80, { reps: 7 })), Array(4).fill([80, 7])); ok('PPL: sets at the working weight and rep target');
  r = adv(ppl, pplBench, st(80, { reps: 8 }), done(80, [8, 8, 8, 8]));
  assert.deepEqual([r.workingKg, r.reps, r.change.kind], [82.5, 6, 'up']); ok('double progression: top of the range → +2.5 kg, back to 6 reps');
  r = adv(ppl, pplBench, st(80, { reps: 7 }), done(80, [8, 8, 7, 8]));
  assert.deepEqual([r.workingKg, r.reps, r.change], [80, 8, null]); ok('target met but not every set at the top → same weight, one more rep');
  r = adv(ppl, pplBench, st(80, { reps: 8 }), done(80, [8, 8, 8, 8]).map((x, i) => (i === 3 ? { ...x, rir: 0 } : x)));
  assert.deepEqual([r.workingKg, r.change.kind], [80, 'hold']); ok('last set all-out (0 reps left) → hold');
  assert.deepEqual(at(ppl, pplBench, 3, st(80, { reps: 8 })), [[80, 6], [80, 6]]); ok('PPL week 4: deload — 60% of the sets');
  assert.equal(adv(ppl, pplBench, st(80, { reps: 8 }), done(80, [8, 8, 8, 8]), 3), null); ok('deload sessions never advance');
  assert.equal(adv(ppl, pplBench, st(80, { reps: 6 }), done(70, [8, 8, 8, 8])), null); ok('went lighter than planned → no verdict');

  const squat = fb.days[0].exercises[0];
  assert.equal(adv(fb, squat, st(60), done(60, [5, 5, 5])).workingKg, 65);
  r = adv(fb, squat, st(60), done(60, [5, 5, 4]));
  assert.deepEqual([r.workingKg, r.misses, r.change], [60, 1, null]); ok('linear: all reps → +5 kg (lower body), a miss → same weight, counted');
  r = adv(fb, squat, st(40, { misses: 2 }), done(40, [5, 4, 3]));
  assert.deepEqual([r.workingKg, r.misses, r.change.kind], [35, 0, 'reset']); ok('third miss in a row → 90%, rounded down (40 → 35)');
  assert.equal(adv(fb, squat, st(60, { misses: 2 }), done(60, [5, 5, 5])).misses, 0); ok('a hit clears the misses');
  assert.equal(adv(fb, squat, st(60), done(65, [5, 5, 5])).workingKg, 70); ok('heavier than planned with all reps → builds on that');

  assert.equal(guessKg(squat, { sex: 'male', bodyKg: 80 }), 40); assert.equal(guessKg(squat, { sex: 'female', bodyKg: 60 }), 17.5);
  assert.equal(guessKg(squat, { sex: 'male', bodyKg: null }), null); assert.equal(guessKg(ppl.days[0].exercises[3], { sex: 'male', bodyKg: 80 }), null); ok('starting guess: share of body weight; none for isolation or without a weigh-in');
  assert.equal(Math.round(e1rmWithRir({ weightKg: 70, reps: 5, rir: 2 }) * 10) / 10, 86.3);
  assert.equal(e1rmWithRir({ weightKg: 70, reps: 5 }), 84); assert.equal(e1rmWithRir({ weightKg: 70, reps: 5, rpe: 8 }), e1rmWithRir({ weightKg: 70, reps: 5, rir: 2 })); ok('e1RM from reps + reps left (default 1; RPE 8 = 2 left)');
  r = adv(fb, squat, st(40, { source: 'guess' }), done(70, [5], { rir: 2 }));
  assert.deepEqual([r.workingKg, r.source, r.change.kind], [70, 'calibrated', 'calibrated']);
  assert.equal(adv(fb, squat, st(40, { source: 'guess' }), done(70, [5])).workingKg, 67.5); ok('calibration: 70 × 5 with 2 left → 70 kg; not said → 67.5 kg');
  assert.equal(adv(fb, squat, st(40, { source: 'guess' }), []), null); ok('calibration with nothing done → still calibrating');
  assert.equal(fromOneRepMax(benchMain, 111), 100); assert.equal(fromOneRepMax(pplBench, 100), 80); ok('from a 1RM: 5/3/1 training max, or 2-in-the-tank weight for the bottom of the range');

  assert.equal(weekInfo(fb, 7).finished, false); assert.equal(weekInfo(fb, 8).finished, true);
  assert.deepEqual(weekInfo(w531, 5), { week: 2, of: 4, cycle: 2, deload: false, finished: false }); ok('week info: fixed programs end, 5/3/1 cycles');
}

console.log('Program recommendations');
{
  const { recommendPrograms, inferLevel } = await import('../tgcloud/lib/programs.js');
  const { PROGRAMS } = await import('../tgcloud/lib/data/programs.js');
  const none = { activeWeeks: 0, squatRatio: 0, benchRatio: 0 };
  const rec = (profile, signals = none) => recommendPrograms({ goal: 'maintain', sessionMinutes: null, ...profile }, signals, PROGRAMS);
  const codes = (r) => r.map((x) => x.code);
  const keys = (r) => r.reasons.map((x) => x.key);

  assert.equal(inferLevel(none), 'new'); assert.equal(inferLevel({ activeWeeks: 8, squatRatio: 0, benchRatio: 0 }), 'some');
  assert.equal(inferLevel({ activeWeeks: 2, squatRatio: 1.1, benchRatio: 0 }), 'some'); assert.equal(inferLevel({ activeWeeks: 14, squatRatio: 1.6, benchRatio: 0 }), 'experienced');
  assert.equal(inferLevel({ activeWeeks: 14, squatRatio: 1.2, benchRatio: 0.9 }), 'some'); ok('level from the log: active weeks and strength for body weight');

  let r = rec({ experience: 'new', equipment: 'gym', workoutsPerWeek: 3, sessionMinutes: 45 });
  assert.deepEqual(codes(r), ['full_body_beginner', 'dumbbell_full_body_3', 'full_body_2day']); assert.deepEqual(keys(r[0]), ['Fits your {n} days a week', 'Made for beginners', 'Sessions fit in {n} min']);
  assert.deepEqual(r[0].reasons[2].params, { n: 35 }); ok('beginner, 3 days, gym → beginner full body first (5/3/1, PPL and upper/lower too advanced), with reasons');
  r = rec({ experience: 'some', equipment: 'gym', workoutsPerWeek: 6, goal: 'bulk' });
  assert.equal(codes(r)[0], 'ppl_12'); assert.ok(keys(r[0]).includes('Plenty of volume for building muscle')); ok('some experience, 6 days, bulk → PPL first');
  r = rec({ experience: 'some', equipment: 'gym', workoutsPerWeek: 4 });
  assert.deepEqual(codes(r).slice(0, 2), ['wendler_531', 'upper_lower_4']); ok('some experience, 4 days → 5/3/1 and upper/lower');
  assert.equal(codes(rec({ experience: 'some', equipment: 'gym', workoutsPerWeek: 4, goal: 'bulk' }))[0], 'upper_lower_4'); ok('…and upper/lower first when building muscle');
  r = rec({ experience: 'new', equipment: 'gym', workoutsPerWeek: 4 }, { activeWeeks: 14, squatRatio: 1.6, benchRatio: 1.2 });
  assert.equal(codes(r)[0], 'wendler_531'); assert.ok(keys(r[0]).includes('Your log shows steady training')); ok('said beginner, log says experienced → recommended at the higher level, with why');
  r = rec({ experience: 'experienced', equipment: 'gym', workoutsPerWeek: 4 });
  assert.equal(codes(r)[0], 'wendler_531'); assert.ok(keys(r[0]).includes('For experienced lifters')); ok('no history never moves a user down');
  r = rec({ experience: 'new', equipment: 'dumbbells', workoutsPerWeek: 3 });
  assert.equal(codes(r)[0], 'dumbbell_full_body_3'); assert.ok(keys(r[0]).includes('Built for dumbbells only')); assert.ok(!codes(r).some((c) => ['full_body_beginner', 'ppl_12', 'wendler_531'].includes(c))); ok('dumbbells, 3 days → dumbbell full body; no barbell programs');
  assert.deepEqual(codes(rec({ experience: 'new', equipment: 'home', workoutsPerWeek: 3 })), ['home_bodyweight_3']); ok('home → the bodyweight program');
  assert.ok(!codes(rec({ experience: 'new', equipment: 'gym', workoutsPerWeek: 3 })).includes('home_bodyweight_3')); ok('gym users aren’t sent home');
  assert.deepEqual(rec({ experience: null, equipment: 'gym', workoutsPerWeek: 3 }), []); ok('unanswered profile → no recommendation');
  assert.deepEqual(rec({ experience: 'experienced', equipment: 'gym', workoutsPerWeek: 7 }).map((x) => x.code), ['ppl_12']); assert.deepEqual(rec({ experience: 'new', equipment: 'home', workoutsPerWeek: 6 }), []); ok('no program within a day of the weekly target → none');
}

console.log('Program slots and templates');
{
  const { PROGRAMS, PROGRAM_BY_CODE, planFor, advanceFor } = await import('../tgcloud/lib/data/programs.js');
  const { resolveProgram, candidates, choicesOf, SLOTS } = await import('../tgcloud/lib/data/programs.js');
  const { BUILTIN_EXERCISES } = await import('../tgcloud/lib/data/exercises.js');
  const catalog = new Map(BUILTIN_EXERCISES.map((e) => [e.name, e]));
  const names = (r, d) => r.days[d].exercises.map((x) => x.name);

  const unknown = [...new Set([...Object.values(SLOTS).flatMap((s) => [...s.gym, ...s.dumbbells, ...s.home]), ...PROGRAMS.flatMap((p) => p.days.flatMap((d) => d.exercises.map((x) => x.name)))])].filter((n) => !catalog.has(n));
  assert.deepEqual(unknown, []); ok('every slot candidate and template exercise is in the catalogue');
  const notDoable = PROGRAMS.flatMap((p) => p.equipment.filter((eq) => !resolveProgram(p, { equipment: eq }).doable).map((eq) => `${p.code}/${eq}`));
  assert.deepEqual(notDoable, []); ok('each template resolves every required exercise for every equipment it lists');
  const timed = PROGRAMS.flatMap((p) => ['gym', 'dumbbells', 'home'].flatMap((eq) => resolveProgram(p, { equipment: eq }).days.flatMap((d) => d.exercises.map((x) => x.name))))
    .filter((n) => !['weight_reps', 'bodyweight_reps'].includes(catalog.get(n).trackType));
  assert.deepEqual([...new Set(timed)], []); ok('programs only use weight × reps or bodyweight reps exercises');

  const ppl = PROGRAM_BY_CODE.ppl_12, fb = PROGRAM_BY_CODE.full_body_beginner;
  assert.deepEqual(choicesOf(resolveProgram(ppl)), Object.fromEntries(ppl.days.flatMap((d, di) => d.exercises.map((x, i) => [`${di}.${i}`, x.name])))); ok('gym, no time limit → exactly the template (no change for existing users)');
  assert.deepEqual(names(resolveProgram(fb, { equipment: 'dumbbells' }), 0), ['Goblet Squat', 'Dumbbell Bench Press', 'Dumbbell Row']);
  assert.deepEqual(names(resolveProgram(fb, { equipment: 'dumbbells' }), 1), ['Goblet Squat', 'Seated Dumbbell Press', 'Dumbbell Romanian Deadlift']); ok('beginner full body with dumbbells → goblet squat, dumbbell press, row, RDL');
  assert.deepEqual(names(resolveProgram(ppl, { equipment: 'dumbbells' }), 1), ['Dumbbell Row', 'Lat Pulldown', 'Rear Delt Fly', 'Dumbbell Curl']);
  assert.equal(resolveProgram(ppl, { equipment: 'dumbbells' }).doable, false); ok('PPL with dumbbells: optional cable row dropped; lat pulldown has no dumbbell option → kept as is, not doable');
  let r = resolveProgram(ppl, { sessionMinutes: 45 });
  assert.deepEqual(names(r, 0), ['Barbell Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Lateral Raise']); assert.ok(r.days.every((d) => d.minutes <= 45)); ok('45 min → optional accessories dropped from the end, main lifts kept');
  assert.equal(resolveProgram(ppl, { sessionMinutes: 30 }).days[0].exercises.length, 3); ok('never below the required exercises');
  r = resolveProgram(fb, { swaps: { '0.2': 'Dumbbell Row', '0.1': 'Squat Jumps' } });
  assert.deepEqual(names(r, 0), ['Back Squat', 'Barbell Bench Press', 'Dumbbell Row']); ok('valid swap applied, unknown one ignored');
  assert.ok(candidates(fb.days[0].exercises[0], 'home').every((n) => catalog.get(n).equipment === 'bodyweight')); ok('home candidates need no equipment');

  const home = PROGRAM_BY_CODE.home_bodyweight_3;
  const pushup = { ...home.days[0].exercises[1], track: 'bodyweight_reps' };
  assert.deepEqual(planFor(home, pushup, { state: { reps: 9 }, weekIndex: 0 }).map((x) => [x.weightKg, x.reps]), Array(3).fill([null, 9])); ok('bodyweight: reps only');
  r = advanceFor(home, pushup, { reps: 9 }, [{ reps: 9 }, { reps: 10 }, { reps: 9 }], { weekIndex: 0 });
  assert.deepEqual([r.reps, r.change.kind], [10, 'reps']);
  assert.equal(advanceFor(home, pushup, { reps: 9 }, [{ reps: 9 }, { reps: 8 }, { reps: 9 }], { weekIndex: 0 }), null);
  assert.equal(advanceFor(home, pushup, { reps: 15 }, [{ reps: 15 }, { reps: 15 }, { reps: 15 }], { weekIndex: 0 }), null); ok('bodyweight: +1 rep when every set hits, same on a miss, holds at the top of the range');
  const ul = PROGRAM_BY_CODE.upper_lower_4;
  assert.equal(ul.prescribe(ul.days[0].exercises[0], { state: { workingKg: 80 }, weekIndex: 4 }).length, 2); assert.equal(ul.advance(ul.days[0].exercises[0], { workingKg: 80, source: 'history' }, [], { weekIndex: 4 }), null); ok('upper/lower: every 5th week is a deload');
}

console.log('Food catalogue');
{
  const { BUILTIN_FOODS, BUILTIN_FOOD_CATEGORY, DISHES } = await import('../tgcloud/lib/data/foods.js');
  const { CATALOG } = await import('../tgcloud/lib/i18n/catalog.js');
  const APP_FOOD = (await import('../src/i18n/food.js')).default;
  const byName = new Map(BUILTIN_FOODS.map((f) => [f.name, f]));
  const names = BUILTIN_FOODS.map((f) => f.name.toLowerCase());
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []); ok('built-in food names are unique (seeding matches by name)');
  const { RETIRED_FOODS } = await import('../tgcloud/lib/data/foods.js');
  assert.deepEqual(RETIRED_FOODS.filter((n) => byName.has(n)), []);
  assert.deepEqual(names.filter((n) => /pork|bacon|ham\b|pepperoni|sausage|salami|lard/.test(n)), []); ok('no pork: retired foods are gone from the catalogue');
  assert.deepEqual(DISHES.flatMap(([, , , , items]) => items.map(([n]) => n)).filter((n) => !byName.has(n)), []); ok('every dish ingredient is a built-in food');
  for (const [name, , , , items] of DISHES) {
    assert.deepEqual(nutrition.recipePer100(items.map(([n, grams]) => ({ food: byName.get(n), grams }))),
      (({ kcalPer100, proteinPer100, carbsPer100, fatPer100 }) => ({ kcalPer100, proteinPer100, carbsPer100, fatPer100 }))(byName.get(name)), name);
  }
  ok('dish values = the recipe maths on their ingredients (a copied recipe matches)');
  const fresh = Object.keys(BUILTIN_FOOD_CATEGORY).filter((n) => ['fast_food', 'uzbek'].includes(BUILTIN_FOOD_CATEGORY[n]));
  const missing = [];
  for (const l of ['ru', 'uz']) {
    for (const n of fresh) if (!CATALOG[l][n]) missing.push(`${l} name: ${n}`);
    for (const f of BUILTIN_FOODS) if (f.servingLabel && !APP_FOOD[l][f.servingLabel]) missing.push(`${l} serving: ${f.servingLabel}`);
  }
  assert.deepEqual([...new Set(missing)], []); ok('new foods and every serving label have ru and uz');
}

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
