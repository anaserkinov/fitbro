import * as T from '../schema.js';
import { db } from 'sdk';
import { eq } from 'sdk/db';
import * as v from './validate.js';
import { refuse } from './endpoint.js';
import { updateUser, refreshTargets, markOnboarded, getUser, deleteAllData, setBotState } from './users.js';
import { logWeight } from './body.js';
import { ensureDefaultReminders, listReminders, updateReminder as saveReminder, rescheduleAll } from './reminders.js';
import { seedCatalog } from './catalog.js';
import { getActiveWorkout } from './workouts.js';
import { languageChanged } from './bot/chat.js';
import { sendInvitePreview } from './bot/friends.js';

// Profile, onboarding and settings — the Mini App's account screens.

export async function getMe(user) {
  const active = await getActiveWorkout(user.id);
  return { user, onboarded: !!user.onboardedAt, activeWorkoutId: active ? active.id : null };
}

const REQUIRED = ['sex', 'birthDate', 'heightCm', 'activityLevel', 'goal', 'weightKg'];

// The setup wizard's final step: profile + first weigh-in → targets, default
// reminders, catalogue. Can be re-run from Settings › Edit profile.
export async function completeOnboarding(user, input) {
  for (const k of REQUIRED) if (input[k] === undefined || input[k] === null || input[k] === '') v.invalid(`${k} is required`, k);
  const { weightKg, ...profile } = input;
  let u = await updateUser(user.id, profile);   // first, so "today" uses the new timezone
  await logWeight(u, { weightKg });
  u = await refreshTargets(u);
  await ensureDefaultReminders(u);
  if (u.timezone !== user.timezone) await rescheduleAll(u);
  if ((await db.$count(T.exercises, eq(T.exercises.userId, 0))) === 0) await seedCatalog();
  if (!u.onboardedAt) await markOnboarded(u.id);
  if (u.botState && u.botState.pendingInvite) await showPendingInvite(await getUser(u.id));
  return getMe(await getUser(u.id));
}

// An invite link opened in chat before setup: show the group now. Never joins by itself.
async function showPendingInvite(user) {
  const { pendingInvite, ...rest } = user.botState;
  await setBotState(user.id, Object.keys(rest).length ? rest : null);
  try {
    await sendInvitePreview(user, user.id, pendingInvite);
  } catch (e) {
    console.warn('invite preview failed', e.description || e.message);
  }
}

export async function getSettings(user) {
  return { user, reminders: await listReminders(user.id) };
}

export async function updateSettings(user, input) {
  const u = await updateUser(user.id, input);
  if (u.timezone !== user.timezone) await rescheduleAll(u);
  // The chat keyboard is in the old language until we send a new one.
  if (u.language !== user.language && u.onboardedAt) await languageChanged(u);
  return getSettings(u);
}

export async function updateReminder(user, input) {
  const { type, ...rest } = input;
  return { reminder: await saveReminder(user, type, rest) };
}

// Needs { confirm: 'DELETE' } so a stray call can't wipe an account.
export async function deleteMyData(user, input) {
  if (input.confirm !== 'DELETE') refuse('Send confirm: "DELETE" to delete all your data', 'CONFIRM_REQUIRED');
  await deleteAllData(user.id);
  return { deleted: true };
}
