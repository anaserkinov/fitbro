// Translation core, shared by the bot (tgcloud/) and the Mini App (src/).
//
// gettext style: the English text IS the key, so untranslated strings fall back to
// English and call sites stay readable. A dictionary is { ru: { key: value }, uz: {…} }.
//   t('Rest day')                               → 'День отдыха'
//   t('Saved {w}', { w: '82 kg' })              → 'Сохранил 82 kg'
//   t.n(3, '{n} set', '{n} sets')               → '3 подхода'
// Same English word, different meaning? Add a context: t('Back@pose') ('Сзади') vs
// t('Back') (the muscle group, 'Спина'). English shows the text before the '@'.
// Plural entries are keyed by the English *plural* form. Russian values are
// [one, few, many] (1 подход · 2 подхода · 5 подходов); Uzbek doesn't inflect
// after numbers (5 ta podxod), so its value is a plain string.

export const LANGUAGES = ['en', 'ru', 'uz'];
export const LANGUAGE_NAMES = { en: 'English', ru: 'Русский', uz: 'O‘zbekcha' };

// Telegram's language_code ('ru', 'uz', 'en-US', …) → a supported language.
export function pickLanguage(code) {
  const c = String(code || '').toLowerCase().slice(0, 2);
  return LANGUAGES.includes(c) ? c : 'en';
}

function ruForm(n) {
  if (!Number.isInteger(n)) return 1;
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return 2;
  if (b === 1) return 0;
  if (b >= 2 && b <= 4) return 1;
  return 2;
}

const bare = (key) => key.replace(/@[\w-]+$/, '');
const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

export function translator(lang, dict) {
  const d = (lang !== 'en' && dict[lang]) || {};
  const t = (key, vars) => {
    const v = d[key];
    return fill(typeof v === 'string' ? v : Array.isArray(v) ? v[2] : bare(key), vars);
  };
  t.n = (n, one, other, vars) => {
    const all = { n, ...vars };
    const v = d[other];
    if (v === undefined) return fill(bare(n === 1 ? one : other), all);
    return fill(Array.isArray(v) ? v[lang === 'ru' ? ruForm(n) : 0] : v, all);
  };
  t.lang = lang;
  return t;
}

// Merges dictionary parts ({ ru, uz } each) into one.
export function mergeDicts(...parts) {
  const out = {};
  for (const p of parts) for (const [lang, entries] of Object.entries(p)) out[lang] = { ...out[lang], ...entries };
  return out;
}
