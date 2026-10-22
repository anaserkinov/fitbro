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

// Unit symbols per language (English uses the internal names, kJ aside).
const UNIT_LABEL = {
  en: { kj: 'kJ' },
  ru: { kg: 'кг', lb: 'фнт', kcal: 'ккал', kj: 'кДж', g: 'г', ml: 'мл', l: 'л', km: 'км' },
  uz: { kcal: 'kkal', kj: 'kJ' },
};
export const unitLabel = (unit, lang = 'en') => (UNIT_LABEL[lang] || UNIT_LABEL.en)[unit] || UNIT_LABEL.en[unit] || unit;

// 12345.6 → '12,346' (en) or '12 346' (ru/uz, which also use a decimal comma).
// Hand-rolled so it doesn't depend on locale data.
export function thousands(n, digits = 0, lang = 'en') {
  const fixed = Math.abs(n).toFixed(digits);
  const [int, frac] = fixed.split('.');
  const en = lang === 'en';
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, en ? ',' : '\u202F');
  return (n < 0 ? '−' : '') + grouped + (frac ? (en ? '.' : ',') + frac : '');
}

// Drops a trailing '.0' so 80 kg reads '80', 82.4 stays '82.4'.
function trim(n, digits, lang) {
  const s = thousands(n, digits, lang);
  const dot = lang === 'en' ? '.' : ',';
  return s.includes(dot) ? s.replace(dot === '.' ? /\.?0+$/ : /,?0+$/, '') : s;
}

export function formatWeight(kg, unit = 'kg', { digits = 1, suffix = true, lang = 'en' } = {}) {
  if (kg === null || kg === undefined) return '—';
  const s = trim(fromKg(kg, unit), digits, lang);
  return suffix ? `${s} ${unitLabel(unit, lang)}` : s;
}

export function formatEnergy(kcal, unit = 'kcal', { suffix = true, lang = 'en' } = {}) {
  if (kcal === null || kcal === undefined) return '—';
  const s = thousands(fromKcal(kcal, unit), 0, lang);
  return suffix ? `${s} ${unitLabel(unit, lang)}` : s;
}

export function formatDuration(sec) {
  if (!sec && sec !== 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
