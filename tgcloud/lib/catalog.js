import { db } from 'sdk';
import { eq, and, inArray, isNull } from 'sdk/db';
import * as T from '../schema.js';
import { BUILTIN_EXERCISES } from './data/exercises.js';
import { BUILTIN_FOODS, RETIRED_FOODS } from './data/foods.js';
import { insertChunked } from './db-util.js';

// Inserts any built-in exercise or food that isn't in the database yet (matched by
// name, case-insensitive), and archives retired built-in foods. Safe to run
// repeatedly; existing rows are otherwise never changed.

async function existingNames(table, where) {
  const rows = await db.select({ name: table.name }).from(table).where(where).all();
  return new Set(rows.map((r) => r.name.toLowerCase()));
}

export async function seedCatalog() {
  const haveEx = await existingNames(T.exercises, eq(T.exercises.userId, 0));
  const newEx = BUILTIN_EXERCISES.filter((e) => !haveEx.has(e.name.toLowerCase())).map((e) => ({ ...e, userId: 0 }));
  await insertChunked(T.exercises, newEx);

  const haveFood = await existingNames(T.foods, and(eq(T.foods.userId, 0), eq(T.foods.source, 'builtin')));
  const newFood = BUILTIN_FOODS.filter((f) => !haveFood.has(f.name.toLowerCase())).map((f) => ({ ...f, userId: 0, source: 'builtin' }));
  await insertChunked(T.foods, newFood);
  await db.update(T.foods).set({ archivedAt: new Date() })
    .where(and(eq(T.foods.userId, 0), eq(T.foods.source, 'builtin'), isNull(T.foods.archivedAt), inArray(T.foods.name, RETIRED_FOODS))).run();

  return { exercisesAdded: newEx.length, foodsAdded: newFood.length };
}
