import { translator, mergeDicts } from './core.js';
import shared from './shared.js';
import friends from './friends.js';

// Chat bot and reminder strings. tr(user) → t for that user's language. See docs/i18n.md.

export const BOT = {
  ru: {
    // Keyboard & buttons
    'Workout': 'Тренировка',
    'Today': 'Сегодня',
    'Weight': 'Вес',
    'Tap a button or send your weight': 'Жми кнопку или пришли свой вес',
    'Open FitPro': 'Открыть FitPro',
    'Open app': 'Открыть',
    'Open in app': 'Открыть в приложении',
    'See in app': 'Смотреть в приложении',
    'Compare in app': 'Сравнить в приложении',
    'Set up FitPro': 'Настроить FitPro',
    'Create a routine': 'Создать программу',
    'App': 'Приложение',
    'Undo': 'Отменить',

    // /start & help
    'Hey, {name}! I’m FitPro 💪': 'Привет, {name}! Я FitPro 💪',
    'Hey! I’m FitPro 💪': 'Привет! Я FitPro 💪',
    'Use the buttons below for quick things:': 'Кнопки внизу — для быстрых дел:',
    'tick off sets while you train': 'отмечай подходы прямо на тренировке',
    'calories, water, weight, plan': 'калории, вода, вес и план на день',
    'or just send a number like {sample}': 'или просто пришли число, например {sample}',
    'log a glass of water': 'записать стакан воды',
    'Send a photo to save it as a progress photo. Food logging, routines and charts live in the app.': 'Пришли фото — сохраню как фото прогресса. Дневник питания, программы и графики — в приложении.',
    'Everything else is in the app:': 'Всё остальное — в приложении:',
    'Start with a one-minute setup so I can set your daily targets:': 'Сначала быстрая настройка на минуту — посчитаю твои дневные нормы:',
    'First, a one-minute setup so I can set your daily targets 👇': 'Сначала минутная настройка — посчитаю твои дневные нормы 👇',
    'Tap a button below, send your weight (like {sample}) or a photo. Everything else is in the app.': 'Жми кнопку внизу, пришли свой вес (например {sample}) или фото. Всё остальное — в приложении.',
    'Okay, I’ll speak English from now on 👌': 'Окей, теперь говорю по-русски 👌',
    'Something went wrong — try again': 'Что-то пошло не так — попробуй ещё раз',

    // 📊 Today
    '{n} left': 'осталось {n}',
    '{n} over': 'перебор {n}',
    'P': 'Б',
    'C': 'У',
    'F': 'Ж',
    '{delta} this week': '{delta} за неделю',
    'In progress': 'Идёт',
    'Done ✓': 'Готово ✓',
    'Plan': 'План',
    'Rest day': 'День отдыха',
    '{n} exercises': ['{n} упражнение', '{n} упражнения', '{n} упражнений'],
    '{n}-day streak': ['{n} день подряд', '{n} дня подряд', '{n} дней подряд'],
    'Week: {done}/{target} workouts': 'Неделя: {done}/{target} тренировок',
    'Continue workout': 'Продолжить тренировку',
    'Start {name}': 'Начать {name}',

    // ⚖️ Weight
    'Send today’s weight — just the number, like {sample}': 'Пришли сегодняшний вес — просто число, например {sample}',
    'Saved {w}': 'Записал {w}',
    '7-day average {w}': 'Среднее за 7 дней {w}',
    '{delta} vs last week': '{delta} к прошлой неделе',
    'On pace for your goal by {date}': 'В таком темпе дойдёшь до цели к {date}',
    'Weigh-in removed.': 'Взвешивание удалено.',
    'Removed': 'Удалено',

    // 💧 Water
    '{total} / {target} L today': '{total} / {target} л сегодня',
    'Undone': 'Отменил',

    // 📷 Photos
    'Save this as a progress photo?': 'Сохранить как фото прогресса?',
    'Front@pose': 'Спереди',
    'Side@pose': 'Сбоку',
    'Back@pose': 'Сзади',
    'Okay, not saved.': 'Окей, не сохраняю.',
    'That photo expired — send it again.': 'Фото устарело — пришли его ещё раз.',
    'Saved as a front progress photo.': 'Сохранил как фото прогресса спереди.',
    'Saved as a side progress photo.': 'Сохранил как фото прогресса сбоку.',
    'Saved as a back progress photo.': 'Сохранил как фото прогресса сзади.',
    'Saved': 'Сохранено',

    // 🏋️ Workout card
    '{done}/{total} sets': '{done}/{total} подходов',
    'All planned sets done 💪': 'Все подходы сделаны 💪',
    'No exercises yet — add them in the app.': 'Упражнений пока нет — добавь их в приложении.',
    'Finish workout': 'Завершить тренировку',
    'warm-up': 'разминка',
    'drop set': 'дроп-сет',
    'Superset': 'Суперсет',
    'set {n} of {total}': 'подход {n} из {total}',
    'Last time': 'В прошлый раз',
    'reps': 'повт.',
    '{n} reps': ['{n} повтор', '{n} повтора', '{n} повторов'],
    'rep@short': 'повт.',
    'Done': 'Готово',
    'Skip set': 'Пропустить',
    'Next exercise': 'Следующее',
    'Finish': 'Завершить',
    'This workout is already finished — see it in the app.': 'Эта тренировка уже завершена — смотри в приложении.',
    'You have no routines yet. Create one in the app — e.g. “Push A” with bench, overhead press and dips.': 'Программ пока нет. Создай в приложении — например, «Жим A»: жим лёжа, жим стоя и брусья.',
    'Which workout?': 'Какую тренировку делаем?',
    'today': 'сегодня',
    'No workout running': 'Сейчас нет тренировки',
    'Workout started — let’s go.': 'Тренировка началась — погнали!',
    'Started': 'Погнали!',
    'That set is gone': 'Этого подхода уже нет',
    'Already done': 'Уже сделано',
    'New PR': 'Новый рекорд',
    'New PR!': 'Новый рекорд!',
    'Rest {time}': 'Отдых {time}',
    'Skipped': 'Пропущено',
    'Workout discarded — nothing was logged.': 'Тренировка отменена — ничего не записал.',
    'Discarded': 'Отменено',
    '{name} done': '{name} — готово',
    '{n} sets': ['{n} подход', '{n} подхода', '{n} подходов'],
    'New records': 'Новые рекорды',
    '{n} targets went up for next time': ['{n} цель на следующий раз выросла', '{n} цели на следующий раз выросли', '{n} целей на следующий раз выросли'],
    'Finished 💪': 'Красава 💪',

    // Reminders
    'Time to log your meal. Today so far: {eaten} of {target}.': 'Пора записать еду. Сегодня уже: {eaten} из {target}.',
    'Time to log your meal. Today so far: {eaten}.': 'Пора записать еду. Сегодня уже: {eaten}.',
    'Morning weigh-in. Send your weight, like {sample}, or log it in the app.': 'Утреннее взвешивание. Пришли вес, например {sample}, или запиши в приложении.',
    '{n} days': ['{n} день', '{n} дня', '{n} дней'],
    'Not trained lately: {list}.': 'Давно без нагрузки: {list}.',
    'Your week ({from} – {to})': 'Твоя неделя ({from} – {to})',
    'Workouts: {done} of {target}': 'Тренировок: {done} из {target}',
    'Volume: {v}': 'Объём: {v}',
    'Average intake: {v}': 'В среднем съедено: {v}',
    'New records: {n}': 'Новых рекордов: {n}',
    'Next set': 'Следующий подход',
    'Rest over — next: {next}': 'Отдых окончен — дальше: {next}',
    'Rest over': 'Отдых окончен',
  },

  uz: {
    // Keyboard & buttons
    'Workout': 'Mashg‘ulot',
    'Today': 'Bugun',
    'Weight': 'Vazn',
    'Tap a button or send your weight': 'Tugmani bosing yoki vazningizni yuboring',
    'Open FitPro': 'FitPro’ni ochish',
    'Open app': 'Ochish',
    'Open in app': 'Ilovada ochish',
    'See in app': 'Ilovada ko‘rish',
    'Compare in app': 'Ilovada solishtirish',
    'Set up FitPro': 'FitPro’ni sozlash',
    'Create a routine': 'Dastur yaratish',
    'App': 'Ilova',
    'Undo': 'Bekor qilish',

    // /start & help
    'Hey, {name}! I’m FitPro 💪': 'Salom, {name}! Men FitPro 💪',
    'Hey! I’m FitPro 💪': 'Salom! Men FitPro 💪',
    'Use the buttons below for quick things:': 'Pastdagi tugmalar — tezkor ishlar uchun:',
    'tick off sets while you train': 'mashg‘ulot paytida podxodlarni belgilab boring',
    'calories, water, weight, plan': 'kaloriya, suv, vazn va bugungi reja',
    'or just send a number like {sample}': 'yoki shunchaki raqam yuboring, masalan {sample}',
    'log a glass of water': 'bir stakan suvni yozib qo‘yish',
    'Send a photo to save it as a progress photo. Food logging, routines and charts live in the app.': 'Rasm yuborsangiz, progress surati sifatida saqlab qo‘yaman. Ovqat kundaligi, dasturlar va grafiklar — ilovada.',
    'Everything else is in the app:': 'Qolgan hammasi ilovada:',
    'Start with a one-minute setup so I can set your daily targets:': 'Avval bir daqiqalik sozlashdan o‘tamiz — kunlik me’yorlaringizni hisoblab beraman:',
    'First, a one-minute setup so I can set your daily targets 👇': 'Avval bir daqiqalik sozlash — kunlik me’yorlaringizni hisoblab beraman 👇',
    'Tap a button below, send your weight (like {sample}) or a photo. Everything else is in the app.': 'Pastdagi tugmani bosing, vazningizni (masalan {sample}) yoki rasm yuboring. Qolgan hammasi ilovada.',
    'Okay, I’ll speak English from now on 👌': 'Bo‘pti, endi o‘zbekcha gaplashamiz 👌',
    'Something went wrong — try again': 'Nimadir xato ketdi — qaytadan urinib ko‘ring',

    // 📊 Today
    '{n} left': '{n} qoldi',
    '{n} over': '{n} oshib ketdi',
    'P': 'O',
    'C': 'U',
    'F': 'Y',
    '{delta} this week': 'bu hafta {delta}',
    'In progress': 'Davom etmoqda',
    'Done ✓': 'Bajarildi ✓',
    'Plan': 'Reja',
    'Rest day': 'Dam olish kuni',
    '{n} exercises': '{n} ta mashq',
    '{n}-day streak': '{n} kun ketma-ket',
    'Week: {done}/{target} workouts': 'Hafta: {done}/{target} ta mashg‘ulot',
    'Continue workout': 'Mashg‘ulotni davom ettirish',
    'Start {name}': 'Boshlash: {name}',

    // ⚖️ Weight
    'Send today’s weight — just the number, like {sample}': 'Bugungi vazningizni yuboring — faqat raqam, masalan {sample}',
    'Saved {w}': '{w} saqlandi',
    '7-day average {w}': '7 kunlik o‘rtacha {w}',
    '{delta} vs last week': 'o‘tgan haftaga nisbatan {delta}',
    'On pace for your goal by {date}': 'Shu tempda maqsadingizga {date} yetasiz',
    'Weigh-in removed.': 'Vazn yozuvi o‘chirildi.',
    'Removed': 'O‘chirildi',

    // 💧 Water
    '{total} / {target} L today': 'bugun {total} / {target} l',
    'Undone': 'Bekor qilindi',

    // 📷 Photos
    'Save this as a progress photo?': 'Progress surati sifatida saqlaymi?',
    'Front@pose': 'Old',
    'Side@pose': 'Yon',
    'Back@pose': 'Orqa',
    'Okay, not saved.': 'Mayli, saqlamadim.',
    'That photo expired — send it again.': 'Rasm eskirib qoldi — qaytadan yuboring.',
    'Saved as a front progress photo.': 'Progress surati (old tomondan) saqlandi.',
    'Saved as a side progress photo.': 'Progress surati (yon tomondan) saqlandi.',
    'Saved as a back progress photo.': 'Progress surati (orqa tomondan) saqlandi.',
    'Saved': 'Saqlandi',

    // 🏋️ Workout card
    '{done}/{total} sets': '{done}/{total} podxod',
    'All planned sets done 💪': 'Rejadagi hamma podxodlar bajarildi 💪',
    'No exercises yet — add them in the app.': 'Hali mashq yo‘q — ilovada qo‘shing.',
    'Finish workout': 'Mashg‘ulotni tugatish',
    'warm-up': 'razminka',
    'drop set': 'drop-set',
    'Superset': 'Superset',
    'set {n} of {total}': '{total} tadan {n}-podxod',
    'Last time': 'O‘tgan safar',
    'reps': 'marta',
    '{n} reps': '{n} marta',
    'rep@short': 'marta',
    'Done': 'Bajarildi',
    'Skip set': 'O‘tkazib yuborish',
    'Next exercise': 'Keyingi mashq',
    'Finish': 'Tugatish',
    'This workout is already finished — see it in the app.': 'Bu mashg‘ulot allaqachon tugagan — ilovada ko‘ring.',
    'You have no routines yet. Create one in the app — e.g. “Push A” with bench, overhead press and dips.': 'Hali dasturingiz yo‘q. Ilovada yarating — masalan, «Push A»: yotib jim, tik turib jim va brus.',
    'Which workout?': 'Qaysi mashg‘ulot?',
    'today': 'bugun',
    'No workout running': 'Hozir mashg‘ulot yo‘q',
    'Workout started — let’s go.': 'Mashg‘ulot boshlandi — ketdik!',
    'Started': 'Ketdik!',
    'That set is gone': 'Bu podxod endi yo‘q',
    'Already done': 'Allaqachon bajarilgan',
    'New PR': 'Yangi rekord',
    'New PR!': 'Yangi rekord!',
    'Rest {time}': 'Dam olish {time}',
    'Skipped': 'O‘tkazib yuborildi',
    'Workout discarded — nothing was logged.': 'Mashg‘ulot bekor qilindi — hech narsa yozilmadi.',
    'Discarded': 'Bekor qilindi',
    '{name} done': '{name} — tamom',
    '{n} sets': '{n} ta podxod',
    'New records': 'Yangi rekordlar',
    '{n} targets went up for next time': 'Keyingi safar uchun {n} ta maqsad oshirildi',
    'Finished 💪': 'Barakalla 💪',

    // Reminders
    'Time to log your meal. Today so far: {eaten} of {target}.': 'Ovqatni yozib qo‘yish vaqti. Bugun hozircha: {eaten} / {target}.',
    'Time to log your meal. Today so far: {eaten}.': 'Ovqatni yozib qo‘yish vaqti. Bugun hozircha: {eaten}.',
    'Morning weigh-in. Send your weight, like {sample}, or log it in the app.': 'Ertalabki tortilish. Vazningizni yuboring, masalan {sample}, yoki ilovada yozing.',
    '{n} days': '{n} kun',
    'Not trained lately: {list}.': 'Ancha vaqtdan beri ishlanmagan: {list}.',
    'Your week ({from} – {to})': 'Haftangiz ({from} – {to})',
    'Workouts: {done} of {target}': 'Mashg‘ulotlar: {done} / {target}',
    'Volume: {v}': 'Hajm: {v}',
    'Average intake: {v}': 'O‘rtacha iste’mol: {v}',
    'New records: {n}': 'Yangi rekordlar: {n} ta',
    'Next set': 'Keyingi podxod',
    'Rest over — next: {next}': 'Dam olish tugadi — keyingisi: {next}',
    'Rest over': 'Dam olish tugadi',
  },
};

const DICT = mergeDicts(shared, friends, BOT);
const cache = {};

export function translatorFor(lang) {
  return cache[lang] || (cache[lang] = translator(lang, DICT));
}

export const tr = (user) => translatorFor((user && user.language) || 'en');

// Dates in chat text. Plain tables, so they don't depend on the runtime's Intl data.
const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ru: ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'],
  uz: ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'],
};
const MONTHS_LONG = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
};

const parts = (d) => d.split('-').map(Number);

// '2026-10-22' → '22 Oct' · '22 окт.' · '22-okt'
export function shortDate(lang, d) {
  const [, m, day] = parts(d);
  const names = MONTHS[lang] || MONTHS.en;
  return lang === 'uz' ? `${day}-${names[m - 1]}` : `${day} ${names[m - 1]}`;
}

// '2026-12-01' → '1 December 2026' · '1 декабря 2026' · '2026-yil 1-dekabrgacha'
// (Uzbek carries the "by" ending itself: 'maqsadingizga … yetasiz'.)
export function longDate(lang, d) {
  const [y, m, day] = parts(d);
  const names = MONTHS_LONG[lang] || MONTHS_LONG.en;
  if (lang === 'uz') return `${y}-yil ${day}-${names[m - 1]}gacha`;
  return `${day} ${names[m - 1]} ${y}`;
}
