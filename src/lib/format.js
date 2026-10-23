import { formatWeight, formatEnergy, fromKg, toKg, fromKcal, round, thousands, formatDuration, unitLabel } from '../../tgcloud/lib/units.js';
import { t, lang } from './i18n.js';

// Unit-aware formatting for the signed-in user. Data from the API is kg / kcal.
// `weightUnit` stays the internal 'kg' | 'lb'; `weightLabel` / `energyUnit` are for display.
export function makeFmt(user) {
  const wu = user?.weightUnit || 'kg';
  const eu = user?.energyUnit || 'kcal';
  const lg = user?.language || 'en';
  return {
    weightUnit: wu,
    weightLabel: unitLabel(wu, lg),
    energyUnit: unitLabel(eu, lg),
    w: (kg, opts) => formatWeight(kg, wu, { lang: lg, ...opts }),
    wNum: (kg) => (kg === null || kg === undefined ? null : round(fromKg(kg, wu), wu === 'lb' ? 1 : 2)),
    toKg: (v) => (v === null || v === undefined ? null : round(toKg(v, wu), 3)),
    e: (kcal, opts) => formatEnergy(kcal, eu, { lang: lg, ...opts }),
    eNum: (kcal) => (kcal === null || kcal === undefined ? null : Math.round(fromKcal(kcal, eu))),
    n: (v, d = 0) => (v === null || v === undefined ? '—' : thousands(v, d, lg)),
    g: (v) => (v === null || v === undefined ? '—' : `${Math.round(v)} ${unitLabel('g', lg)}`),
    dur: formatDuration,
    plateStep: wu === 'lb' ? 5 : 2.5,
  };
}

export const signed = (v, d = 1) => (v === null || v === undefined ? '' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`);

// Dates. Uzbek names are spelled out: Intl's 'uz' data is missing on some WebViews.
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const UZ_WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
const UZ_WD_SHORT = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const LOCALE = { en: 'en-GB', ru: 'ru-RU' };
const fmts = {};
function intl(kind, opts) {
  const l = lang();
  const k = `${l}:${kind}`;
  if (!fmts[k]) fmts[k] = new Intl.DateTimeFormat(LOCALE[l] || 'en-GB', { ...opts, timeZone: 'UTC' });
  return fmts[k];
}
const asDate = (d) => new Date(`${d}T00:00:00Z`);

// Thursday, 22 October · четверг, 22 октября · Payshanba, 22-oktabr
export function longDay(d) {
  const x = asDate(d);
  if (lang() === 'uz') return `${cap(UZ_WEEKDAYS[x.getUTCDay()])}, ${x.getUTCDate()}-${UZ_MONTHS[x.getUTCMonth()]}`;
  return cap(intl('day', { weekday: 'long', day: 'numeric', month: 'long' }).format(x));
}

// 22 Oct · 22 окт. · 22-okt
export function shortDay(d) {
  const x = asDate(d);
  if (lang() === 'uz') return `${x.getUTCDate()}-${UZ_MONTHS[x.getUTCMonth()].slice(0, 3)}`;
  return intl('short', { day: 'numeric', month: 'short' }).format(x);
}

// Thu · чт · Pa
export function weekdayShort(d) {
  const x = asDate(d);
  if (lang() === 'uz') return UZ_WD_SHORT[x.getUTCDay()];
  return intl('wd', { weekday: 'short' }).format(x);
}

// October 2026 · Октябрь 2026 · Oktabr 2026
export function monthName(ym) {
  const x = asDate(`${ym}-01`);
  if (lang() === 'uz') return `${cap(UZ_MONTHS[x.getUTCMonth()])} ${x.getUTCFullYear()}`;
  if (lang() === 'ru') return `${cap(intl('month', { month: 'long' }).format(x))} ${x.getUTCFullYear()}`;   // standalone 'октябрь'
  return intl('month', { month: 'long', year: 'numeric' }).format(x);
}

export function relativeDay(d, today) {
  if (d === today) return t('Today');
  const diff = Math.round((asDate(today) - asDate(d)) / 86400000);
  if (diff === 1) return t('Yesterday');
  if (diff === -1) return t('Tomorrow');
  return `${weekdayShort(d)} ${shortDay(d)}`;
}

// English labels — they're also the translation keys, so wrap at display: t(MEAL_LABEL[m]).
export const MEAL_LABEL = { breakfast: 'Breakfast', snack_am: 'Morning snack', lunch: 'Lunch', snack_pm: 'Afternoon snack', dinner: 'Dinner', snack: 'Evening snack' };
export const MEAL_COLOR = { breakfast: '#E8890C', snack_am: '#8E5BD8', lunch: '#23843F', snack_pm: '#8E5BD8', dinner: '#1E73BE', snack: '#8E5BD8' };
export const MUSCLE_LABEL = { chest: 'Chest', back: 'Back', legs: 'Legs', shoulders: 'Shoulders', arms: 'Arms', core: 'Core', cardio: 'Cardio', full_body: 'Full body' };
export const MUSCLE_TINT = {
  chest: ['#E8F1FA', '#165A96'], back: ['#E6F4EA', '#1D6E35'], legs: ['#FDEFD9', '#8A4B00'], shoulders: ['#EFE7FB', '#5B36A0'],
  arms: ['#FCE8EC', '#9B2340'], core: ['#E3F4F7', '#0E5C6B'], cardio: ['#FFE9E3', '#9A3412'], full_body: ['#ECECF1', '#3C3C43'],
};
