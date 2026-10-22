import { db } from 'sdk';
import { eq, and, ne, isNotNull } from 'sdk/db';
import * as T from '../schema.js';
import { round } from './units.js';

// Linear progression: when every working set of a routine exercise hit the top of
// its rep range at (or above) the target weight, the target goes up by its increment.
// Runs once when a workout is finished. Returns the changes for the summary message.

export async function applyProgression(userId, workoutId) {
  const W = T.workoutExercises;
  const items = await db.select().from(W)
    .where(and(eq(W.userId, userId), eq(W.workoutId, workoutId), isNotNull(W.routineExerciseId)))
    .all();

  const changes = [];
  for (const we of items) {
    const re = await db.select().from(T.routineExercises)
      .where(and(eq(T.routineExercises.id, we.routineExerciseId), eq(T.routineExercises.userId, userId)))
      .get();
    if (!re || !re.autoProgress || re.targetWeightKg === null || !re.targetRepsMax || !re.incrementKg) continue;

    const done = await db.select().from(T.sets)
      .where(and(eq(T.sets.workoutExerciseId, we.id), eq(T.sets.completed, true), ne(T.sets.setType, 'warmup')))
      .all();
    if (done.length < re.targetSets) continue;

    const hit = done.every((s) => (s.weightKg ?? 0) >= re.targetWeightKg - 0.001 && (s.reps ?? 0) >= re.targetRepsMax);
    if (!hit) continue;

    const next = round(re.targetWeightKg + re.incrementKg, 2);
    await db.update(T.routineExercises).set({ targetWeightKg: next }).where(eq(T.routineExercises.id, re.id)).run();
    changes.push({ routineExerciseId: re.id, exerciseId: re.exerciseId, fromKg: re.targetWeightKg, toKg: next });
  }
  return changes;
}
