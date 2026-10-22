import { round } from './units.js';

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

// Human label for a PR, e.g. 'Heaviest set: 85 kg × 3'. `fmt` formats kg for the user.
export function describePr(pr, fmt) {
  switch (pr.type) {
    case 'max_weight':     return `Heaviest set: ${fmt(pr.value)} × ${pr.reps}`;
    case 'e1rm':           return `Estimated 1RM: ${fmt(pr.value)}`;
    case 'reps_at_weight': return `Most reps at ${fmt(pr.weightKg)}: ${pr.value}`;
    case 'max_reps':       return `Most reps: ${pr.value}`;
    case 'session_volume': return `Best session volume: ${fmt(pr.value)}`;
    case 'max_duration':   return `Longest: ${Math.floor(pr.value / 60)}:${String(pr.value % 60).padStart(2, '0')}`;
    case 'max_distance':   return `Longest distance: ${round(pr.value / 1000, 2)} km`;
    default:               return pr.type;
  }
}
