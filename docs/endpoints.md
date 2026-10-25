# FitBro — Mini App endpoints

Call with `call(name, input)` from `src/lib/api.js`. Every call goes to the single
`api` endpoint — `Telegram.WebApp.Serverless.call('api', { fn: name, input }, …)` — because
the platform caps the number of modules per app. `tgcloud/lib/api-routes.js` maps each
name to a `tgcloud/lib/` function; only `tick` and `adminSeed` are separate endpoints.
An unknown name → `UNKNOWN_CALL`.

**Conventions** — weights in **kg**, energy in **kcal**, lengths in cm, distance in m;
dates `YYYY-MM-DD` in the user's timezone (omit `date` = today); instants are ISO strings.
The app converts to the user's `weightUnit` / `energyUnit` for display.

**Errors** — `err.type === 'ENDPOINT_ERROR'` with `err.parameters.code`:
`INVALID_INPUT` (+ `field`), `NOT_FOUND`, `NOT_ONBOARDED`, `WORKOUT_IN_PROGRESS`,
`ALREADY_FINISHED`, `CONFIRM_REQUIRED`, `FORBIDDEN` (more under *Friends*). Unknown input keys are rejected.

★ = needs a finished onboarding.

## Account & settings

| Endpoint | Input | Returns |
|---|---|---|
| `getMe` | — | `{ user, onboarded, activeWorkoutId }` |
| `completeOnboarding` | `sex, birthDate, heightCm, weightKg, activityLevel, goal` + optional `goalWeightKg, timezone, trainingSplit, workoutsPerWeek, weightUnit, energyUnit, …` | same as `getMe` |
| `getSettings` | — | `{ user, reminders }` |
| `updateSettings` | any of: profile fields, `kcalTarget, proteinTargetG, carbsTargetG, fatTargetG` (switches to manual), `targetsManual: false` (back to formula), `experience` (`new`/`some`/`experienced`), `equipment` (`gym`/`dumbbells`/`home`), `sessionMinutes` (30/45/60/90), `weightUnit, energyUnit, timezone, weekStartsOn, defaultRestSec, quietStart, quietEnd, waterTargetMl, workoutsPerWeek, goalWeightKg` | `{ user, reminders }` |
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
| `getWorkout` | `id?` (omit = the open one) | `{ workout, exercises: [{ exercise, target, sets, previous, restSec, bestWeightKg, program? }], totals }` or `{ workout: null }` |
| `addWorkoutExercise` | `workoutId, exerciseId, sets?` | workout detail |
| `updateWorkoutExercise` | `id` + `restSec?, supersetGroup?, notes?, position?` | workout detail |
| `removeWorkoutExercise` | `id` | workout detail |
| `addSet` | `workoutExerciseId, setType?` | `{ set }` (copies the last set) |
| `updateSet` | `id` + any of `weightKg, reps, durationSec, distanceM, kcal, rpe, rir, setType, completed` | `{ set, prs, restEndsAt }` — `prs` = records just broken |
| `deleteSet` | `id` | `{ ok }` |
| `setRest` | `workoutId, seconds` (0 = clear) | `{ restEndsAt }` |
| `finishWorkout` | `id, notes?` | `{ workout, totals, prs, progression, programChanges, achievements }` or `{ discarded: true }` if nothing was done |
| `discardWorkout` | `id` | `{ ok }` |
| `listWorkouts` | `from, to` | `{ workouts }` (finished, newest first, with `prs`) |

## Food & water

| Endpoint | Input | Returns |
|---|---|---|
| `getFoodDay` | `date?` | `{ date, meals: [{ meal, items, totals }], totals, targets, water }` |
| `searchFoods` | `q?` (none = `{ recent, favorites }`) | `{ results }` |
| `browseFoods` | `category` (a built-in food category, `mine` or `recipes`) | `{ category, foods }` (with `category, favorite, custom`) |
| `getFood` | `id` | `{ food, items }` (items for recipes) |
| `lookupBarcode` | `barcode` | `{ food }` or `{ food: null }` |
| `logFood` | `meal, date?` + `foodId, quantity, unit: g\|ml\|serving` **or** `quickAdd: { name?, kcal, proteinG?, carbsG?, fatG? }` | `{ log, day }` |
| `updateFoodLog` | `id` + `quantity?, unit?, meal?, date?` (quick adds: also `kcal, proteinG, …`) | `{ log, day }` |
| `deleteFoodLog` | `id` | `{ day }` |
| `copyFood` | `fromDate, toDate?, meal?, toMeal?` | `{ copied, day }` |
| `makeOwnFood` | `id` (a built-in or Open Food Facts food) | `{ food, items }` — the user's editable copy, named in their language: an Uzbek dish becomes a recipe with its ingredients, anything else a custom food |
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

## Friends

Groups are joined by invite link: `t.me/<bot>?startapp=g_<code>` opens the Mini App with that
`start_param`; the app shows `previewGroup` and joins only on an explicit tap. Every
cross-user read goes through `lib/social.js`: you see a member's data only in a group you
share, and only what they allow there (`shareWorkouts`, `sharePrs`, `shareRoutines`,
`shareWeight`, per group). Feed items and challenge activity count only from the time
both people joined that group. All of these need a finished onboarding.

| Endpoint | Input | Returns |
|---|---|---|
| `createGroup` | `name` | `{ group }` — `id, name, ownerId, memberCount, role, inviteLink` |
| `listGroups` | — | `{ groups }` |
| `previewGroup` | `code` (`g_` prefix optional) | `{ group: { id, name, memberCount, ownerName }, isMember }` — no members, no activity |
| `joinGroup` | `code` | `{ group, joined }` (`joined: false` if already a member) |
| `leaveGroup` | `groupId` | `{ left: true }` — an owner hands over to the longest-standing member; the last one out deletes the group |
| `updateGroup` | `groupId, name` (owner) | `{ group }` |
| `removeMember` | `groupId, userId` (owner) | `{ removed: true }` — they can't rejoin until the link is reset |
| `resetInvite` | `groupId` (owner) | `{ group }` with a new `inviteLink`; clears removals |
| `updateMembership` | `groupId` + any of `shareWorkouts, sharePrs, shareRoutines, shareWeight, mutePings, showInChat` | `{ membership }` |
| `getGroup` | `groupId, week?` (any date in the week) | `{ group (… chatLinked), me (my settings), members, leaderboard: { from, to, consistency, volume, strength } }` |
| `getGroupFeed` | `groupId, before?` (cursor) | `{ items: [{ id, userId, name, type: workout\|achievement, payload, localDate, reactions, myReaction }], nextBefore }` |
| `react` | `activityId, emoji: 👏\|🔥\|💪` (same again = remove) | `{ activityId, reactions, myReaction }` |
| `listMemberRoutines` | `userId` | `{ member, routines }` |
| `copyRoutine` | `routineId` (a groupmate's) | `{ routine }` — custom exercises reused by name or copied; target weights empty |
| `createChallenge` | `groupId, metric: workouts\|volume_kg\|sets\|active_days\|exercise_reps, startDate, endDate` (≤ 90 days, not in the past) `+ target?, title?, exerciseId` (built-in, for `exercise_reps`) | `{ challenge }` with `status, standings` |
| `listChallenges` | `groupId` | `{ challenges }` — running and ended in the last 30 days |
| `deleteChallenge` | `id` (creator or owner) | `{ deleted: true }` |

Leaderboard rows: consistency `{ rank, userId, name, done, goal, pct, streakWeeks }` (the
same Monday–Sunday week for everyone, against each member's own `workoutsPerWeek`);
volume `{ volumeKg, sets }`; strength `{ bodyWeightKg, lifts: [{ exercise, e1rmKg, ratio }], total }`
(best e1RM in 90 days ÷ latest weigh-in, members sharing weight only).

## Sharing, achievements, programs, export

| Endpoint | Input | Returns |
|---|---|---|
| `prepareShare` | `workoutId` (finished), `imageBase64` (the card, PNG/JPEG) | `{ id }` for `Telegram.WebApp.shareMessage(id)` (Bot API 8.0+) |
| `getAchievements` | — | `{ achievements: [{ code, earnedAt }], earnedCount }` — catalogue in `lib/data/achievements.js` |
| `listPrograms` | — | `{ programs, activeCode, suggestedMaxes, recommended, needsProfile }` — `suggestedMaxes`: 5/3/1 1RMs from the last 90 days; each program's `days: [{ name, minutes, exercises: [{ key, name, alternatives, optional }] }]` is laid out for the caller's equipment and session length, `doable` = every required exercise fits their equipment; `recommended`: up to 3 `{ code, score, reasons: [{ key, params }] }` (translation keys) when not in a program; `needsProfile`: `experience`/`equipment` not answered |
| `enrollProgram` | `code` + `oneRepMaxes?: { ohp, deadlift, bench, squat }` (kg, 5/3/1) + `swaps?: { '<day>.<i>': exercise name }` (one of that exercise's `alternatives`) | same as `getMyProgram` — creates the routines for the user's equipment and session length and **replaces the weekly schedule** |
| `getMyProgram` | — | `{ program, enrollment, weekIndex, week, of, cycle, deload, sessionsDone, sessionsThisWeek, daysPerWeek, routines }` or `{ program: null, lastEnded }` |
| `leaveProgram` | — | `{ left: true }` — routines archived, schedule days cleared, workouts kept |
| `exportData` | — | `{ files }` — the bot sends CSVs to your chat; once an hour |

`finishWorkout` also returns `achievements: [{ code }]` (newly earned). Starting a program's
routine pre-fills that week's prescribed sets from each exercise's lift state; its exercises have
`target: null` and, while the workout is open, `program: { calibrate, guess, change }` — `calibrate`
= nothing known yet, this session sets the weight (log `rir` on the sets); `change` = why the weight
changed (`{ kind: 'up' | 'hold' | 'reset' | 'break' | 'calibrated' | 'reps', fromKg, toKg, fromReps?, toReps? }`; `reps` = a bodyweight exercise's rep target went up). Finishing it
advances the lift states and returns the changes as `programChanges: [{ exerciseId, exerciseName,
kind, fromKg, toKg }]`. The program week counts finished sessions (`sessionsDone`).

Friends error codes: `INVITE_INVALID`, `REMOVED_FROM_GROUP`, `GROUP_FULL` (50 members),
`GROUP_LIMIT` (10 groups), `NOT_OWNER`, `CHALLENGE_LIMIT` (5 running), `NOT_FINISHED`,
`PROGRAM_ACTIVE`, `RATE_LIMITED` (+ `retryAfterSec`), `NOTHING_TO_EXPORT`,
`BOT_CHAT_REQUIRED` (the bot can't message you yet — call `Telegram.WebApp.requestWriteAccess()` and retry).

## System

| Endpoint | Who | What |
|---|---|---|
| `tick` | ids in `lib/config.js` → `SCHEDULER_USER_IDS` (by hand, via `npx tgcloud run`) | sends due reminders, rest-over pings, friends' workout pings, challenge results and weekly posts in linked group chats |
| `adminSeed` | `ADMIN_USER_IDS` | adds any new built-in exercises/foods |

**Running the scheduler.** The platform has no cron and only accepts init data signed by
Telegram, so `tick` runs from a heartbeat instead: a Cloudflare cron worker has a helper
bot post `tick` every minute in a private channel where @fitbroapp is an admin (then
delete it). `handlers/channel_post.js` runs the scheduler for that channel only —
`TICK_CHANNEL_ID` in `lib/config.js` (null = off). Reminders more than 15 minutes late
and workout pings over an hour old are skipped, so downtime doesn't flood anyone.
