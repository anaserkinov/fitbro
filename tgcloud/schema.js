import { table, integer, text, real, boolean, json, index, uniqueIndex, primaryKey, sql } from 'sdk/db';

// FitPro schema.
//
// Conventions
// - users.id IS the Telegram user id. Every other table carries `user_id` so access
//   checks are a single `eq(x.userId, me)` and "delete my data" is one delete per table.
// - No foreign keys on this platform: links are plain integer columns, integrity is
//   enforced in lib/ code (delete children before parents).
// - Weights are stored in kg, energy in kcal, lengths in cm, distance in metres.
//   Unit preferences only affect display.
// - `local_date` is 'YYYY-MM-DD' in the user's timezone — what "today" means for
//   grouping. Instants are unix-second timestamps (`*_at`).
// - Enum-like text columns are validated in app code, not with CHECKs, so adding a
//   value never needs a table rebuild.
// - user_id = 0 marks shared catalogue rows (built-in exercises, cached foods).

const now = sql`(unixepoch())`;

// ── Users & settings ────────────────────────────────────────────────────────────

export const users = table('users', {
  id:              integer('id').primaryKey(),               // Telegram user id
  firstName:       text('first_name'),
  username:        text('username'),
  languageCode:    text('language_code'),                    // from Telegram
  language:        text('language').default('en'),           // chosen UI language

  // Profile — used for the calorie calculation
  sex:             text('sex'),                              // 'male' | 'female'
  birthDate:       text('birth_date'),                       // 'YYYY-MM-DD'
  heightCm:        real('height_cm'),
  activityLevel:   text('activity_level'),                   // 'light' | 'moderate' | 'active'
  goal:            text('goal'),                             // 'cut' | 'maintain' | 'bulk'
  trainingSplit:   text('training_split'),                   // 'ppl' | 'upper_lower' | 'full_body' | 'custom'

  // Targets
  kcalTarget:      integer('kcal_target'),
  proteinTargetG:  integer('protein_target_g'),
  carbsTargetG:    integer('carbs_target_g'),
  fatTargetG:      integer('fat_target_g'),
  waterTargetMl:   integer('water_target_ml').default(3000),
  goalWeightKg:    real('goal_weight_kg'),
  workoutsPerWeek: integer('workouts_per_week').default(4),
  targetsManual:   boolean('targets_manual').default(false), // true = user overrode the formula

  // Preferences
  weightUnit:      text('weight_unit').default('kg'),        // 'kg' | 'lb'
  energyUnit:      text('energy_unit').default('kcal'),      // 'kcal' | 'kj'
  timezone:        text('timezone').default('UTC'),          // IANA name
  weekStartsOn:    integer('week_starts_on').default(1),     // 1 = Monday … 7 = Sunday
  defaultRestSec:  integer('default_rest_sec').default(120),
  quietStart:      text('quiet_start').default('23:00'),
  quietEnd:        text('quiet_end').default('07:00'),

  // Chat conversation state (e.g. waiting for a weight after /weight)
  botState:        json('bot_state'),

  onboardedAt:     integer('onboarded_at', { mode: 'timestamp' }),
  createdAt:       integer('created_at', { mode: 'timestamp' }).default(now),
  updatedAt:       integer('updated_at', { mode: 'timestamp' }).default(now),
});

// ── Exercise library ────────────────────────────────────────────────────────────

export const exercises = table('exercises', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  userId:         integer('user_id').notNull().default(0),   // 0 = built-in
  name:           text('name').notNull(),
  aliases:        json('aliases'),                           // ['bench', 'bb bench']
  muscle:         text('muscle').notNull(),                  // 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'cardio' | 'full_body'
  secondaryMuscles: json('secondary_muscles'),               // ['triceps', 'shoulders']
  equipment:      text('equipment'),                         // 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band' | 'other'
  category:       text('category'),                          // 'compound' | 'isolation'
  trackType:      text('track_type').notNull().default('weight_reps'),
                  // 'weight_reps' | 'bodyweight_reps' | 'weighted_bodyweight' | 'duration' | 'distance_duration'
  defaultRestSec: integer('default_rest_sec'),               // null = user default
  notes:          text('notes'),                             // form cues
  link:           text('link'),                              // form video / article
  archivedAt:     integer('archived_at', { mode: 'timestamp' }), // soft delete: old sets still point here
  createdAt:      integer('created_at', { mode: 'timestamp' }).default(now),
}, (t) => ({
  byUser:     index('idx_exercises_user').on(t.userId, t.muscle),
  uniqueName: uniqueIndex('uidx_exercises_user_name').on(t.userId, sql`lower(${t.name})`),
}));

// ── Routines & schedule ─────────────────────────────────────────────────────────

export const routines = table('routines', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  userId:     integer('user_id').notNull(),
  name:       text('name').notNull(),                        // 'Push A'
  notes:      text('notes'),
  position:   integer('position').notNull().default(0),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt:  integer('created_at', { mode: 'timestamp' }).default(now),
  updatedAt:  integer('updated_at', { mode: 'timestamp' }).default(now),
}, (t) => ({
  byUser: index('idx_routines_user').on(t.userId, t.position),
}));

export const routineExercises = table('routine_exercises', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  userId:         integer('user_id').notNull(),
  routineId:      integer('routine_id').notNull(),
  exerciseId:     integer('exercise_id').notNull(),
  position:       integer('position').notNull().default(0),
  supersetGroup:  integer('superset_group'),                 // same number = done back-to-back
  targetSets:     integer('target_sets').notNull().default(3),
  targetRepsMin:  integer('target_reps_min'),
  targetRepsMax:  integer('target_reps_max'),                // 8–12 range; equal to min for fixed reps
  targetWeightKg: real('target_weight_kg'),                  // advanced by progression rules
  targetDurationSec: integer('target_duration_sec'),
  restSec:        integer('rest_sec'),
  autoProgress:   boolean('auto_progress').default(true),    // all target reps hit → add increment
  incrementKg:    real('increment_kg').default(2.5),
  notes:          text('notes'),
}, (t) => ({
  byRoutine: index('idx_routine_exercises_routine').on(t.routineId, t.position),
  byUser:    index('idx_routine_exercises_user').on(t.userId),
}));

// One row per weekday; routine_id null = rest day.
export const schedule = table('schedule', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  userId:    integer('user_id').notNull(),
  weekday:   integer('weekday').notNull(),                   // 1 = Monday … 7 = Sunday
  routineId: integer('routine_id'),
}, (t) => ({
  uniqueDay: uniqueIndex('uidx_schedule_user_day').on(t.userId, t.weekday),
}));

// ── Workouts ────────────────────────────────────────────────────────────────────

export const workouts = table('workouts', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  userId:        integer('user_id').notNull(),
  routineId:     integer('routine_id'),                      // null = empty / ad-hoc workout
  name:          text('name').notNull(),
  localDate:     text('local_date').notNull(),
  startedAt:     integer('started_at', { mode: 'timestamp' }).notNull().default(now),
  endedAt:       integer('ended_at', { mode: 'timestamp' }), // null = in progress
  notes:         text('notes'),

  // Rest timer — the Mini App counts down itself; the bot uses these for the chat ping
  restEndsAt:    integer('rest_ends_at', { mode: 'timestamp' }),
  chatMessageId: integer('chat_message_id'),                 // live "current workout" message in chat

  // Filled in when the workout is finished
  durationSec:   integer('duration_sec'),
  totalVolumeKg: real('total_volume_kg'),
  totalSets:     integer('total_sets'),
  createdAt:     integer('created_at', { mode: 'timestamp' }).default(now),
}, (t) => ({
  byUserDate: index('idx_workouts_user_date').on(t.userId, t.localDate),
  active:     uniqueIndex('uidx_workouts_active').on(t.userId).where(sql`ended_at IS NULL`), // one open workout per user
}));

export const workoutExercises = table('workout_exercises', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  userId:        integer('user_id').notNull(),
  workoutId:     integer('workout_id').notNull(),
  exerciseId:    integer('exercise_id').notNull(),
  routineExerciseId: integer('routine_exercise_id'),         // where the targets came from
  position:      integer('position').notNull().default(0),
  supersetGroup: integer('superset_group'),
  restSec:       integer('rest_sec'),
  notes:         text('notes'),
}, (t) => ({
  byWorkout: index('idx_workout_exercises_workout').on(t.workoutId, t.position),
  byUser:    index('idx_workout_exercises_user').on(t.userId),
}));

export const sets = table('sets', {
  id:                integer('id').primaryKey({ autoIncrement: true }),
  userId:            integer('user_id').notNull(),
  workoutId:         integer('workout_id').notNull(),
  workoutExerciseId: integer('workout_exercise_id').notNull(),
  exerciseId:        integer('exercise_id').notNull(),       // copied for history / PR queries
  position:          integer('position').notNull().default(0),
  setType:           text('set_type').notNull().default('working'), // 'warmup' | 'working' | 'drop' | 'failure'
  weightKg:          real('weight_kg'),                      // added load for weighted bodyweight
  reps:              integer('reps'),
  durationSec:       integer('duration_sec'),
  distanceM:         real('distance_m'),
  kcal:              integer('kcal'),                        // cardio, if the user enters it
  rpe:               real('rpe'),
  rir:               integer('rir'),
  e1rmKg:            real('e1rm_kg'),                        // Epley, computed on save (working sets with reps ≤ 12)
  completed:         boolean('completed').notNull().default(false),
  completedAt:       integer('completed_at', { mode: 'timestamp' }),
  createdAt:         integer('created_at', { mode: 'timestamp' }).default(now),
}, (t) => ({
  byWorkoutExercise: index('idx_sets_workout_exercise').on(t.workoutExerciseId, t.position),
  byWorkout:         index('idx_sets_workout').on(t.workoutId),
  history:           index('idx_sets_user_exercise').on(t.userId, t.exerciseId, t.completedAt),
}));

// Append-only: a row each time a record is beaten. Current record = latest row per
// (user, exercise, type[, weight]). Drives PR alerts and the PR history list.
export const personalRecords = table('personal_records', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  userId:     integer('user_id').notNull(),
  exerciseId: integer('exercise_id').notNull(),
  type:       text('type').notNull(),
              // 'max_weight' | 'e1rm' | 'reps_at_weight' | 'max_reps' | 'session_volume' | 'max_duration' | 'max_distance'
  value:      real('value').notNull(),                       // kg, reps, kg·reps, seconds or metres
  weightKg:   real('weight_kg'),                             // the weight for 'reps_at_weight'
  reps:       integer('reps'),
  setId:      integer('set_id'),
  workoutId:  integer('workout_id'),
  achievedAt: integer('achieved_at', { mode: 'timestamp' }).notNull().default(now),
}, (t) => ({
  lookup: index('idx_prs_user_exercise_type').on(t.userId, t.exerciseId, t.type, t.achievedAt),
}));

// ── Nutrition ───────────────────────────────────────────────────────────────────

// Built-in foods, Open Food Facts cache (user_id 0) and the user's own foods/recipes.
// Nutrition is per 100 g (or 100 ml); a serving says how many grams one portion is.
export const foods = table('foods', {
  id:              integer('id').primaryKey({ autoIncrement: true }),
  userId:          integer('user_id').notNull().default(0),
  source:          text('source').notNull(),                 // 'builtin' | 'off' | 'custom' | 'recipe'
  barcode:         text('barcode'),
  name:            text('name').notNull(),
  brand:           text('brand'),
  baseUnit:        text('base_unit').notNull().default('g'), // 'g' | 'ml'
  kcalPer100:      real('kcal_per_100').notNull(),
  proteinPer100:   real('protein_per_100').notNull().default(0),
  carbsPer100:     real('carbs_per_100').notNull().default(0),
  fatPer100:       real('fat_per_100').notNull().default(0),
  fiberPer100:     real('fiber_per_100'),
  sugarPer100:     real('sugar_per_100'),
  servingLabel:    text('serving_label'),                    // '1 medium', '1 scoop'
  servingGrams:    real('serving_grams'),
  archivedAt:      integer('archived_at', { mode: 'timestamp' }),
  createdAt:       integer('created_at', { mode: 'timestamp' }).default(now),
  updatedAt:       integer('updated_at', { mode: 'timestamp' }).default(now),
}, (t) => ({
  byUserName: index('idx_foods_user_name').on(t.userId, sql`lower(${t.name})`),
  barcode:    index('idx_foods_barcode').on(t.barcode).where(sql`barcode IS NOT NULL`),
}));

// Ingredients of a recipe (a foods row with source 'recipe'). The recipe's per-100 g
// values are recomputed from these whenever they change.
export const recipeItems = table('recipe_items', {
  id:       integer('id').primaryKey({ autoIncrement: true }),
  userId:   integer('user_id').notNull(),
  recipeId: integer('recipe_id').notNull(),
  foodId:   integer('food_id').notNull(),
  grams:    real('grams').notNull(),
  position: integer('position').notNull().default(0),
}, (t) => ({
  byRecipe: index('idx_recipe_items_recipe').on(t.recipeId),
  byUser:   index('idx_recipe_items_user').on(t.userId),
}));

export const favoriteFoods = table('favorite_foods', {
  userId:    integer('user_id').notNull(),
  foodId:    integer('food_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(now),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.foodId] }),
}));

// Each entry keeps a snapshot of name and nutrition, so editing or deleting a food
// never changes past days. food_id is null for quick-add entries.
export const foodLogs = table('food_logs', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  userId:    integer('user_id').notNull(),
  localDate: text('local_date').notNull(),
  meal:      text('meal').notNull(),                         // 'breakfast' | 'snack_am' | 'lunch' | 'snack_pm' | 'dinner' | 'snack'
  foodId:    integer('food_id'),
  name:      text('name').notNull(),
  quantity:  real('quantity'),                               // as entered: 2 (servings), 200 (g)
  unit:      text('unit'),                                   // 'g' | 'ml' | 'serving'
  grams:     real('grams'),
  kcal:      real('kcal').notNull(),
  proteinG:  real('protein_g').notNull().default(0),
  carbsG:    real('carbs_g').notNull().default(0),
  fatG:      real('fat_g').notNull().default(0),
  loggedAt:  integer('logged_at', { mode: 'timestamp' }).notNull().default(now),
}, (t) => ({
  byUserDate: index('idx_food_logs_user_date').on(t.userId, t.localDate, t.meal),
  recent:     index('idx_food_logs_user_food').on(t.userId, t.foodId, t.loggedAt),
}));

export const waterLogs = table('water_logs', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  userId:    integer('user_id').notNull(),
  localDate: text('local_date').notNull(),
  amountMl:  integer('amount_ml').notNull(),
  loggedAt:  integer('logged_at', { mode: 'timestamp' }).notNull().default(now),
}, (t) => ({
  byUserDate: index('idx_water_logs_user_date').on(t.userId, t.localDate),
}));

// ── Body ────────────────────────────────────────────────────────────────────────

// One weigh-in per day; logging again the same day overwrites it.
export const bodyWeights = table('body_weights', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  userId:     integer('user_id').notNull(),
  localDate:  text('local_date').notNull(),
  weightKg:   real('weight_kg').notNull(),
  note:       text('note'),
  measuredAt: integer('measured_at', { mode: 'timestamp' }).notNull().default(now),
}, (t) => ({
  uniqueDay: uniqueIndex('uidx_body_weights_user_date').on(t.userId, t.localDate),
}));

// One row per measuring day; any field may be empty.
export const bodyMeasurements = table('body_measurements', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  userId:     integer('user_id').notNull(),
  localDate:  text('local_date').notNull(),
  waistCm:    real('waist_cm'),
  chestCm:    real('chest_cm'),
  armsCm:     real('arms_cm'),
  thighsCm:   real('thighs_cm'),
  hipsCm:     real('hips_cm'),
  neckCm:     real('neck_cm'),
  bodyFatPct: real('body_fat_pct'),
  measuredAt: integer('measured_at', { mode: 'timestamp' }).notNull().default(now),
}, (t) => ({
  uniqueDay: uniqueIndex('uidx_body_measurements_user_date').on(t.userId, t.localDate),
}));

// Photos stay on Telegram's servers; we keep the file_id (no storage cost).
export const progressPhotos = table('progress_photos', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  userId:       integer('user_id').notNull(),
  localDate:    text('local_date').notNull(),
  pose:         text('pose').notNull().default('front'),     // 'front' | 'side' | 'back'
  fileId:       text('file_id').notNull(),
  fileUniqueId: text('file_unique_id').notNull(),
  width:        integer('width'),
  height:       integer('height'),
  createdAt:    integer('created_at', { mode: 'timestamp' }).default(now),
}, (t) => ({
  byUserDate: index('idx_progress_photos_user_date').on(t.userId, t.localDate),
}));

// ── Reminders ───────────────────────────────────────────────────────────────────

// One row per reminder type per user. next_run_at is precomputed (UTC) so the
// scheduler only has to ask "which enabled reminders are due?".
export const reminders = table('reminders', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  userId:     integer('user_id').notNull(),
  type:       text('type').notNull(),
              // 'meal' | 'weigh_in' | 'workout_day' | 'missed_muscle' | 'weekly_summary'
  enabled:    boolean('enabled').notNull().default(true),
  times:      json('times'),                                 // ['12:30', '19:30'] local time
  weekdays:   json('weekdays'),                              // [1..7]; null = every day
  params:     json('params'),                                // e.g. { days: 7 } for missed_muscle
  nextRunAt:  integer('next_run_at', { mode: 'timestamp' }),
  lastSentAt: integer('last_sent_at', { mode: 'timestamp' }),
}, (t) => ({
  uniqueType: uniqueIndex('uidx_reminders_user_type').on(t.userId, t.type),
  due:        index('idx_reminders_due').on(t.nextRunAt).where(sql`enabled = 1`),
}));
