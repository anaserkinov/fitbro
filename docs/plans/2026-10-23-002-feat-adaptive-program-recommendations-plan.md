---
title: Adaptive Programs and Recommendations - Plan
type: feat
date: 2026-10-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Adaptive Programs and Recommendations - Plan

## Goal Capsule

- **Objective:** Make programs work for each user. A program should start from the right weights even with no history, adapt to how the user's sessions actually go (stalls, missed weeks, effort), and be recommended from the user's profile and training history. More templates and equipment-aware exercise choices let one program fit a full gym, dumbbells only, or bodyweight at home.
- **Authority:** This plan, then `AGENTS.md` (module rules, no foreign keys, `.deprecated()` drops, i18n, one `api` endpoint), then `docs/i18n.md`, then the programs design in `docs/plans/2026-10-23-001-feat-friends-social-engagement-plan.md` (U12, KTD16), which this plan extends. Where the two disagree, this plan wins: KTD6 here replaces the calendar week index.
- **Execution profile:** Three phases (A → B → C). Each ships and deploys on its own. Within a phase, follow unit dependency order.
- **Stop conditions:** Stop and ask if a unit needs a foreign key, a column type change or a destructive migration. Also stop if existing active enrollments can't be carried over without losing their training maxes or week position.
- **Tail ownership:** The implementer may run `npm test` and `npm run build`. `npx tgcloud migrate` and `npx tgcloud push` change the live bot. Leave both to the user, or get explicit approval per phase.

---

## Product Contract

### Summary

Phase A makes the existing three programs adaptive. Each program exercise gets a stored working weight. When nothing is known, the first session calibrates it from one honest set, and a bodyweight-based guess fills the gap until then. After each session the weight goes up, holds, or drops back after repeated misses. Weeks advance by sessions done, not calendar days, and a long break brings the user back a little lighter.

Phase B asks three training questions (experience, equipment, session length). It scores every program against the answers, the user's weekly days and goal, and what their logged history says about their level. Up to three recommendations show at the top of Programs, each with a short reason.

Phase C adds templates and movement-pattern slots, so each program picks the right exercise for the user's equipment and trims accessories to fit their session length.

### Problem Frame

Programs today are fixed templates with three gaps:

- **No starting point.** `prescribe()` returns `weightKg: null` until the user has history for that exact exercise. A new user gets empty sets and has to guess. Only 5/3/1 asks for maxes.
- **Weights only go up.** `linear()` and `double()` add weight when reps are hit and repeat the weight otherwise, forever. A user who stalls never gets a reset. Logged effort (`sets.rpe`, `sets.rir`, already stored) is ignored.
- **Calendar weeks.** `weekIndexOf` counts weeks from `start_date`. Missing a week silently skips a week of the program. A two-week holiday lands the user deep into a PPL block, or ends an 8-week program early.

Choosing a program is also left to the user. The app already knows their goal, weekly workout target, body weight and full set history, but it doesn't know their experience or equipment. The three templates all assume a barbell gym, and two need 4+ days.

### Requirements

**Starting weights (Phase A)**
- R1. Every program exercise has a working weight per user and enrollment. It is set from, in order: an entered 1RM (5/3/1, as today), recent history of that exercise, or a calibration session.
- R2. In a calibration session the app asks the user to work up to a weight they could lift for the target reps with about 2 reps left, and to say how many reps they had left. The next session's working weight comes from that set.
- R3. Until calibration, a planned set shows a conservative starting guess from body weight, sex and level. It is labelled as a guess. With no body weight on file, it stays empty, as today.

**Adapting (Phase A)**
- R4. After a session where every working set hits its target, the working weight goes up by the exercise's increment. When the user reports 0 reps left (or RPE ≥ 9.5) on the last working set, the weight holds instead.
- R5. After 3 sessions in a row that miss their target, the working weight drops about 10% (rounded to the plate step) and the miss count resets. 5/3/1 applies the same rule per lift to the training max at the end of a cycle.
- R6. A program week advances once the user has done that week's sessions. Missing calendar days doesn't skip program weeks.
- R7. Returning after 14+ days without a program session lowers every working weight about 10%, once.
- R8. The live workout shows why a weight changed ("+2.5 kg: all reps hit", "Lighter: 3 sessions missed", "Welcome back: 10% lighter"). The workout summary lists the changes.

**Recommendations (Phase B)**
- R9. The profile gains experience (`new` | `some` | `experienced`), equipment (`gym` | `dumbbells` | `home`) and session length (30 / 45 / 60 / 90 minutes). Onboarding asks them in one step. Settings can change them. Existing users get a prompt on Programs to answer them.
- R10. Programs shows up to 3 recommended programs, best first, each with 1–3 reasons. Programs the user can't do with their equipment are never recommended.
- R11. If the user's history shows a higher level than they reported, the recommendation uses the higher level and says why. It never moves a user down.
- R12. The full catalogue stays browsable below the recommendations.

**Templates and equipment (Phase C)**
- R13. Each program exercise is a movement slot (e.g. "horizontal press") with a default exercise. On enroll it resolves to the best exercise the user's equipment allows.
- R14. The enroll sheet lists the resolved exercises. The user can swap any of them for another exercise in the same slot.
- R15. Accessories marked optional are dropped, last first, until the estimated session time fits the user's session length.
- R16. New templates: 2-day full body, 4-day upper/lower, 3-day dumbbell full body, 3-day home bodyweight.
- R17. Bodyweight exercises progress by reps (add a rep per session up to the top of the range) rather than by weight.

**Cross-cutting**
- R18. Every new user-facing string has en, ru and uz text (`docs/i18n.md`).
- R19. `deleteMyData` removes the new per-user rows.
- R20. Enrollments active when Phase A ships keep their week position, training maxes and current weights.

### Acceptance Examples

- AE1. Covers R2, R3. **Given** a new 80 kg male user enrolls in Beginner full body with no history, **when** he starts Full body A, **then** squat shows a starting guess (e.g. 40 kg × 5) with a "Find your weight" hint. He logs 70 kg × 5 with 2 reps left. **Then** next session’s squat is 70 kg × 5 × 3 and the hint is gone.
- AE2. Covers R4. **Given** bench working weight 60 kg, 3×5, **when** the user completes 5/5/5 with 2 reps left on the last set, **then** next session is 62.5 kg. **When** instead the last set is logged with 0 reps left, **then** next session stays at 60 kg.
- AE3. Covers R5. **Given** overhead press at 40 kg misses 5 reps three sessions in a row, **then** the fourth session prescribes 35 kg (40 × 0.9 = 36, rounded down to 35) and the summary says why.
- AE4. Covers R6, R7. **Given** a PPL user in week 3 takes 16 days off, **when** they come back, **then** they are still in week 3 (the deload is week 4), and every working weight is about 10% lower for that session.
- AE5. Covers R10, R11. **Given** a user who said "new", 3 days, dumbbells, **when** they open Programs, **then** "Dumbbell full body" is first, and barbell-only programs aren't recommended. **Given** a user who said "new" but has 4 months of steady training and a 1.2× bodyweight squat, **then** recommendations are made for "some" experience, with the reason "Your log shows steady training".
- AE6. Covers R15. **Given** session length 45 min, **when** the user enrolls in PPL, **then** each day keeps its main lifts and drops optional accessories until the estimate is ≤ 45 min.
- AE7. Covers R20. **Given** a 5/3/1 enrollment with TM bench 100 kg created before Phase A, **when** the user starts week 2 bench day after the deploy, **then** planned sets are still 70/80/90 kg, and an `program_lifts` row with 100 kg now exists.

### Scope Boundaries

- No AI-generated or free-form programs. Programs stay code templates. Recommendation is a transparent score.
- No user-authored programs.
- No automatic switch to a harder bodyweight variant (e.g. push-up → dip). A capped bodyweight exercise just stays at the top of its range (see Deferred).
- Food targets and the calorie formula are unchanged.

#### Deferred to Follow-Up Work

- Progressing bodyweight exercises to harder variants once they reach the top of the range.
- Swapping an exercise inside an active program (today only at enroll time).
- Suggesting a program change when the user keeps skipping a day or stalls on most lifts.
- Recommending a program from the bot chat.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Progression state lives in a new `program_lifts` table, one row per (enrollment, exercise).** Columns: `user_id`, `enrollment_id`, `exercise_id`, `working_kg` (null until known; for 5/3/1 main lifts it is the training max), `target_reps` (bodyweight exercises, KTD9), `misses` (consecutive missed sessions), `source` (`entered` | `history` | `calibrated` | `guess`), `last_change` (json `{ kind, fromKg, toKg }` for R8), `updated_at`. Unique index on `(enrollment_id, exercise_id)`. *Rationale:* Stall counts, calibration status and "why it changed" need memory. Deriving them from past sets breaks when workouts are edited, deleted or done out of order. Explicit state also makes `prescribe()` a pure function of (template, state, week), which is easy to test.

- KTD2. **`prescribe()` reads state, and a new `advance()` writes it.** Each template keeps `prescribe(ex, { state, week, ... })` and gets `advance(ex, state, doneSets)` → new state. Both stay in `tgcloud/lib/data/programs.js`, built from shared helpers (`linearAdvance`, `doubleAdvance`, `waveAdvance`, `repsAdvance`). `finishWorkout` calls `applyProgramProgress(user, workout)` in `tgcloud/lib/programs.js`, next to the existing `applyProgression`, which stays for ordinary routines. *Rationale:* One place per template for both directions. `finishWorkout` is the single path both the Mini App and the chat finish flow go through.

- KTD3. **Starting weights resolve in a fixed order when a lift's state is first needed.** The order is entered 1RM → history → calibration (guess shown meanwhile). `ensureLiftState()` runs lazily at `startWorkout` time:
  1. **Entered:** 5/3/1 maxes from the enroll sheet → `trainingMax()`, as today.
  2. **History:** the best `e1rm_kg` for that exercise in the last 90 days → working weight for the target reps via inverse Epley, `e1rm / (1 + reps/30)`, times 0.9 for headroom, rounded to the plate step. This widens `suggestedMaxes()` from 4 lifts to every exercise.
  3. **Calibration:** `working_kg` stays null and `source = 'guess'`. The planned sets carry the guess (KTD4) and the exercise is flagged `calibrate`.

  *Rationale:* History is the best signal when it exists. Calibration is accurate within a session and needs no 1RM test, which is unsafe for beginners.

- KTD4. **Calibration uses one top set plus reps in reserve.** A calibrating exercise is prescribed with the guess weight. The live screen shows "Find your weight: work up until you'd have about 2 reps left at {reps} reps", and asks for reps left on each completed working set. On finish, `advance()` takes the heaviest completed working set: `e1rm = w × (1 + (reps + rir) / 30)`, with `rir` defaulting to 1 when not logged (cautious). The working weight is `roundTo(e1rm / (1 + targetReps/30) × 0.9)`, and `source` becomes `calibrated`. If no working set was completed, the exercise stays calibrating. *Rationale:* RIR-adjusted Epley is a standard, conservative estimate. The 0.9 factor leaves room for the progression to work at the start.

- KTD5. **The starting guess is a small table of bodyweight ratios.** `STARTER` in `tgcloud/lib/data/programs.js` maps movement pattern × sex × level → working weight as a fraction of body weight at about 8 reps (e.g. squat, male, new: 0.5). The values are deliberately low, a published-standards beginner level × about 0.7. It applies only to `weight_reps` exercises, with body weight from `latestWeightKg()`. Isolation and machine exercises get no guess (null). *Rationale:* An empty first session is the current pain. A low guess is safe because calibration replaces it the same day.

- KTD6. **The program week counts sessions, not days.** `weekIndex = floor(sessionsDone / daysPerWeek)`, where `sessionsDone` is the number of finished workouts whose `routine_id` belongs to the enrollment. This is a query over `workouts`, not a stored counter. A fixed-length program ends once `sessionsDone ≥ weeks × daysPerWeek`. A program also ends after 28 days with no program session, so abandoned enrollments don't linger forever. *Rationale:* Missing days no longer skips weeks (R6). Deriving the count means editing or deleting a workout can't desync it. This replaces `weekIndexOf` and the calendar part of KTD16 in the previous plan.

- KTD7. **The return-from-break deload is applied once, at `startWorkout`.** If the last finished program session is 14+ days old, every lift's `working_kg` × 0.9 (rounded), `misses` reset, and `last_change = { kind: 'break' }`. A new `program_enrollments.last_session_at` column is updated on finish, so the check is cheap and doesn't repeat. *Rationale:* Detraining after two weeks is real but small. Applying the deload at start means the user sees the lighter weight in that session.

- KTD8. **Advance rules (R4, R5):**
  - **Hit:** every prescribed working set completed at ≥ working weight with ≥ target reps. Double progression uses its own rule: the lowest set ≥ `repsMax`.
  - **Too hard:** the last working set logged with `rir === 0` or `rpe ≥ 9.5`. Treated as a hold even on a hit.
  - **Miss:** any prescribed working set below its target reps at the prescribed weight → `misses + 1`. At 3: `working_kg = roundDown(working × 0.9)`, `misses = 0`, `last_change = { kind: 'reset' }`.
  - **Partial or skipped:** an exercise with no completed working sets doesn't change state. Neither does a set the user made lighter than prescribed.
  - **Deload weeks** (PPL week 4, 5/3/1 week 4) never advance or count misses.
  - **5/3/1** advances the training max once per cycle, at the week-4 boundary. It goes up by `inc` unless any AMRAP set that cycle fell short of its planned reps, in which case it drops 10%.

  *Rationale:* These are the standard novice / double-progression / 5/3/1 rules, written down once and tested.

- KTD9. **Bodyweight exercises progress by reps.** For `bodyweight_reps` exercises, state keeps `target_reps`. A hit adds 1 rep, up to `repsMax`, and then holds. A miss holds. `weighted_bodyweight` exercises (pull-up, dip) progress by reps until `repsMax`, then add `inc` kg and drop to `repsMin`, which is double progression on added load. *Rationale:* It's the only honest progression without a variant ladder (deferred).

- KTD10. **The three new profile fields are nullable text/int columns on `users`, validated as enums in `validate.js`.** They are `experience`, `equipment` and `session_minutes`. `trainingSplit` stays as it is (unused by recommendation). *Rationale:* Matches how `goal` and `activityLevel` are stored. Enum-like text columns need no table rebuild (schema conventions).

- KTD11. **Recommendation is a pure function, `recommendPrograms(profile, signals, programs)`, in `tgcloud/lib/recommend.js`.** `signals` comes from one small query helper (`trainingSignals(user)`):
  - weeks with ≥ 2 workouts in the last 16 weeks
  - relative strength: best 90-day e1RM of squat, bench and deadlift ÷ latest body weight
  - whether the user has an ended enrollment
  - The **inferred level** is: `experienced` if ≥ 12 active weeks and a squat ≥ 1.5× or bench ≥ 1.1× body weight. `some` if ≥ 8 active weeks, or a squat ≥ 1.0× body weight. Otherwise `new`. Effective level = max(stated, inferred) (R11).
  - **Hard filter:** the template's `equipment` list includes the user's equipment. After Phase C a template is doable if every non-optional slot resolves for that equipment.
  - **Score** (higher is better):
    - days per week: exact match 40, ±1 day 20, otherwise 0
    - level in the template's `levels`: 30
    - session fit, after trimming optional accessories: 15
    - goal bias (`bulk` → `volume: 'high'`, `cut` → `'moderate'`): 10
    - a small bonus if the user finished this program before and it fits a higher level: 5

    Ties go to template order.
  - **Reasons** are the top contributing factors as translation keys with params (`'Fits your {n} days a week'`, `'Works with dumbbells only'`, `'Your log shows steady training'`).

  *Rationale:* A transparent score is easy to test and explain, and matches R10's "with a reason". The weights are a starting point, kept in one constant so they can be tuned.

- KTD12. **Templates gain metadata, and exercises become slots.** Template keys:
  - `levels` (e.g. `['new']`)
  - `equipment` (e.g. `['gym']`)
  - `volume` (`'moderate' | 'high'`)
  - `minutesPerExercise`, default 9 (sets × (work + rest) at the usual rest)

  Each day exercise gets `slot` (e.g. `'h_press'`) and optionally `optional: true`. Its `name` stays as the gym default. `SLOTS` in a new `tgcloud/lib/data/slots.js` maps slot → ordered candidates per equipment level. For example, `h_press`: gym `['Barbell Bench Press', 'Dumbbell Bench Press', 'Chest Press Machine']`, dumbbells `['Dumbbell Bench Press', 'Push-up']`, home `['Push-up']`. A slot is resolved at enroll, and the choice is stored in a new `program_enrollments.exercise_choices` json column (`{ "<day>.<i>": "<exercise name>" }`). `programPlan` and `applyProgramProgress` look exercises up through the choices, falling back to `name`. *Rationale:* One template covers several equipment setups. Storing the choice keeps a running program stable if `SLOTS` changes later. Existing enrollments have no choices, so they fall back to `name`, which is exactly today's exercise (R20).

- KTD13. **Templates are append-only for active enrollments.** Day order and exercise positions in an existing template never change. New exercises are appended to the end of a day, and only as `optional`. Existing enrollments ignore exercises their routines don't contain. *Rationale:* `program_day` and the choices keys index into the template.

- KTD14. **Migration of active enrollments is lazy (R20, AE7).** No backfill script. `ensureLiftState()` seeds a missing row:
  - 5/3/1 main lifts from `trainingMaxes`. The cycle offset uses the enrollment's old calendar week, so the TM already includes the cycles done.
  - Other lifts from the last session's working weight, with `source = 'history'`.
  - `sessionsDone` for an old enrollment would restart the week count. To avoid that, a new `program_enrollments.week_offset` column is set once, the first time a pre-Phase-A enrollment is read: `week_offset = calendarWeek − floor(sessionsDone / daysPerWeek)`, clamped ≥ 0. After that, week = that value + session-based week.

  *Rationale:* Few live enrollments exist (programs shipped in the last commit). Lazy seeding needs no migration script and runs in the same code path as new enrollments.

### High-Level Technical Design

**Data model changes (all additive; no foreign keys):**

```
users                 + experience text, equipment text, session_minutes integer
program_enrollments   + exercise_choices json, last_session_at timestamp, week_offset integer
program_lifts (new)     id, user_id, enrollment_id, exercise_id, working_kg real, target_reps integer,
                        misses integer default 0, source text, last_change json, updated_at
                        uidx (enrollment_id, exercise_id); idx (user_id)
```

**Flow:**

```
enrollProgram ─▶ resolve slots (KTD12) ─▶ routines + schedule (as today) ─▶ store exercise_choices
startWorkout ──▶ programPlan
                   ├─ break check (KTD7)
                   ├─ ensureLiftState per exercise (KTD3/14): entered → history → guess
                   └─ prescribe(ex, { state, week }) → planned sets (+ calibrate flag)
getWorkout ────▶ per exercise: program: { calibrate, guess, lastChange }
finishWorkout ─▶ applyProgramProgress
                   ├─ advance(ex, state, doneSets) per exercise (KTD4/8/9)
                   ├─ write program_lifts, last_session_at
                   └─ return changes → summary (R8)
listPrograms ──▶ recommendPrograms(profile, trainingSignals) → { recommended[], programs[] }
```

### Sequencing

Phase A (U1–U4) → Phase B (U5–U6) → Phase C (U7–U9). Each phase gets its own migration before `push`. B doesn't depend on A, so it can go first if recommendations matter more. C's recommendation filter improves on B's but doesn't require it.

---

## Phase A implementation notes (2026-10-23)

Phase A shipped with these deviations from the decisions above. Where they disagree, these notes win.

- **Starting weight from a 1RM (KTD3, KTD4):** both history and calibration use one formula, `workingWeight(e1rm, reps) = e1rm / (1 + (reps + 2) / 30)`. That is the weight that leaves about 2 reps in reserve at the target reps, and it replaces "inverse Epley × 0.9". A calibration set done as asked therefore gives back the weight lifted (70 × 5 with 2 left → 70 kg, AE1). With reps left not logged, the default of 1 gives 67.5 kg.
- **Carrying over old enrollments (KTD14):** a lift without state picks up from the last session of that exercise *within the enrollment*, replaying `advance()` on it. This reproduces the old behavior. Otherwise it uses the 90-day e1RM, then a guess.
- **Break deload (KTD7):** instead of `last_session_at`, the last session date is derived from `workouts` (`max(local_date)` of the enrollment's finished routines). The deload is recorded once in `program_enrollments.break_deload_date`.
- **`exercise_choices`** moved to U7, so that no column is added before it is used.
- **Schema:** adds `program_lifts`, plus `program_enrollments.week_offset` and `break_deload_date`. `program_lifts.cycle` holds the 5/3/1 wave of the stored training max. The roll to a new wave happens at `startWorkout` (`roll()`), not at finish.
- **Bodyweight exercises** (e.g. Hanging Leg Raise in 5/3/1) have no lift state until U7 and are prescribed by reps alone.

---

## Phase B implementation notes (2026-10-23)

- **Where the questions are asked (U5):** the three training questions go in onboarding's existing optional "Your plan" step, not a new step. Settings has a Training row that opens the same fields (`src/ui/TrainingFields.jsx`), and Programs asks them in a sheet. All three are optional everywhere.
- **Scoring (KTD11):** a program needs to be within ±1 day of the weekly target and not above the user's level. The "finished this program before" bonus is dropped, because the data can't tell finishing a program from leaving it. Session length is a rough estimate: 10 min, plus 2.5 min per set.
- **Equipment:** `users.equipment` is validated against a new `gymAccess` enum, because `ENUMS.equipment` already names exercise equipment.

---

## Implementation Units

| U-ID | Title | Key files | Depends on |
|---|---|---|---|
| U1 | Lift state, week by sessions, lazy migration | `tgcloud/schema.js`, `tgcloud/lib/programs.js`, `tgcloud/lib/users.js` | — |
| U2 | Prescribe/advance rewrite, stalls, effort | `tgcloud/lib/data/programs.js`, `tgcloud/lib/programs.js`, `tgcloud/lib/workouts.js` | U1 |
| U3 | Starting weights: history, guess, calibration | `tgcloud/lib/programs.js`, `tgcloud/lib/data/programs.js` | U2 |
| U4 | Workout UI: calibrate hint, reps-left input, change reasons | `src/screens/Workout.jsx`, `src/screens/WorkoutSummary.jsx`, `tgcloud/lib/bot/workout.js` | U2, U3 |
| U5 | Training profile fields | `tgcloud/schema.js`, `tgcloud/lib/users.js`, `tgcloud/lib/validate.js`, `src/screens/Onboarding.jsx`, `src/screens/Settings.jsx` | — |
| U6 | Recommendation engine and UI | `tgcloud/lib/recommend.js`, `tgcloud/lib/programs.js`, `src/screens/Programs.jsx` | U5 |
| U7 | Slots and equipment resolution | `tgcloud/lib/data/slots.js`, `tgcloud/lib/data/programs.js`, `tgcloud/lib/programs.js`, `tgcloud/lib/data/exercises.js` | U1 |
| U8 | Session-length trimming and swap on enroll | `tgcloud/lib/programs.js`, `src/screens/Programs.jsx` | U7 |
| U9 | New templates | `tgcloud/lib/data/programs.js`, `tgcloud/lib/i18n/friends.js` | U2, U7 |

### Phase A — Adaptive programs

### U1. Lift state, week by sessions, lazy migration

**Goal:** Store per-lift progression state, and count program weeks by sessions done.

**Requirements:** R6, R19, R20

**Files:**
- Modify `tgcloud/schema.js`: add `program_lifts` (KTD1). Add `program_enrollments.last_session_at`, `week_offset` and `exercise_choices` (the last one is used from U7; adding it now saves a migration).
- Modify `tgcloud/lib/programs.js`:
  - replace `weekIndexOf` with `programWeek(user, e, program)` (KTD6, KTD14)
  - add `sessionsDone(e)`
  - make `currentEnrollment` end a program by sessions or after 28 idle days
  - make `endEnrollment` keep `program_lifts` (history) and `leaveProgram` likewise
- Modify `tgcloud/lib/users.js`: add `T.programLifts` to `USER_TABLES`.
- Test: `test/run.mjs` (week maths), `test/endpoints.mjs` (enroll → finish N sessions → week advances).

**Approach:**
- `sessionsDone`: `count(*)` over `workouts` where `routine_id in (enrollment routines, including archived)` and `ended_at is not null` and `local_date ≥ start_date`.
- `getMyProgram` returns `sessionsDone`, `sessionsThisWeek` and `daysPerWeek`, so the UI can show "Week 3 · 1 of 3 done".
- Old enrollments: on first read, if `week_offset` is null and the enrollment started before this deploy (any row with null `last_session_at` and `created_at` older than the deploy), set the offset per KTD14. New enrollments set `week_offset = 0` on insert.

**Test scenarios:**
- 3-day program: 0–2 sessions → week 1, 3 sessions → week 2. Ten idle days don't change the week.
- An 8-week, 3-day program ends after the 24th session, not on day 56.
- No program session for 28 days → the enrollment ends on the next read, and its routines are archived.
- A pre-existing enrollment started 15 days ago with 2 sessions → week_offset = calendar week 2 − floor(2/3) = 2 → still in week 3 (AE7 setup).
- `deleteMyData` removes `program_lifts` rows.

**Verification:** Tests pass. `npx tgcloud status` shows only additive changes.

### U2. Prescribe/advance rewrite, stalls, effort

**Goal:** Prescriptions come from stored state, and finishing a workout advances it with stall and effort rules.

**Requirements:** R4, R5, R7, R8 (data)

**Files:**
- Modify `tgcloud/lib/data/programs.js`:
  - replace `linear` / `double` (which read `previous`) with state-based `prescribe` and `advance` helpers (KTD2, KTD8)
  - give each template both functions
  - keep `WAVE`, `roundTo` and `trainingMax`; add `roundDown`
- Modify `tgcloud/lib/programs.js`:
  - `programPlan` builds from state (KTD7 break check first)
  - new `applyProgramProgress(user, workout)` returns `[{ exerciseId, kind, fromKg, toKg, fromReps, toReps }]`
- Modify `tgcloud/lib/workouts.js`: `finishWorkout` calls `applyProgramProgress` when the workout's routine is a program routine and merges the result into `progression` in the response. The `addExercise` call signature is unchanged (`plan(exerciseId, prev)`).
- Test: `test/run.mjs` (advance tables per template), `test/endpoints.mjs` (AE2, AE3, AE4).

**Approach:**
- `advance` gets only completed, non-warmup sets of that workout exercise, compared against what was prescribed. Store the prescribed weight and reps in the state's `last_change.prescribed` at plan time, or recompute them with `prescribe()` at finish time from the same state and week. Prefer recomputing, since it's deterministic.
- If the user changed the weight upward and hit their reps, take the heavier weight as the new base, plus the increment. Users who know better shouldn't be dragged back.
- 5/3/1 AMRAP shortfall is tracked in state as `misses > 0` during the cycle, and evaluated at the week-4 boundary.
- Deload weeks: `advance` returns state unchanged.

**Test scenarios:**
- Linear: hit → +inc. Hit with last-set `rir 0` → hold. Miss ×3 → `roundDown(w × 0.9)` and misses 0. Miss, hit, miss → misses 1 (a hit resets the count).
- Double (PPL): 8-8-7 in a 6–8 range → reps target 8, no weight change. 8-8-8 → +inc, reps target back to 6.
- 5/3/1: a cycle with all AMRAPs met → TM +inc at the week-5 start. One AMRAP short → TM × 0.9.
- Break: last session 15 days ago → all working weights × 0.9 once. A second start the same day doesn't reduce them again.
- Deload week sets don't change state.
- A partial workout (exercise skipped) leaves that lift unchanged.

**Verification:** Tests pass. Simulating 12 weeks of PPL with scripted reps produces the expected weight curve.

### U3. Starting weights: history, guess, calibration

**Goal:** No empty first session. Calibrate when nothing is known.

**Requirements:** R1, R2, R3

**Files:**
- Modify `tgcloud/lib/programs.js`:
  - `ensureLiftState(user, e, ex)` (KTD3, KTD14)
  - generalize `suggestedMaxes` into `recentE1rm(userId, exerciseIds)`
- Modify `tgcloud/lib/data/programs.js`:
  - add `STARTER` ratios (KTD5) and a `pattern` on each exercise (squat, hinge, h_press, v_press, h_pull, v_pull)
  - calibrating `advance` (KTD4)
- Test: `test/run.mjs` (inverse Epley, RIR estimate, guess table), `test/endpoints.mjs` (AE1).

**Approach:**
- `ensureLiftState` runs at plan time for each exercise without a row. It inserts the row so later reads are stable.
- `prescribe` returns `{ sets, calibrate: true, guess: true }` for calibrating lifts. `addExercise` ignores the extra keys. `getWorkout` reads the flags from state (U4).
- Calibration needs a weight on the bar to be useful. If the guess is null (no body weight, isolation lift), the planned sets have null weight as today, still with the calibrate hint.

**Test scenarios:**
- 90-day e1RM 100 kg, target 5 reps → `roundTo(100 / (1 + 5/30) × 0.9)` = 77.5 kg, source `history`.
- No history, 80 kg male, new, squat → guess `roundTo(80 × 0.5)` = 40 kg, source `guess`, calibrate true.
- Calibration set 70 × 5 with rir 2 → e1rm 70 × (1 + 7/30) = 86.3 → working `roundTo(86.3 / (1 + 5/30) × 0.9)` = 67.5 kg. With rir missing (default 1) → 65 kg. Pin the exact values in the test.
- Calibrating session with no completed working sets → stays calibrating.
- History found for one lift but not another in the same day → mixed sources work.

**Verification:** Tests pass. Manual: a fresh test user enrolls and sees no empty weights on barbell lifts.

### U4. Workout UI: calibrate hint, reps-left input, change reasons

**Goal:** Users understand calibration and why weights changed, and can log effort with one tap.

**Requirements:** R2, R3, R8, R18

**Files:**
- Modify `tgcloud/lib/workouts.js` (`getWorkout`): each exercise in a program workout gets `program: { calibrate, guess, lastChange }` from `program_lifts`.
- Modify `src/screens/Workout.jsx`:
  - calibrate banner on the exercise card ("Find your weight…")
  - "guess" label on planned weights
  - a compact reps-left chip row (0 · 1 · 2 · 3+) after completing a working set. It shows on calibrating exercises and on the last working set of program exercises, and saves through the existing `updateSet` `rir` field.
  - a one-line `lastChange` reason under the exercise name
- Modify `src/screens/WorkoutSummary.jsx`: list program changes next to the existing progression changes.
- Modify `tgcloud/lib/bot/workout.js`: the chat summary includes the change lines.
- Modify `src/i18n/workout.js` and `tgcloud/lib/i18n/bot.js`: new strings (en/ru/uz).
- Test: `test/endpoints.mjs` (`getWorkout` program block), `test/bot.mjs` (summary lines).

**Approach:**
- The reps-left chips are optional and never block completing a set. Skipping them uses the KTD4 default.
- Reason keys: `'+{w}: all reps hit'`, `'Same weight: last set was all-out'`, `'Lighter: 3 sessions missed'`, `'Welcome back: 10% lighter'`, `'Set from your first session'`.

**Test scenarios:**
- `getWorkout` of a calibrating program workout → `program.calibrate === true`. A non-program workout has no `program` key.
- The finish summary of AE3 includes the reset line.

**Verification:** `npm run build`. Manual run-through in en/ru/uz: calibrate, finish, start the next session, see the reason.

### Phase B — Recommendations

### U5. Training profile fields

**Goal:** Know the user's experience, equipment and session length.

**Requirements:** R9, R18

**Files:**
- Modify `tgcloud/schema.js`: `users.experience`, `users.equipment`, `users.session_minutes` (KTD10).
- Modify `tgcloud/lib/validate.js`: enums `experience`, `equipment`, and `sessionMinutes` ∈ {30, 45, 60, 90}.
- Modify `tgcloud/lib/users.js`: `PROFILE_SPEC` and the `completeOnboarding` input.
- Modify `src/screens/Onboarding.jsx`: a new "Your training" step after the goal step (experience radio, equipment radio, days per week moved here from its current spot, session length segmented control). Step count +1.
- Modify `src/screens/Settings.jsx`: a training section with the same three fields.
- Modify `src/i18n/account.js`: strings (en/ru/uz).
- Test: `test/endpoints.mjs` (validation, onboarding saves fields).

**Approach:**
- All three are optional server-side, so existing users and older clients keep working. Onboarding requires them client-side.

**Test scenarios:**
- `updateUser({ equipment: 'garage' })` → invalid. `{ sessionMinutes: 45 }` saves.
- Onboarding without the new fields (old client) still succeeds.

**Verification:** `npm run build`. Onboarding run-through on a fresh account.

### U6. Recommendation engine and UI

**Goal:** Show the best-fitting programs with reasons.

**Requirements:** R10, R11, R12, R18

**Files:**
- Create `tgcloud/lib/recommend.js`: `trainingSignals(user)` (queries), `recommendPrograms(profile, signals, programs)` (pure, KTD11).
- Modify `tgcloud/lib/data/programs.js`: add `levels`, `equipment`, `volume` to the 3 existing templates (Beginner: `['new']`, `['gym']`. PPL: `['some', 'experienced']`, `['gym']`, `high`. 5/3/1: `['some', 'experienced']`, `['gym']`).
- Modify `tgcloud/lib/programs.js`: `listPrograms` returns `recommended: [{ code, score, reasons: [{ key, params }] }]` and `needsProfile: true` when experience or equipment is missing.
- Modify `src/screens/Programs.jsx`:
  - "Recommended for you" section above the catalogue: cards with the program name, days, weeks and reason lines
  - when `needsProfile`, a card "Answer 3 questions to get a recommendation" opening a sheet with the U5 fields
- Modify `docs/endpoints.md` if the `listPrograms` response shape is documented there.
- Modify `src/i18n/workout.js`: reason strings (en/ru/uz).
- Test: `test/run.mjs` (scoring table), `test/endpoints.mjs` (AE5).

**Approach:**
- `trainingSignals` is at most 3 queries (workouts per week bucketed in JS, best e1RMs via `recentE1rm`, `latestWeightKg`).
- Return only programs with score > 0 after the hard filter, at most 3. If none qualify (e.g. home equipment before Phase C), return an empty list and a hint ("More programs for home training are coming"), not a bad match.

**Test scenarios:**
- new / 3 days / gym → Beginner full body first, reason includes days.
- some / 6 days / gym / bulk → PPL first.
- Stated new, 14 active weeks, squat 1.6× BW → effective experienced, reason "Your log shows steady training".
- Stated experienced, no history → stays experienced (never moved down).
- dumbbells (Phase B only) → empty list plus hint.

**Verification:** Tests pass. `npm run build`.

### Phase C — Templates and equipment

### U7. Slots and equipment resolution

**Goal:** Each program exercise resolves to what the user can do.

**Requirements:** R13, R17

**Files:**
- Create `tgcloud/lib/data/slots.js`: `SLOTS` (KTD12) for the patterns used by all templates.
- Modify `tgcloud/lib/data/programs.js`: add `slot` to each existing exercise without changing order (KTD13).
- Modify `tgcloud/lib/data/exercises.js`: add the missing catalogue rows dumbbell and home need: `Dumbbell Romanian Deadlift`, `Inverted Row`, `Pike Push-up`, `Glute Bridge`, `Bodyweight Squat`, `Single-Leg Calf Raise`, `Dumbbell Calf Raise`. Run `seedCatalog()` (inserts by name, leaves existing rows alone).
- Modify `tgcloud/lib/i18n/catalog.js`: ru/uz names for the new exercises. Add form guides in `src/lib/exercise-guides.js` where available. Missing photos fall back to the text guide.
- Modify `tgcloud/lib/programs.js`:
  - `resolveExercises(program, equipment, overrides)` → choices map
  - `enrollProgram` stores `exercise_choices` and builds routines from the choices
  - `programPlan` and `applyProgramProgress` map via the choices, falling back to `name`
- Modify `tgcloud/lib/data/programs.js`: `prescribe`/`advance` branch on the resolved exercise's `trackType` (KTD9). `inc` comes from the slot candidate when given (dumbbell 2, machine 5, barbell as template).
- Test: `test/run.mjs` (resolution per equipment), `test/endpoints.mjs` (enroll with dumbbells → routine uses dumbbell exercises).

**Approach:**
- The resolution order within a slot is the candidate list for the user's equipment. Gym users may also use dumbbell and bodyweight candidates as fallbacks, and dumbbell users may use home candidates.
- Users without an `equipment` value resolve as `gym`, which is exactly today's behavior.

**Test scenarios:**
- PPL with gym → identical exercise names to today (no regression).
- Beginner full body with dumbbells → Goblet Squat, Dumbbell Bench Press, Dumbbell Row, Seated Dumbbell Press, Dumbbell Romanian Deadlift.
- Home → push-up progresses by reps (8 → 9 → … → 15, then holds).
- An enrollment with null `exercise_choices` plans with the template `name`s.

**Verification:** Tests pass. `seedCatalog` on a test DB adds exactly the new rows.

### U8. Session-length trimming and swap on enroll

**Goal:** Programs fit the user's session length, and the user can adjust exercises before starting.

**Requirements:** R14, R15, R18

**Files:**
- Modify `tgcloud/lib/data/programs.js`: mark accessories `optional: true` in existing templates. Main lifts are never optional.
- Modify `tgcloud/lib/programs.js`:
  - `planDays(program, user)` → per-day kept exercises after trimming (KTD12 estimate)
  - `listPrograms` includes per-program `days[].exercises` resolved for the caller, with `alternatives` per slot
  - `enrollProgram` accepts `swaps: { "<day>.<i>": "<exercise name>" }`, validated against that slot's candidates
- Modify `src/screens/Programs.jsx`: the enroll sheet lists each day's resolved exercises. Tapping one opens a picker of slot alternatives. It shows "≈ {n} min" per day.
- Strings in `src/i18n/workout.js` (en/ru/uz).
- Test: `test/run.mjs` (trimming), `test/endpoints.mjs` (AE6, invalid swap refused).

**Approach:**
- Trimming drops optional exercises from the end of each day until the estimate is ≤ `session_minutes`, never below the non-optional core. With no `session_minutes`, nothing is trimmed.
- A trimmed exercise is left out of the routine at enroll. It's not "skipped" each week.

**Test scenarios:**
- PPL Push at 45 min → bench, OHP and incline press kept, accessories dropped last-first.
- A swap to an exercise outside the slot → `invalid('Not an option for this exercise', 'swaps')`.

**Verification:** `npm run build`. Manual enroll with a swap.

### U9. New templates

**Goal:** Cover 2 days, 4 days, dumbbells and home.

**Requirements:** R16, R18

**Files:**
- Modify `tgcloud/lib/data/programs.js`: append, never reorder (KTD13):
  - `full_body_2day`: 2 days, 8 weeks, levels new/some, equipment gym/dumbbells, linear on mains, double on accessories
  - `upper_lower_4`: 4 days, 10 weeks, levels some/experienced, gym, heavy/light days (mains 4×5 linear on heavy, 3×8–12 double on light), deload every 5th week
  - `dumbbell_full_body_3`: 3 days, 8 weeks, levels new/some, dumbbells, double progression 8–12
  - `home_bodyweight_3`: 3 days, 8 weeks, level new, home, reps progression (KTD9)
- Modify `tgcloud/lib/i18n/friends.js` (program and day names) for ru/uz.
- Test: `test/run.mjs` (each template's slots resolve for each listed equipment, prescribe/advance smoke test per template), `test/endpoints.mjs` (enroll each).

**Approach:**
- Each template lists only equipment levels for which every non-optional slot resolves. A test enforces this, so the recommendation filter can trust `equipment`.

**Test scenarios:**
- For every template × every listed equipment: enroll succeeds, and every routine exercise exists in the catalogue.
- Recommendation: home / 3 days → `home_bodyweight_3`. Dumbbells / 2 days → `full_body_2day`.

**Verification:** Tests pass. `npm run build`. The Programs screen lists 7 programs.

---

## System-Wide Impact

- **`finishWorkout` grows again.** It adds `applyProgramProgress` (one select and up to N upserts for a program workout, nothing otherwise). Both the Mini App and the chat finish path return the extra change lines.
- **`startWorkout` for program routines** adds the break check and lazy state seeding: a few batched queries, once per lift the first time.
- **Behavior change for existing program users:** weeks now count sessions, and weights can go down. The offset migration (KTD14) keeps their position. Mention it in the release note.
- **Schema:** three additive migrations (A, B, C — C only adds catalogue rows through `seedCatalog`, no schema). No `.deprecated()` and no type changes. `program_enrollments.training_maxes` stays as written history for 5/3/1 and is still read for seeding.
- **Catalogue:** new built-in exercises appear in everyone's exercise picker.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Starting guesses too heavy for a weak or injured user | Ratios are deliberately low (KTD5) and labelled "guess". Calibration replaces them in the first session. Isolation and machine exercises get no guess. |
| Users don't log reps left, so calibration is less accurate | The default `rir = 1` errs light. The progression corrects within 2–3 sessions. |
| The session-based week stretches programs for inconsistent users | Intended (R6). The 28-day idle end stops abandoned enrollments. `getMyProgram` shows sessions done so progress stays visible. |
| The score weights recommend oddly for edge profiles | Weights live in one constant with table-driven tests. Reasons are shown, so a bad match is visible and easy to report. |
| Template edits break active enrollments | KTD13 (append-only) plus a test that the existing exercise positions in each template are unchanged. |
| Program templates encode training methodology | Rules are standard published ones, and all the maths lives in one data file with tests. |

---

## Verification Contract

| Gate | Command / check | Applies to |
|---|---|---|
| Unit and endpoint tests | `npm test` | Every unit |
| Front-end build | `npm run build` | U4, U5, U6, U8, U9 |
| Schema preview | `npx tgcloud status` shows only additive changes | U1, U5 |
| Translations | Every new key has ru and uz entries, checked by switching languages | U4, U5, U6, U7, U8, U9 |
| Live check (user-run) | `npx tgcloud migrate` then `npm run deploy` per phase. Phase A: walk AE1 with a fresh account. Phase B: AE5 with two profiles. | End of each phase |

---

## Definition of Done

- All units in the shipped phase meet their Verification line, and `npm test` and `npm run build` pass.
- AE1–AE7 each have a passing test.
- An enrollment created before Phase A keeps its week and weights after the deploy (AE7).
- `deleteMyData` leaves no `program_lifts` rows.
- No dead code is left from the `previous`-based `linear` / `double` helpers.
