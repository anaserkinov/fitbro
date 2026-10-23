import { db } from 'sdk';
import { eq, and, or, inArray, isNull, isNotNull, asc, desc, sql } from 'sdk/db';
import * as T from '../schema.js';
import * as v from './validate.js';
import { own, visible } from './db-util.js';
import { today } from './users.js';
import { gramsFor, nutrientsFor, sumNutrients, recipePer100 } from './nutrition.js';
import { lookupBarcode as offLookup, cleanBarcode } from './openfoodfacts.js';
import { catalogName, catalogSearch } from './i18n/catalog.js';
import { FOOD_CATEGORIES, BUILTIN_FOOD_CATEGORY } from './data/foods.js';

const F = T.foods, FL = T.foodLogs, WL = T.waterLogs, FAV = T.favoriteFoods, RI = T.recipeItems;
// In order of the day. 'snack' is the evening one (it predates the other two).
export const MEALS = ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'snack'];

export function targetsOf(user) {
  return { kcal: user.kcalTarget, proteinG: user.proteinTargetG, carbsG: user.carbsTargetG, fatG: user.fatTargetG };
}

export async function waterTotal(userId, date) {
  const r = await db.select({ ml: sql`coalesce(sum(${WL.amountMl}), 0)` }).from(WL)
    .where(and(eq(WL.userId, userId), eq(WL.localDate, date))).get();
  return Number(r ? r.ml : 0);
}

export async function dayLogs(userId, date) {
  return db.select().from(FL).where(and(eq(FL.userId, userId), eq(FL.localDate, date)))
    .orderBy(asc(FL.loggedAt), asc(FL.id)).all();
}

export async function getFoodDay(user, input = {}) {
  const date = v.date(input.date, 'date', { optional: true }) ?? today(user);
  const logs = await dayLogs(user.id, date);
  return {
    date,
    meals: MEALS.map((meal) => {
      const items = logs.filter((l) => l.meal === meal);
      return { meal, items, totals: sumNutrients(items) };
    }),
    totals: sumNutrients(logs),
    targets: targetsOf(user),
    water: { totalMl: await waterTotal(user.id, date), targetMl: user.waterTargetMl },
  };
}

async function favoriteIds(userId) {
  const rows = await db.select({ foodId: FAV.foodId }).from(FAV).where(eq(FAV.userId, userId)).all();
  return new Set(rows.map((r) => r.foodId));
}

const SOURCE_RANK = { custom: 0, recipe: 0, builtin: 1, off: 2 };

// No query: recent and favourite foods. With a query: name matches, the user's own
// foods first, then names that start with the query, then shorter names.
// Browse groups: the built-in categories plus the user's own foods and recipes.
export const BROWSE = ['mine', 'recipes', ...FOOD_CATEGORIES];

const categoryOf = (f) => (f.source === 'builtin' ? BUILTIN_FOOD_CATEGORY[f.name] ?? null : null);

function inGroup(f, group) {
  if (group === 'mine') return f.source === 'custom';
  if (group === 'recipes') return f.source === 'recipe';
  return categoryOf(f) === group;
}

const browseGroup = (x, k) => (BROWSE.includes(x) ? x : v.invalid(`${k} must be one of: ${BROWSE.join(', ')}`, k));

// Every food in one group, by name in the user's language.
export async function browseFoods(user, input = {}) {
  const group = browseGroup(input.category, 'category');
  const favs = await favoriteIds(user.id);
  const live = isNull(F.archivedAt);
  const where = group === 'mine' ? and(live, eq(F.userId, user.id), eq(F.source, 'custom'))
    : group === 'recipes' ? and(live, eq(F.userId, user.id), eq(F.source, 'recipe'))
    : and(live, eq(F.userId, 0), eq(F.source, 'builtin'), inArray(F.name, Object.keys(BUILTIN_FOOD_CATEGORY).filter((n) => BUILTIN_FOOD_CATEGORY[n] === group)));
  const shown = (f) => (f.source === 'builtin' ? catalogName(user.language, f.name) : f.name);
  const rows = (await db.select().from(F).where(where).all())
    .sort((a, b) => shown(a).localeCompare(shown(b), user.language));
  return { category: group, foods: rows.map((f) => ({ ...f, category: categoryOf(f), favorite: favs.has(f.id), custom: f.userId !== 0 })) };
}

export async function searchFoods(user, input = {}) {
  const q = v.str(input.q, 'q', { max: 60, optional: true });
  const group = input.category == null ? null : browseGroup(input.category, 'category');
  const favs = await favoriteIds(user.id);
  const mark = (f) => ({ ...f, category: categoryOf(f), favorite: favs.has(f.id), custom: f.userId !== 0 });
  const live = and(inArray(F.userId, [0, user.id]), isNull(F.archivedAt));

  if (!q) {
    const recent = (await db.select({ foodId: FL.foodId, last: sql`max(${FL.loggedAt})` }).from(FL)
      .where(and(eq(FL.userId, user.id), isNotNull(FL.foodId))).groupBy(FL.foodId).all())
      .sort((a, b) => b.last - a.last).slice(0, 20);
    const ids = [...new Set([...recent.map((r) => r.foodId), ...favs])];
    const foods = ids.length ? await db.select().from(F).where(and(live, inArray(F.id, ids))).all() : [];
    const byId = new Map(foods.map((f) => [f.id, f]));
    return {
      recent: recent.map((r) => byId.get(r.foodId)).filter(Boolean).map(mark),
      favorites: [...favs].map((id) => byId.get(id)).filter(Boolean).map(mark),
    };
  }

  const needle = q.toLowerCase().replace(/[%_]/g, '');
  // Built-in foods also match on their name in the user's language.
  const byName = sql`lower(${F.name}) LIKE ${'%' + needle + '%'}`;
  const translated = catalogSearch(user.language, needle);
  const match = translated.length ? or(byName, and(eq(F.source, 'builtin'), inArray(F.name, translated))) : byName;
  const rows = await db.select().from(F).where(and(live, match)).limit(200).all();
  const shown = (f) => (f.source === 'builtin' ? catalogName(user.language, f.name) : f.name).toLowerCase();
  const score = (f) => [SOURCE_RANK[f.source] ?? 3, shown(f).startsWith(needle) ? 0 : 1, shown(f).length];
  rows.sort((a, b) => {
    const sa = score(a), sb = score(b);
    return sa[0] - sb[0] || sa[1] - sb[1] || sa[2] - sb[2];
  });
  return { results: rows.filter((f) => !group || inGroup(f, group)).slice(0, 30).map(mark) };
}

export async function getFood(user, input) {
  const food = await visible(F, v.id(input.id), user.id, 'Food');
  const favs = await favoriteIds(user.id);
  let items = null;
  if (food.source === 'recipe') {
    const rows = await db.select().from(RI).where(eq(RI.recipeId, food.id)).orderBy(asc(RI.position)).all();
    const parts = rows.length ? await db.select().from(F).where(inArray(F.id, rows.map((r) => r.foodId))).all() : [];
    const byId = new Map(parts.map((p) => [p.id, p]));
    items = rows.map((r) => ({ ...r, food: byId.get(r.foodId) ?? null }));
  }
  return { food: { ...food, favorite: favs.has(food.id), custom: food.userId !== 0 }, items };
}

// The user's own food with that barcode wins over the shared Open Food Facts cache.
export async function lookupBarcode(user, input) {
  const code = cleanBarcode(input.barcode);
  const mine = await db.select().from(F)
    .where(and(eq(F.userId, user.id), eq(F.barcode, code), isNull(F.archivedAt))).get();
  return { food: mine ?? (await offLookup(code)) };
}

const QUICK_SPEC = {
  name:     (x, k) => v.str(x, k, { max: 80, optional: true }),
  kcal:     (x, k) => v.num(x, k, { min: 0, max: 10000 }),
  proteinG: (x, k) => v.num(x, k, { min: 0, max: 1000, optional: true }),
  carbsG:   (x, k) => v.num(x, k, { min: 0, max: 1000, optional: true }),
  fatG:     (x, k) => v.num(x, k, { min: 0, max: 1000, optional: true }),
};

function displayName(food) {
  return food.brand ? `${food.name} (${food.brand})` : food.name;
}

// Either { foodId, quantity, unit } or { quickAdd: { kcal, proteinG, … } }.
export async function logFood(user, input) {
  const date = v.date(input.date, 'date', { optional: true }) ?? today(user);
  const meal = v.oneOf(input.meal, 'meal');
  let entry;
  if (input.quickAdd) {
    const qa = v.patch(input.quickAdd, QUICK_SPEC);
    entry = { name: qa.name ?? 'Quick add', kcal: qa.kcal, proteinG: qa.proteinG ?? 0, carbsG: qa.carbsG ?? 0, fatG: qa.fatG ?? 0 };
  } else {
    const food = await visible(F, v.id(input.foodId, 'foodId'), user.id, 'Food');
    const quantity = v.num(input.quantity, 'quantity', { min: 0.01, max: 100000 });
    const unit = v.oneOf(input.unit, 'foodUnit', 'unit');
    const grams = gramsFor(food, quantity, unit);
    entry = { foodId: food.id, name: displayName(food), quantity, unit, grams, ...nutrientsFor(food, grams) };
  }
  const [log] = await db.insert(FL).values({ userId: user.id, localDate: date, meal, ...entry }).returning();
  return { log, day: await getFoodDay(user, { date }) };
}

export async function updateFoodLog(user, input) {
  const log = await own(FL, v.id(input.id), user.id, 'Food entry');
  const { id, ...rest } = input;
  const p = v.patch(rest, {
    date:     (x, k) => v.date(x, k),
    meal:     (x, k) => v.oneOf(x, 'meal', k),
    quantity: (x, k) => v.num(x, k, { min: 0.01, max: 100000 }),
    unit:     (x, k) => v.oneOf(x, 'foodUnit', k),
    ...(log.foodId ? {} : QUICK_SPEC),
  });
  const set = {};
  if (p.date) set.localDate = p.date;
  if (p.meal) set.meal = p.meal;
  if (log.foodId && (p.quantity || p.unit)) {
    const food = await db.select().from(F).where(eq(F.id, log.foodId)).get();
    if (!food) v.invalid('The food was removed — delete and re-add this entry', 'foodId');
    const quantity = p.quantity ?? log.quantity;
    const unit = p.unit ?? log.unit;
    const grams = gramsFor(food, quantity, unit);
    Object.assign(set, { quantity, unit, grams, ...nutrientsFor(food, grams) });
  }
  for (const k of Object.keys(QUICK_SPEC)) if (!log.foodId && k in p) set[k] = p[k] ?? 0;
  const [saved] = Object.keys(set).length
    ? await db.update(FL).set(set).where(eq(FL.id, log.id)).returning()
    : [log];
  return { log: saved, day: await getFoodDay(user, { date: saved.localDate }) };
}

export async function deleteFoodLog(user, input) {
  const log = await own(FL, v.id(input.id), user.id, 'Food entry');
  await db.delete(FL).where(eq(FL.id, log.id)).run();
  return { day: await getFoodDay(user, { date: log.localDate }) };
}

// "Copy yesterday": copies entries (all meals, or one) from one day to another.
export async function copyFood(user, input) {
  const fromDate = v.date(input.fromDate, 'fromDate');
  const toDate = v.date(input.toDate, 'toDate', { optional: true }) ?? today(user);
  const meal = v.oneOf(input.meal, 'meal', 'meal', { optional: true });
  const toMeal = v.oneOf(input.toMeal, 'meal', 'toMeal', { optional: true }) ?? meal;
  const src = (await dayLogs(user.id, fromDate)).filter((l) => !meal || l.meal === meal);
  for (const l of src) {
    const { id, loggedAt, ...copy } = l;
    await db.insert(FL).values({ ...copy, localDate: toDate, meal: toMeal ?? l.meal }).run();
  }
  return { copied: src.length, day: await getFoodDay(user, { date: toDate }) };
}

const FOOD_SPEC = {
  id:            (x, k) => v.id(x, k),
  name:          (x, k) => v.str(x, k, { max: 120 }),
  brand:         (x, k) => v.str(x, k, { max: 80, optional: true }),
  barcode:       (x, k) => (x === null || x === '' ? null : cleanBarcode(x)),
  baseUnit:      (x, k) => v.oneOf(x, 'baseUnit', k),
  kcalPer100:    (x, k) => v.num(x, k, { min: 0, max: 1000 }),
  proteinPer100: (x, k) => v.num(x, k, { min: 0, max: 100 }),
  carbsPer100:   (x, k) => v.num(x, k, { min: 0, max: 100 }),
  fatPer100:     (x, k) => v.num(x, k, { min: 0, max: 100 }),
  fiberPer100:   (x, k) => v.num(x, k, { min: 0, max: 100, optional: true }),
  sugarPer100:   (x, k) => v.num(x, k, { min: 0, max: 100, optional: true }),
  servingLabel:  (x, k) => v.str(x, k, { max: 40, optional: true }),
  servingGrams:  (x, k) => v.num(x, k, { min: 0.1, max: 5000, optional: true }),
};

// Create or edit a custom food. Past entries keep their own snapshot.
export async function saveFood(user, input) {
  const p = v.patch(input, FOOD_SPEC);
  const id = p.id;
  delete p.id;
  if (id) {
    const food = await own(F, id, user.id, 'Custom food');
    if (food.source !== 'custom') v.invalid('Edit recipes with saveRecipe', 'id');
    await db.update(F).set({ ...p, updatedAt: new Date() }).where(eq(F.id, id)).run();
    return getFood(user, { id });
  }
  if (!p.name) v.invalid('name is required', 'name');
  if (p.kcalPer100 === undefined) v.invalid('kcalPer100 is required', 'kcalPer100');
  const [row] = await db.insert(F).values({ ...p, userId: user.id, source: 'custom' }).returning();
  return getFood(user, { id: row.id });
}

// A recipe is a food whose per-100 g values come from its ingredients.
export async function saveRecipe(user, input) {
  const id = v.id(input.id, 'id', { optional: true });
  const name = v.str(input.name, 'name', { max: 120, optional: !!id });
  const servingLabel = v.str(input.servingLabel, 'servingLabel', { max: 40, optional: true });
  const servingGrams = v.num(input.servingGrams, 'servingGrams', { min: 1, max: 20000, optional: true });
  const items = v.list(input.items, 'items', (x, k) => v.patch(x, {
    foodId: (y, kk) => v.id(y, kk),
    grams:  (y, kk) => v.num(y, kk, { min: 0.1, max: 20000 }),
  }), { max: 40 });
  if (!items.length) v.invalid('A recipe needs at least one ingredient', 'items');

  const parts = [];
  for (const it of items) {
    const food = await visible(F, it.foodId, user.id, 'Ingredient');
    if (food.id === id) v.invalid('A recipe cannot contain itself', 'items');
    parts.push({ food, grams: it.grams });   // ml ingredients are counted as grams (≈ water density)
  }
  const fields = { ...recipePer100(parts), baseUnit: 'g', updatedAt: new Date() };
  if (name) fields.name = name;
  if (input.servingLabel !== undefined) fields.servingLabel = servingLabel;
  if (input.servingGrams !== undefined) fields.servingGrams = servingGrams;

  let recipeId = id;
  if (id) {
    const food = await own(F, id, user.id, 'Recipe');
    if (food.source !== 'recipe') v.invalid('Not a recipe', 'id');
    await db.update(F).set(fields).where(eq(F.id, id)).run();
    await db.delete(RI).where(eq(RI.recipeId, id)).run();
  } else {
    const [row] = await db.insert(F).values({ ...fields, userId: user.id, source: 'recipe' }).returning();
    recipeId = row.id;
  }
  await db.insert(RI).values(items.map((it, position) => ({ userId: user.id, recipeId, foodId: it.foodId, grams: it.grams, position }))).run();
  return getFood(user, { id: recipeId });
}

export async function archiveFood(user, input) {
  const food = await own(F, v.id(input.id), user.id, 'Custom food');
  await db.update(F).set({ archivedAt: new Date() }).where(eq(F.id, food.id)).run();
  await db.delete(FAV).where(and(eq(FAV.userId, user.id), eq(FAV.foodId, food.id))).run();
  return { ok: true };
}

export async function setFavoriteFood(user, input) {
  const food = await visible(F, v.id(input.foodId, 'foodId'), user.id, 'Food');
  const favorite = v.bool(input.favorite, 'favorite');
  const where = and(eq(FAV.userId, user.id), eq(FAV.foodId, food.id));
  const exists = await db.select({ foodId: FAV.foodId }).from(FAV).where(where).get();
  if (favorite && !exists) await db.insert(FAV).values({ userId: user.id, foodId: food.id }).run();
  if (!favorite && exists) await db.delete(FAV).where(where).run();
  return { foodId: food.id, favorite };
}

export async function logWater(user, input) {
  const date = v.date(input.date, 'date', { optional: true }) ?? today(user);
  const amountMl = v.num(input.amountMl, 'amountMl', { min: 1, max: 5000, int: true });
  await db.insert(WL).values({ userId: user.id, localDate: date, amountMl }).run();
  return { date, totalMl: await waterTotal(user.id, date), targetMl: user.waterTargetMl };
}

// Removes the latest water entry of the day (the "−" button).
export async function undoWater(user, input) {
  const date = v.date(input.date, 'date', { optional: true }) ?? today(user);
  const last = await db.select().from(WL).where(and(eq(WL.userId, user.id), eq(WL.localDate, date)))
    .orderBy(desc(WL.loggedAt), desc(WL.id)).limit(1).get();
  if (last) await db.delete(WL).where(eq(WL.id, last.id)).run();
  return { date, totalMl: await waterTotal(user.id, date), targetMl: user.waterTargetMl };
}

// Per-day kcal totals for days that have any entries, from..to inclusive.
export async function dailyKcal(userId, from, to) {
  const rows = await db.all(sql`
    SELECT local_date AS date, sum(kcal) AS kcal FROM food_logs
    WHERE user_id = ${userId} AND local_date BETWEEN ${from} AND ${to}
    GROUP BY local_date ORDER BY local_date`);
  return rows.map((r) => ({ date: r.date, kcal: Math.round(Number(r.kcal)) }));
}
