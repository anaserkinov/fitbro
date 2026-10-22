import { call, mutate, AFFECTS } from './api.js';
import { confirmDialog, haptic } from './tg.js';
import { toastError } from '../ui/kit.jsx';

// Starts a workout (from a routine, or empty) and opens it. If one is already
// running, offers to continue that one instead.
export async function startOrResume(nav, routineId) {
  haptic.tap();
  try {
    const w = await mutate('startWorkout', routineId ? { routineId } : {}, AFFECTS.workout);
    nav.push('Workout', { id: w.workout.id });
  } catch (e) {
    if (e.code !== 'WORKOUT_IN_PROGRESS') return toastError(e);
    const active = await call('getWorkout', {});
    if (active.workout && (await confirmDialog(`“${active.workout.name}” is still in progress. Continue it?`))) {
      nav.push('Workout', { id: active.workout.id });
    }
  }
  return undefined;
}
