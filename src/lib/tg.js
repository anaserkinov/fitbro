// Thin, safe wrappers over Telegram.WebApp. Everything degrades gracefully in a
// normal browser (the local dev server), where `tg` is a stub without initData.

export const tg = window.Telegram && window.Telegram.WebApp;
export const inTelegram = !!(tg && tg.initData);

const supports = (version) => inTelegram && tg.isVersionAtLeast && tg.isVersionAtLeast(version);

export function initTelegram() {
  if (!inTelegram) {
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.scheme = dark ? 'dark' : 'light';
    return;
  }
  tg.ready();
  tg.expand();
  const applyScheme = () => { document.documentElement.dataset.scheme = tg.colorScheme; };
  applyScheme();
  tg.onEvent('themeChanged', applyScheme);
  if (supports('6.1')) {
    tg.setHeaderColor('secondary_bg_color');
    tg.setBackgroundColor('secondary_bg_color');
  }
  if (supports('7.7')) tg.disableVerticalSwipes();
}

export const haptic = {
  tap: () => supports('6.1') && tg.HapticFeedback.impactOccurred('light'),
  select: () => supports('6.1') && tg.HapticFeedback.selectionChanged(),
  success: () => supports('6.1') && tg.HapticFeedback.notificationOccurred('success'),
  warn: () => supports('6.1') && tg.HapticFeedback.notificationOccurred('warning'),
  error: () => supports('6.1') && tg.HapticFeedback.notificationOccurred('error'),
};

export function confirmDialog(message) {
  if (supports('6.2')) return new Promise((resolve) => tg.showConfirm(message, (ok) => resolve(!!ok)));
  return Promise.resolve(window.confirm(message));
}

export function alertDialog(message) {
  if (supports('6.2')) return new Promise((resolve) => tg.showAlert(message, () => resolve()));
  window.alert(message);
  return Promise.resolve();
}

// BackButton: one global handler, driven by the navigation stack.
let backHandler = null;
export function setBackButton(onBack) {
  if (!supports('6.1')) return;
  if (backHandler) tg.BackButton.offClick(backHandler);
  backHandler = onBack;
  if (onBack) {
    tg.BackButton.onClick(onBack);
    tg.BackButton.show();
  } else {
    tg.BackButton.hide();
  }
}

export const mainButtonSupported = inTelegram && !!(tg && tg.MainButton);
export const telegramUser = inTelegram ? tg.initDataUnsafe.user : null;
