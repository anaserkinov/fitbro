// Every Mini App call, by name. The app reaches them all through one endpoint,
// endpoints/api.js, because the platform caps the number of modules per app; one
// file per call would put us over it. Same contract as before: `call(name, input)` in
// src/lib/api.js, and docs/endpoints.md lists the names. tick and adminSeed stay
// separate endpoints (the scheduler and admins call them by name).

import { endpoint } from './endpoint.js';
import { completeOnboarding, deleteMyData, getMe, getSettings, updateReminder, updateSettings } from './account.js';
import { getAchievements } from './achievements.js';
import { getGroupFeed, react } from './activity.js';
import { deletePhoto, deleteWeight, getBody, getPhoto, logMeasurements, logWeight, uploadPhoto } from './body.js';
import { createChallenge, deleteChallenge, listChallenges } from './challenges.js';
import { archiveExercise, getExerciseHistory, listExercises, saveExercise } from './exercises.js';
import { exportData } from './export.js';
import { archiveFood, browseFoods, copyFood, deleteFoodLog, getFood, getFoodDay, logFood, logWater, lookupBarcode, makeOwnFood, saveFood, saveRecipe, searchFoods, setFavoriteFood, undoWater, updateFoodLog } from './food.js';
import { createGroup, joinGroup, leaveGroup, listGroups, previewGroup, removeMember, resetInvite, updateGroup, updateMembership } from './groups.js';
import { getGroup } from './leaderboard.js';
import { enrollProgram, getMyProgram, leaveProgram, listPrograms } from './programs.js';
import { archiveRoutine, copyRoutine, getRoutine, listMemberRoutines, listRoutines, saveRoutine, saveSchedule } from './routines.js';
import { prepareShare } from './share.js';
import { getConsistency, getMuscleVolume, getToday } from './stats.js';
import { addSet, addWorkoutExercise, deleteSet, discardWorkout, finishWorkout, getWorkout, listWorkouts, removeWorkoutExercise, setRest, startWorkout, updateSet, updateWorkoutExercise } from './workouts.js';

const ONBOARDED = { onboarded: true };

export const ROUTES = {
  addSet: endpoint(addSet),
  addWorkoutExercise: endpoint(addWorkoutExercise),
  archiveExercise: endpoint(archiveExercise),
  archiveFood: endpoint(archiveFood),
  archiveRoutine: endpoint(archiveRoutine),
  browseFoods: endpoint(browseFoods),
  completeOnboarding: endpoint(completeOnboarding),
  copyFood: endpoint(copyFood),
  copyRoutine: endpoint(copyRoutine, ONBOARDED),
  createChallenge: endpoint(createChallenge, ONBOARDED),
  createGroup: endpoint(createGroup, ONBOARDED),
  deleteChallenge: endpoint(deleteChallenge, ONBOARDED),
  deleteFoodLog: endpoint(deleteFoodLog),
  deleteMyData: endpoint(deleteMyData),
  deletePhoto: endpoint(deletePhoto),
  deleteSet: endpoint(deleteSet),
  deleteWeight: endpoint(deleteWeight),
  discardWorkout: endpoint(discardWorkout),
  enrollProgram: endpoint(enrollProgram, ONBOARDED),
  exportData: endpoint(exportData, ONBOARDED),
  finishWorkout: endpoint(finishWorkout),
  getAchievements: endpoint(getAchievements, ONBOARDED),
  getBody: endpoint(getBody),
  getConsistency: endpoint(getConsistency, ONBOARDED),
  getExerciseHistory: endpoint(getExerciseHistory),
  getFood: endpoint(getFood),
  getFoodDay: endpoint(getFoodDay),
  getGroup: endpoint(getGroup, ONBOARDED),
  getGroupFeed: endpoint(getGroupFeed, ONBOARDED),
  getMe: endpoint(getMe),
  getMuscleVolume: endpoint(getMuscleVolume, ONBOARDED),
  getMyProgram: endpoint(getMyProgram, ONBOARDED),
  getPhoto: endpoint(getPhoto),
  getRoutine: endpoint(getRoutine),
  getSettings: endpoint(getSettings),
  getToday: endpoint(getToday, ONBOARDED),
  getWorkout: endpoint(getWorkout),
  joinGroup: endpoint(joinGroup, ONBOARDED),
  leaveGroup: endpoint(leaveGroup, ONBOARDED),
  leaveProgram: endpoint(leaveProgram, ONBOARDED),
  listChallenges: endpoint(listChallenges, ONBOARDED),
  listExercises: endpoint(listExercises),
  listGroups: endpoint(listGroups, ONBOARDED),
  listMemberRoutines: endpoint(listMemberRoutines, ONBOARDED),
  listPrograms: endpoint(listPrograms, ONBOARDED),
  listRoutines: endpoint(listRoutines),
  listWorkouts: endpoint(listWorkouts),
  logFood: endpoint(logFood),
  logMeasurements: endpoint(logMeasurements),
  logWater: endpoint(logWater),
  logWeight: endpoint(logWeight),
  lookupBarcode: endpoint(lookupBarcode),
  makeOwnFood: endpoint(makeOwnFood),
  prepareShare: endpoint(prepareShare, ONBOARDED),
  previewGroup: endpoint(previewGroup, ONBOARDED),
  react: endpoint(react, ONBOARDED),
  removeMember: endpoint(removeMember, ONBOARDED),
  removeWorkoutExercise: endpoint(removeWorkoutExercise),
  resetInvite: endpoint(resetInvite, ONBOARDED),
  saveExercise: endpoint(saveExercise),
  saveFood: endpoint(saveFood),
  saveRecipe: endpoint(saveRecipe),
  saveRoutine: endpoint(saveRoutine),
  saveSchedule: endpoint(saveSchedule),
  searchFoods: endpoint(searchFoods),
  setFavoriteFood: endpoint(setFavoriteFood),
  setRest: endpoint(setRest),
  startWorkout: endpoint(startWorkout),
  undoWater: endpoint(undoWater),
  updateFoodLog: endpoint(updateFoodLog),
  updateGroup: endpoint(updateGroup, ONBOARDED),
  updateMembership: endpoint(updateMembership, ONBOARDED),
  updateReminder: endpoint(updateReminder),
  updateSet: endpoint(updateSet),
  updateSettings: endpoint(updateSettings),
  updateWorkoutExercise: endpoint(updateWorkoutExercise),
  uploadPhoto: endpoint(uploadPhoto),
};
