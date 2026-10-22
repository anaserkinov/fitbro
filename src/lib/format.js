import { formatWeight, formatEnergy, fromKg, toKg, fromKcal, round, thousands, formatDuration } from '../../tgcloud/lib/units.js';

// Unit-aware formatting for the signed-in user. Data from the API is kg / kcal.
export function makeFmt(user) {
  const wu = user?.weightUnit || 'kg';
  const eu = user?.energyUnit || 'kcal';
  return {
    weightUnit: wu,
    energyUnit: eu === 'kj' ? 'kJ' : 'kcal',
    w: (kg, opts) => formatWeight(kg, wu, opts),
    wNum: (kg) => (kg === null || kg === undefined ? null : round(fromKg(kg, wu), wu === 'lb' ? 1 : 2)),
    toKg: (v) => (v === null || v === undefined ? null : round(toKg(v, wu), 3)),
    e: (kcal, opts) => formatEnergy(kcal, eu, opts),
    eNum: (kcal) => (kcal === null || kcal === undefined ? null : Math.round(fromKcal(kcal, eu))),
    n: (v, d = 0) => (v === null || v === undefined ? '—' : thousands(v, d)),
    g: (v) => (v === null || v === undefined ? '—' : `${Math.round(v)} g`),
    dur: formatDuration,
    plateStep: wu === 'lb' ? 5 : 2.5,
  };
}

export const signed = (v, d = 1) => (v === null || v === undefined ? '' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`);

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const wdFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const asDate = (d) => new Date(`${d}T00:00:00Z`);

export const longDay = (d) => dayFmt.format(asDate(d));                 // Thursday, 22 October
export const shortDay = (d) => shortFmt.format(asDate(d));              // 22 Oct
export const weekdayShort = (d) => wdFmt.format(asDate(d));             // Thu
export const monthName = (ym) => monthFmt.format(asDate(`${ym}-01`));   // October 2026

export function relativeDay(d, today) {
  if (d === today) return 'Today';
  const diff = Math.round((asDate(today) - asDate(d)) / 86400000);
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  return `${weekdayShort(d)} ${shortDay(d)}`;
}

export const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
export const MEAL_COLOR = { breakfast: '#E8890C', lunch: '#23843F', dinner: '#1E73BE', snack: '#8E5BD8' };
export const MUSCLE_LABEL = { chest: 'Chest', back: 'Back', legs: 'Legs', shoulders: 'Shoulders', arms: 'Arms', core: 'Core', cardio: 'Cardio', full_body: 'Full body' };
export const MUSCLE_TINT = {
  chest: ['#E8F1FA', '#165A96'], back: ['#E6F4EA', '#1D6E35'], legs: ['#FDEFD9', '#8A4B00'], shoulders: ['#EFE7FB', '#5B36A0'],
  arms: ['#FCE8EC', '#9B2340'], core: ['#E3F4F7', '#0E5C6B'], cardio: ['#FFE9E3', '#9A3412'], full_body: ['#ECECF1', '#3C3C43'],
};
