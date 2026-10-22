import { round } from './units.js';
import { translator } from './i18n/core.js';

const EN = translator('en', {});

// Pure training maths. Sets here are rows of the `sets` table (camelCase keys).

const MAX_E1RM_REPS = 12;   // Epley gets unreliable above this

// Estimated one-rep max (Epley). null when it can't be estimated.
export function e1rm(weightKg, reps) {
  if (!weightKg || weightKg <= 0 || !reps || reps < 1 || reps > MAX_E1RM_REPS) return null;
  if (reps === 1) return round(weightKg, 1);
  return round(weightKg * (1 + reps / 30), 1);
}

export function isWorkSet(set) {
  return set.completed && set.setType !== 'warmup';
}

// Only exercises with an external load count toward volume (kg × reps).
export function setVolume(set, trackType) {
  if (trackType !== 'weight_reps' && trackType !== 'weighted_bodyweight') return 0;
  if (!set.weightKg || !set.reps) return 0;
  return set.weightKg * set.reps;
}

// sets: [{ ...set, trackType }]
export function summarizeSets(sets) {
  let totalSets = 0;
  let totalVolumeKg = 0;
  for (const s of sets) {
    if (!isWorkSet(s)) continue;
    totalSets += 1;
    totalVolumeKg += setVolume(s, s.trackType);
  }
  return { totalSets, totalVolumeKg: round(totalVolumeKg, 1) };
}

// Which record types a completed set can set, as [{ type, value, weightKg?, reps? }].
export function prCandidates(set, trackType) {
  if (!isWorkSet(set)) return [];
  const out = [];
  if (trackType === 'weight_reps' || trackType === 'weighted_bodyweight') {
    if (set.weightKg > 0 && set.reps > 0) {
      out.push({ type: 'max_weight', value: set.weightKg, weightKg: set.weightKg, reps: set.reps });
      out.push({ type: 'reps_at_weight', value: set.reps, weightKg: round(set.weightKg, 2), reps: set.reps });
      const est = e1rm(set.weightKg, set.reps);
      if (est) out.push({ type: 'e1rm', value: est, weightKg: set.weightKg, reps: set.reps });
    } else if (trackType === 'weighted_bodyweight' && set.reps > 0) {
      out.push({ type: 'max_reps', value: set.reps, reps: set.reps });
    }
  } else if (trackType === 'bodyweight_reps') {
    if (set.reps > 0) out.push({ type: 'max_reps', value: set.reps, reps: set.reps });
  } else if (trackType === 'duration') {
    if (set.durationSec > 0) out.push({ type: 'max_duration', value: set.durationSec });
  } else if (trackType === 'distance_duration') {
    if (set.distanceM > 0) out.push({ type: 'max_distance', value: set.distanceM });
  }
  return out;
}

// Human label for a PR, e.g. 'Heaviest set: 85 kg × 3'. `fmt` formats kg for the user;
// `t` translates (the strings live in lib/i18n/shared.js).
export function describePr(pr, fmt, t = EN) {
  switch (pr.type) {
    case 'max_weight':     return t('Heaviest set: {w} × {reps}', { w: fmt(pr.value), reps: pr.reps });
    case 'e1rm':           return t('Estimated 1RM: {w}', { w: fmt(pr.value) });
    case 'reps_at_weight': return t('Most reps at {w}: {n}', { w: fmt(pr.weightKg), n: pr.value });
    case 'max_reps':       return t('Most reps: {n}', { n: pr.value });
    case 'session_volume': return t('Best session volume: {w}', { w: fmt(pr.value) });
    case 'max_duration':   return t('Longest: {time}', { time: `${Math.floor(pr.value / 60)}:${String(pr.value % 60).padStart(2, '0')}` });
    case 'max_distance':   return t('Longest distance: {km} km', { km: round(pr.value / 1000, 2) });
    default:               return pr.type;
  }
}
