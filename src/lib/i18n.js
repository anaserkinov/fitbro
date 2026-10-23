import { translator, mergeDicts, pickLanguage } from '../../tgcloud/lib/i18n/core.js';
import { catalogName } from '../../tgcloud/lib/i18n/catalog.js';
import shared from '../../tgcloud/lib/i18n/shared.js';
import { telegramUser } from './tg.js';
import common from '../i18n/common.js';
import account from '../i18n/account.js';
import workout from '../i18n/workout.js';
import food from '../i18n/food.js';
import progress from '../i18n/progress.js';
import guides from '../i18n/guides.js';

// The Mini App's translator. One module-level language, set from the signed-in user
// by UserProvider before each render — so call t() at render time, never in a
// module-level constant. See docs/i18n.md.

const DICT = mergeDicts(shared, common, account, workout, food, progress, guides);

let current = translator(pickLanguage(telegramUser?.language_code), DICT);

export function setLanguage(lang) {
  if (current.lang === lang) return;
  current = translator(lang || 'en', DICT);
  document.documentElement.lang = current.lang;
}

export const t = (key, vars) => current(key, vars);
t.n = (n, one, other, vars) => current.n(n, one, other, vars);

export const lang = () => current.lang;

// Built-in exercise / food names in the user's language; other names unchanged.
export const cname = (name) => catalogName(current.lang, name);
