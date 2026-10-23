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
  if (supports('8.0')) {
    syncSafeArea();
    tg.onEvent('safeAreaChanged', syncSafeArea);
    tg.onEvent('contentSafeAreaChanged', syncSafeArea);
  }
}

// telegram-web-app.js normally sets these itself; writing them from the JS values
// too keeps styles.css right if a client only reports insets through the API.
function syncSafeArea() {
  const root = document.documentElement.style;
  for (const [prefix, inset] of [['safe-area-inset', tg.safeAreaInset], ['content-safe-area-inset', tg.contentSafeAreaInset]]) {
    if (!inset) continue;
    for (const side of ['top', 'right', 'bottom', 'left']) root.setProperty(`--tg-${prefix}-${side}`, `${inset[side] || 0}px`);
  }
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

// The `startapp` parameter of the link that opened the app (t.me/<bot>?startapp=…).
export const startParam = (inTelegram && tg.initDataUnsafe.start_param)
  || new URLSearchParams(window.location.search).get('tgWebAppStartParam') || null;

// Opens Telegram's "share to chat" picker with a link and a line of text.
export function shareLink(url, text) {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text || '')}`;
  if (inTelegram && tg.openTelegramLink) tg.openTelegramLink(share);
  else window.open(share, '_blank', 'noopener');
}

// Bot API 8.0+: share a message the bot prepared (savePreparedInlineMessage).
export const canShareMessage = supports('8.0') && !!tg.shareMessage;
export function shareMessage(id) {
  return new Promise((resolve) => tg.shareMessage(id, (sent) => resolve(!!sent)));
}

// Lets the bot message the user (needed before it can send files to their chat).
export function requestWriteAccess() {
  if (!supports('6.9') || !tg.requestWriteAccess) return Promise.resolve(false);
  return new Promise((resolve) => tg.requestWriteAccess((ok) => resolve(!!ok)));
}
