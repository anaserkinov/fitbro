import { EndpointError } from 'sdk';

// Input validation shared by endpoints and chat handlers. Every failure throws an
// EndpointError with { code: 'INVALID_INPUT', field }, which endpoints pass straight
// to the Mini App and handlers turn into a chat reply.

export const ENUMS = {
  sex:           ['male', 'female'],
  activityLevel: ['light', 'moderate', 'active'],
  goal:          ['cut', 'maintain', 'bulk'],
  trainingSplit: ['ppl', 'upper_lower', 'full_body', 'custom'],
  weightUnit:    ['kg', 'lb'],
  energyUnit:    ['kcal', 'kj'],
  language:      ['en', 'ru', 'uz'],
  muscle:        ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio', 'full_body'],
  equipment:     ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other'],
  category:      ['compound', 'isolation'],
  trackType:     ['weight_reps', 'bodyweight_reps', 'weighted_bodyweight', 'duration', 'distance_duration'],
  setType:       ['warmup', 'working', 'drop', 'failure'],
  meal:          ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'snack'],
  foodUnit:      ['g', 'ml', 'serving'],
  baseUnit:      ['g', 'ml'],
  pose:          ['front', 'side', 'back'],
  reminderType:  ['meal', 'weigh_in', 'workout_day', 'missed_muscle', 'weekly_summary'],
};

export function invalid(message, field) {
  throw new EndpointError(message, { code: 'INVALID_INPUT', field: field ?? null });
}

export function notFound(what) {
  throw new EndpointError(`${what} not found`, { code: 'NOT_FOUND' });
}

export function isEndpointError(e) {
  return e instanceof EndpointError;
}

const isMissing = (v) => v === undefined || v === null || v === '';

export function oneOf(value, enumName, field = enumName, { optional = false } = {}) {
  if (isMissing(value)) return optional ? null : invalid(`${field} is required`, field);
  if (!ENUMS[enumName].includes(value)) {
    invalid(`${field} must be one of: ${ENUMS[enumName].join(', ')}`, field);
  }
  return value;
}

export function num(value, field, { min = -Infinity, max = Infinity, int = false, optional = false } = {}) {
  if (isMissing(value)) return optional ? null : invalid(`${field} is required`, field);
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) invalid(`${field} must be a number`, field);
  if (int && !Number.isInteger(n)) invalid(`${field} must be a whole number`, field);
  if (n < min || n > max) invalid(`${field} must be between ${min} and ${max}`, field);
  return n;
}

export function id(value, field = 'id', opts = {}) {
  return num(value, field, { min: 1, int: true, ...opts });
}

export function str(value, field, { max = 200, optional = false } = {}) {
  if (isMissing(value)) return optional ? null : invalid(`${field} is required`, field);
  if (typeof value !== 'string') invalid(`${field} must be text`, field);
  const s = value.trim();
  if (!s) return optional ? null : invalid(`${field} is required`, field);
  if (s.length > max) invalid(`${field} must be at most ${max} characters`, field);
  return s;
}

export function bool(value, field, { optional = false } = {}) {
  if (isMissing(value)) return optional ? null : invalid(`${field} is required`, field);
  if (typeof value !== 'boolean') invalid(`${field} must be true or false`, field);
  return value;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function date(value, field = 'date', { optional = false } = {}) {
  if (isMissing(value)) return optional ? null : invalid(`${field} is required`, field);
  const m = typeof value === 'string' && DATE_RE.exec(value);
  if (!m) invalid(`${field} must be YYYY-MM-DD`, field);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) invalid(`${field} is not a real date`, field);
  return value;
}

export function time(value, field = 'time', { optional = false } = {}) {
  if (isMissing(value)) return optional ? null : invalid(`${field} is required`, field);
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) invalid(`${field} must be HH:MM`, field);
  return value;
}

export function list(value, field, itemCheck, { max = 50, optional = false } = {}) {
  if (isMissing(value)) return optional ? null : invalid(`${field} is required`, field);
  if (!Array.isArray(value)) invalid(`${field} must be a list`, field);
  if (value.length > max) invalid(`${field} can have at most ${max} items`, field);
  return value.map((v, i) => itemCheck(v, `${field}[${i}]`));
}

// Validates only the keys present in `input`, using `spec` = { key: (value, key) => clean }.
// Unknown keys are rejected so typos don't silently do nothing.
export function patch(input, spec) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Expected an object');
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(key in spec)) invalid(`Unknown field: ${key}`, key);
    out[key] = spec[key](value, key);
  }
  return out;
}
