import { db } from 'sdk';
import { eq, and, inArray, isNull, isNotNull, asc, gte, lte } from 'sdk/db';
import * as T from '../schema.js';
import * as v from './validate.js';
import { own, visible } from './db-util.js';
import { today } from './users.js';
import { weekday, weekStart, addDays } from './dates.js';

const R = T.routines, RE = T.routineExercises, SCH = T.schedule;
const SECONDS_PER_SET = 40;   // time under load + setup, for the duration estimate

async function itemsFor(userId, routineIds) {
  if (!routineIds.length) return [];
  const items = await db.select().from(RE)
    .where(and(eq(RE.userId, userId), inArray(RE.routineId, routineIds)))
    .orderBy(asc(RE.position), asc(RE.id)).all();
  const exIds = [...new Set(items.map((i) => i.exerciseId))];
  const exs = exIds.length ? await db.select().from(T.exercises).where(inArray(T.exercises.id, exIds)).all() : [];
  const byId = new Map(exs.map((e) => [e.id, e]));
  return items.map((i) => {
    const e = byId.get(i.exerciseId);
    return { ...i, exercise: e ? { id: e.id, name: e.name, muscle: e.muscle, trackType: e.trackType, archived: !!e.archivedAt } : null };
  });
}

function decorate(routine, items, user) {
  const sets = items.reduce((a, i) => a + i.targetSets, 0);
  const seconds = items.reduce((a, i) => a + i.targetSets * (SECONDS_PER_SET + (i.restSec ?? user.defaultRestSec)), 0);
  const muscles = [...new Set(items.map((i) => i.exercise?.muscle).filter(Boolean))];
  return { ...routine, items, exerciseCount: items.length, setCount: sets, estMinutes: Math.max(5, Math.round(seconds / 60 / 5) * 5), muscles };
}

export async function getRoutine(user, input) {
  const routine = await own(R, v.id(input.id), user.id, 'Routine');
  return { routine: decorate(routine, await itemsFor(user.id, [routine.id]), user) };
}

// The routine planned for a date by the weekly schedule, or null (rest / unplanned).
export async function routineForDate(user, date) {
  const row = await db.select().from(SCH).where(and(eq(SCH.userId, user.id), eq(SCH.weekday, weekday(date)))).get();
  if (!row || !row.routineId) return null;
  const routine = await db.select().from(R).where(and(eq(R.id, row.routineId), isNull(R.archivedAt))).get();
  return routine ? decorate(routine, await itemsFor(user.id, [routine.id]), user) : null;
}

export async function listRoutines(user) {
  const routines = await db.select().from(R)
    .where(and(eq(R.userId, user.id), isNull(R.archivedAt)))
    .orderBy(asc(R.position), asc(R.id)).all();
  const items = await itemsFor(user.id, routines.map((r) => r.id));

  // This week's plan with what's already done.
  const t = today(user);
  const from = weekStart(t, user.weekStartsOn);
  const plan = await db.select().from(SCH).where(eq(SCH.userId, user.id)).all();
  const done = await db.select({ localDate: T.workouts.localDate }).from(T.workouts)
    .where(and(eq(T.workouts.userId, user.id), isNotNull(T.workouts.endedAt), gte(T.workouts.localDate, from), lte(T.workouts.localDate, addDays(from, 6))))
    .all();
  const doneDates = new Set(done.map((d) => d.localDate));
  const names = new Map(routines.map((r) => [r.id, r.name]));
  const week = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(from, i);
    const p = plan.find((x) => x.weekday === weekday(date));
    const routineId = p && names.has(p.routineId) ? p.routineId : null;
    week.push({ date, weekday: weekday(date), routineId, routineName: routineId ? names.get(routineId) : null, done: doneDates.has(date), isToday: date === t });
  }

  return {
    routines: routines.map((r) => decorate(r, items.filter((i) => i.routineId === r.id), user)),
    week,
  };
}

const ITEM_SPEC = {
  id:                (x, k) => v.id(x, k),
  exerciseId:        (x, k) => v.id(x, k),
  targetSets:        (x, k) => v.num(x, k, { min: 1, max: 20, int: true }),
  targetRepsMin:     (x, k) => v.num(x, k, { min: 1, max: 100, int: true, optional: true }),
  targetRepsMax:     (x, k) => v.num(x, k, { min: 1, max: 100, int: true, optional: true }),
  targetWeightKg:    (x, k) => v.num(x, k, { min: 0, max: 1000, optional: true }),
  targetDurationSec: (x, k) => v.num(x, k, { min: 1, max: 86400, int: true, optional: true }),
  restSec:           (x, k) => v.num(x, k, { min: 0, max: 900, int: true, optional: true }),
  supersetGroup:     (x, k) => v.num(x, k, { min: 1, max: 20, int: true, optional: true }),
  autoProgress:      (x, k) => v.bool(x, k),
  incrementKg:       (x, k) => v.num(x, k, { min: 0, max: 20, optional: true }),
  notes:             (x, k) => v.str(x, k, { max: 500, optional: true }),
};

function cleanItem(x, field) {
  const p = v.patch(x, ITEM_SPEC);
  if (!p.exerciseId) v.invalid(`${field}.exerciseId is required`, `${field}.exerciseId`);
  if (p.targetRepsMin && !p.targetRepsMax) p.targetRepsMax = p.targetRepsMin;
  if (p.targetRepsMax && !p.targetRepsMin) p.targetRepsMin = p.targetRepsMax;
  if (p.targetRepsMin > p.targetRepsMax) v.invalid('Rep range minimum is above maximum', `${field}.targetRepsMin`);
  return { targetSets: 3, ...p };
}

// Create (no id) or update a routine. `items`, when given, is the full ordered list:
// items with an id are updated, new ones inserted, missing ones removed.
export async function saveRoutine(user, input) {
  const id = v.id(input.id, 'id', { optional: true });
  const name = v.str(input.name, 'name', { max: 60, optional: !!id });
  const notes = input.notes === undefined ? undefined : v.str(input.notes, 'notes', { max: 1000, optional: true });
  const items = input.items === undefined ? undefined : v.list(input.items, 'items', cleanItem, { max: 30 });

  if (items) for (const it of items) await visible(T.exercises, it.exerciseId, user.id, 'Exercise');

  let routineId = id;
  if (id) {
    await own(R, id, user.id, 'Routine');
    const set = { updatedAt: new Date() };
    if (name) set.name = name;
    if (notes !== undefined) set.notes = notes;
    await db.update(R).set(set).where(eq(R.id, id)).run();
  } else {
    const count = await db.$count(R, and(eq(R.userId, user.id), isNull(R.archivedAt)));
    const [row] = await db.insert(R).values({ userId: user.id, name, notes: notes ?? null, position: count }).returning();
    routineId = row.id;
  }

  if (items) {
    const existing = await db.select({ id: RE.id }).from(RE).where(and(eq(RE.routineId, routineId), eq(RE.userId, user.id))).all();
    const keep = new Set();
    for (const [position, it] of items.entries()) {
      const { id: itemId, ...fields } = it;
      if (itemId && existing.some((e) => e.id === itemId)) {
        keep.add(itemId);
        await db.update(RE).set({ ...fields, position }).where(eq(RE.id, itemId)).run();
      } else {
        await db.insert(RE).values({ ...fields, position, routineId, userId: user.id }).run();
      }
    }
    for (const e of existing) {
      if (!keep.has(e.id)) await db.delete(RE).where(eq(RE.id, e.id)).run();
    }
  }
  return getRoutine(user, { id: routineId });
}

export async function archiveRoutine(user, input) {
  const id = v.id(input.id);
  await own(R, id, user.id, 'Routine');
  await db.update(R).set({ archivedAt: new Date() }).where(eq(R.id, id)).run();
  await db.update(SCH).set({ routineId: null }).where(and(eq(SCH.userId, user.id), eq(SCH.routineId, id))).run();
  return { ok: true };
}

// days: [{ weekday: 1–7, routineId | null }] — replaces the whole weekly plan.
export async function saveSchedule(user, input) {
  const days = v.list(input.days, 'days', (d, k) => v.patch(d, {
    weekday:   (x, kk) => v.num(x, kk, { min: 1, max: 7, int: true }),
    routineId: (x, kk) => v.id(x, kk, { optional: true }),
  }), { max: 7 });
  const seen = new Set();
  for (const d of days) {
    if (seen.has(d.weekday)) v.invalid('Each weekday can appear once', 'days');
    seen.add(d.weekday);
    if (d.routineId) await own(R, d.routineId, user.id, 'Routine');
  }
  await db.delete(SCH).where(eq(SCH.userId, user.id)).run();
  if (days.length) await db.insert(SCH).values(days.map((d) => ({ userId: user.id, weekday: d.weekday, routineId: d.routineId ?? null }))).run();
  return listRoutines(user);
}
