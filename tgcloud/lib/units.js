// Storage is always kg / kcal; these convert at the edges and format for display.

export const LB_PER_KG = 2.20462262185;
export const KJ_PER_KCAL = 4.184;

export function round(n, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function toKg(value, unit) {
  return unit === 'lb' ? value / LB_PER_KG : value;
}

export function fromKg(kg, unit) {
  return unit === 'lb' ? kg * LB_PER_KG : kg;
}

export function toKcal(value, unit) {
  return unit === 'kj' ? value / KJ_PER_KCAL : value;
}

export function fromKcal(kcal, unit) {
  return unit === 'kj' ? kcal * KJ_PER_KCAL : kcal;
}

// 12345.6 → '12,346'. Hand-rolled so it doesn't depend on locale data.
export function thousands(n, digits = 0) {
  const fixed = Math.abs(n).toFixed(digits);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '−' : '') + grouped + (frac ? '.' + frac : '');
}

// Drops a trailing '.0' so 80 kg reads '80', 82.4 stays '82.4'.
function trim(n, digits) {
  const s = thousands(n, digits);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

export function formatWeight(kg, unit = 'kg', { digits = 1, suffix = true } = {}) {
  if (kg === null || kg === undefined) return '—';
  const s = trim(fromKg(kg, unit), digits);
  return suffix ? `${s} ${unit}` : s;
}

export function formatEnergy(kcal, unit = 'kcal', { suffix = true } = {}) {
  if (kcal === null || kcal === undefined) return '—';
  const s = thousands(fromKcal(kcal, unit), 0);
  return suffix ? `${s} ${unit === 'kj' ? 'kJ' : 'kcal'}` : s;
}

export function formatDuration(sec) {
  if (!sec && sec !== 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
