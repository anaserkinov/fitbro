# FitPro — Mini App endpoints

Call with `Telegram.WebApp.Serverless.call(name, input, (err, result) => …)`.
Each endpoint is `tgcloud/endpoints/<name>.js`, a thin wrapper over a `tgcloud/lib/` function.

**Conventions** — weights in **kg**, energy in **kcal**, lengths in cm, distance in m;
dates `YYYY-MM-DD` in the user's timezone (omit `date` = today); instants are ISO strings.
The app converts to the user's `weightUnit` / `energyUnit` for display.

**Errors** — `err.type === 'ENDPOINT_ERROR'` with `err.parameters.code`:
`INVALID_INPUT` (+ `field`), `NOT_FOUND`, `NOT_ONBOARDED`, `WORKOUT_IN_PROGRESS`,
`ALREADY_FINISHED`, `CONFIRM_REQUIRED`, `FORBIDDEN`. Unknown input keys are rejected.

★ = needs a finished onboarding.

## Account & settings

| Endpoint | Input | Returns |
|---|---|---|
| `getMe` | — | `{ user, onboarded, activeWorkoutId }` |
| `completeOnboarding` | `sex, birthDate, heightCm, weightKg, activityLevel, goal` + optional `goalWeightKg, timezone, trainingSplit, workoutsPerWeek, weightUnit, energyUnit, …` | same as `getMe` |
| `getSettings` | — | `{ user, reminders }` |
| `updateSettings` | any of: profile fields, `kcalTarget, proteinTargetG, carbsTargetG, fatTargetG` (switches to manual), `targetsManual: false` (back to formula), `weightUnit, energyUnit, timezone, weekStartsOn, defaultRestSec, quietStart, quietEnd, waterTargetMl, workoutsPerWeek, goalWeightKg` | `{ user, reminders }` |
| `updateReminder` | `type` + any of `enabled, times: ['HH:MM'], weekdays: [1–7], params: { days }` | `{ reminder }` |
| `deleteMyData` | `{ confirm: 'DELETE' }` | `{ deleted: true }` |

## Dashboard & progress

| Endpoint | Input | Returns |
|---|---|---|
| `getToday` ★ | `date?` | targets, eaten, burnedKcal, remainingKcal, water, weight (latest, weekChangeKg, sparkline), plan, workoutsToday, activeWorkout, week (workouts/target, volumeKg, avgKcal), streakDays |
| `getConsistency` ★ | `month?: 'YYYY-MM'` | days with workouts (+ PRs), workoutCount, avgDurationSec, streakDays |
| `getMuscleVolume` ★ | `date?` (any day of the week) | `{ from, to, muscles: [{ muscle, sets }] }` |
| `getExerciseHistory` | `exerciseId, weeks?` (default 12) | `{ exercise, series, sessions, records }` |

## Exercises & routines

| Endpoint | Input | Returns |
|---|---|---|
| `listExercises` | `muscle?, q?` (name or alias) | `{ exercises }` with `custom, lastUsedAt, timesUsed` |
| `saveExercise` | no `id` = create (`name, muscle, trackType`, …); `id` = edit own | `{ exercise }` |
| `archiveExercise` | `id` | `{ ok }` |
| `listRoutines` | — | `{ routines (items, exerciseCount, setCount, estMinutes, muscles), week }` |
| `getRoutine` | `id` | `{ routine }` |
| `saveRoutine` | `id?, name, notes?, items?: [{ id?, exerciseId, targetSets, targetRepsMin, targetRepsMax, targetWeightKg, targetDurationSec, restSec, supersetGroup, autoProgress, incrementKg, notes }]` (full ordered list) | `{ routine }` |
| `archiveRoutine` | `id` | `{ ok }` |
| `saveSchedule` | `days: [{ weekday: 1–7, routineId \| null }]` (replaces the week) | same as `listRoutines` |

## Live workout

| Endpoint | Input | Returns |
|---|---|---|
| `startWorkout` | `routineId?, name?, date?` | workout detail (below) |
| `getWorkout` | `id?` (omit = the open one) | `{ workout, exercises: [{ exercise, target, sets, previous, restSec, bestWeightKg }], totals }` or `{ workout: null }` |
| `addWorkoutExercise` | `workoutId, exerciseId, sets?` | workout detail |
| `updateWorkoutExercise` | `id` + `restSec?, supersetGroup?, notes?, position?` | workout detail |
| `removeWorkoutExercise` | `id` | workout detail |
| `addSet` | `workoutExerciseId, setType?` | `{ set }` (copies the last set) |
| `updateSet` | `id` + any of `weightKg, reps, durationSec, distanceM, kcal, rpe, rir, setType, completed` | `{ set, prs, restEndsAt }` — `prs` = records just broken |
| `deleteSet` | `id` | `{ ok }` |
| `setRest` | `workoutId, seconds` (0 = clear) | `{ restEndsAt }` |
| `finishWorkout` | `id, notes?` | `{ workout, totals, prs, progression }` or `{ discarded: true }` if nothing was done |
| `discardWorkout` | `id` | `{ ok }` |
| `listWorkouts` | `from, to` | `{ workouts }` (finished, newest first, with `prs`) |

## Food & water

| Endpoint | Input | Returns |
|---|---|---|
| `getFoodDay` | `date?` | `{ date, meals: [{ meal, items, totals }], totals, targets, water }` |
| `searchFoods` | `q?` (none = `{ recent, favorites }`) | `{ results }` |
| `getFood` | `id` | `{ food, items }` (items for recipes) |
| `lookupBarcode` | `barcode` | `{ food }` or `{ food: null }` |
| `logFood` | `meal, date?` + `foodId, quantity, unit: g\|ml\|serving` **or** `quickAdd: { name?, kcal, proteinG?, carbsG?, fatG? }` | `{ log, day }` |
| `updateFoodLog` | `id` + `quantity?, unit?, meal?, date?` (quick adds: also `kcal, proteinG, …`) | `{ log, day }` |
| `deleteFoodLog` | `id` | `{ day }` |
| `copyFood` | `fromDate, toDate?, meal?, toMeal?` | `{ copied, day }` |
| `saveFood` | custom food: `id?, name, baseUnit, kcalPer100, proteinPer100, carbsPer100, fatPer100, brand?, barcode?, servingLabel?, servingGrams?, …` | `{ food, items }` |
| `saveRecipe` | `id?, name, items: [{ foodId, grams }], servingLabel?, servingGrams?` | `{ food, items }` |
| `archiveFood` | `id` | `{ ok }` |
| `setFavoriteFood` | `foodId, favorite` | `{ foodId, favorite }` |
| `logWater` / `undoWater` | `amountMl` / — (`date?`) | `{ date, totalMl, targetMl }` |

## Body

| Endpoint | Input | Returns |
|---|---|---|
| `getBody` | `days?` (default 30) | `{ weight, measurements, photos }` |
| `logWeight` | `weightKg, date?, note?` (one per day) | `{ weight }` — latest, avg7Kg, weekChangeKg, ratePerWeekKg, projectedGoalDate, series |
| `deleteWeight` | `date` | `{ weight }` |
| `logMeasurements` | `date?` + any of `waistCm, chestCm, armsCm, thighsCm, hipsCm, neckCm, bodyFatPct` | `{ measurements }` (latest, previous, deltas) |
| `uploadPhoto` | `imageBase64` (JPEG/PNG, data URL ok, ≤ 10 MB), `pose?, date?` | `{ photo }` |
| `getPhoto` | `id` | `{ photo, mime, imageBase64 }` |
| `deletePhoto` | `id` | `{ ok }` |

## System

| Endpoint | Who | What |
|---|---|---|
| `tick` | ids in `lib/config.js` → `SCHEDULER_USER_IDS` | sends due reminders + rest-over pings; call every minute |
| `adminSeed` | `ADMIN_USER_IDS` | adds any new built-in exercises/foods |
