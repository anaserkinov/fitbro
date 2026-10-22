import { call, mutate, AFFECTS } from './api.js';
import { confirmDialog, haptic } from './tg.js';
import { toastError } from '../ui/kit.jsx';
import { t } from './i18n.js';

// The server names an empty workout 'Workout'; anything else is the user's own text.
export const workoutName = (name) => (name === 'Workout' ? t('Workout') : name);

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
    if (active.workout && (await confirmDialog(t('“{name}” is still in progress. Continue it?', { name: workoutName(active.workout.name) })))) {
      nav.push('Workout', { id: active.workout.id });
    }
  }
  return undefined;
}
