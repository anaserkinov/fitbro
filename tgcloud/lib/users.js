import { db } from 'sdk';
import { eq, desc } from 'sdk/db';
import * as T from '../schema.js';
import { computeTargets } from './nutrition.js';
import { localDate, isValidTimezone, ageOn } from './dates.js';
import * as v from './validate.js';

// Users are keyed by Telegram user id. Every entry point (chat handler or Mini App
// endpoint) calls ensureUser() with the Telegram `User` object it received.

export async function ensureUser(tg) {
  if (!tg || !Number.isInteger(tg.id)) throw new Error('ensureUser: a Telegram user is required');
  const fields = {
    firstName: tg.first_name ?? null,
    username: tg.username ?? null,
    languageCode: tg.language_code ?? null,
  };
  // Most calls find the user unchanged — skip the write then.
  const existing = await getUser(tg.id);
  if (existing && Object.keys(fields).every((k) => existing[k] === fields[k])) return existing;
  const rows = await db.insert(T.users)
    .values({ id: tg.id, ...fields })
    .onConflictDoUpdate({ target: T.users.id, set: fields })
    .returning();
  return rows[0];
}

export async function getUser(userId) {
  return db.select().from(T.users).where(eq(T.users.id, userId)).get();
}

export function today(user) {
  return localDate(user.timezone);
}

export async function latestWeightKg(userId) {
  const row = await db.select({ weightKg: T.bodyWeights.weightKg })
    .from(T.bodyWeights)
    .where(eq(T.bodyWeights.userId, userId))
    .orderBy(desc(T.bodyWeights.localDate))
    .limit(1)
    .get();
  return row ? row.weightKg : null;
}

const enumField = (name) => (x, k) => v.oneOf(x, name, k);

const PROFILE_SPEC = {
  sex:             enumField('sex'),
  birthDate:       (x, k) => {
    const d = v.date(x, k);
    const age = ageOn(d, localDate('UTC'));
    if (age < 13 || age > 100) v.invalid('Age must be between 13 and 100', k);
    return d;
  },
  heightCm:        (x, k) => v.num(x, k, { min: 100, max: 250 }),
  activityLevel:   enumField('activityLevel'),
  goal:            enumField('goal'),
  trainingSplit:   enumField('trainingSplit'),
  goalWeightKg:    (x, k) => v.num(x, k, { min: 30, max: 300, optional: true }),
  workoutsPerWeek: (x, k) => v.num(x, k, { min: 1, max: 7, int: true }),
  waterTargetMl:   (x, k) => v.num(x, k, { min: 500, max: 8000, int: true }),
  weightUnit:      enumField('weightUnit'),
  energyUnit:      enumField('energyUnit'),
  language:        enumField('language'),
  timezone:        (x, k) => (isValidTimezone(x) ? x : v.invalid('Unknown timezone', k)),
  weekStartsOn:    (x, k) => v.num(x, k, { min: 1, max: 7, int: true }),
  defaultRestSec:  (x, k) => v.num(x, k, { min: 15, max: 900, int: true }),
  quietStart:      (x, k) => v.time(x, k),
  quietEnd:        (x, k) => v.time(x, k),
};

const TARGET_SPEC = {
  kcalTarget:     (x, k) => v.num(x, k, { min: 800, max: 8000, int: true }),
  proteinTargetG: (x, k) => v.num(x, k, { min: 0, max: 500, int: true }),
  carbsTargetG:   (x, k) => v.num(x, k, { min: 0, max: 1000, int: true }),
  fatTargetG:     (x, k) => v.num(x, k, { min: 0, max: 400, int: true }),
};

const PROFILE_KEYS_FOR_TARGETS = ['sex', 'birthDate', 'heightCm', 'activityLevel', 'goal'];

// Applies a settings patch from the Mini App. Setting any target by hand switches
// the user to manual targets; `targetsManual: false` goes back to the formula.
export async function updateUser(userId, input) {
  const p = v.patch(input, { ...PROFILE_SPEC, ...TARGET_SPEC, targetsManual: (x, k) => v.bool(x, k) });
  if (Object.keys(TARGET_SPEC).some((k) => k in p) && !('targetsManual' in p)) p.targetsManual = true;

  await db.update(T.users).set({ ...p, updatedAt: new Date() }).where(eq(T.users.id, userId));
  const user = await getUser(userId);

  const affectsTargets = 'targetsManual' in p || PROFILE_KEYS_FOR_TARGETS.some((k) => k in p);
  return affectsTargets ? refreshTargets(user) : user;
}

// Recomputes formula targets from the profile and latest weigh-in. Called on profile
// changes and onboarding only — not on every weigh-in, so targets don't jitter daily.
export async function refreshTargets(user) {
  if (user.targetsManual) return user;
  const weightKg = await latestWeightKg(user.id);
  const t = computeTargets({ ...user, weightKg }, today(user));
  if (!t) return user;
  if (Object.keys(t).every((k) => user[k] === t[k])) return user;
  await db.update(T.users).set({ ...t, updatedAt: new Date() }).where(eq(T.users.id, user.id));
  return { ...user, ...t };
}

export async function markOnboarded(userId) {
  await db.update(T.users).set({ onboardedAt: new Date(), updatedAt: new Date() }).where(eq(T.users.id, userId));
}

export async function setBotState(userId, state) {
  await db.update(T.users).set({ botState: state ?? null }).where(eq(T.users.id, userId));
}

// Every table that holds per-user rows. Children first — there are no cascades.
const USER_TABLES = [
  T.personalRecords, T.sets, T.workoutExercises, T.workouts,
  T.schedule, T.routineExercises, T.routines,
  T.foodLogs, T.waterLogs, T.favoriteFoods, T.recipeItems,
  T.bodyWeights, T.bodyMeasurements, T.progressPhotos, T.reminders,
  T.foods, T.exercises,   // only the user's own rows; shared catalogue rows have user_id 0
];

export async function deleteAllData(userId) {
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('deleteAllData: bad user id');
  for (const t of USER_TABLES) {
    await db.delete(t).where(eq(t.userId, userId)).run();
  }
  await db.delete(T.users).where(eq(T.users.id, userId)).run();
}
