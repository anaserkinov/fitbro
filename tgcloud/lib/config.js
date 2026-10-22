// Project settings that aren't secrets. Fill these in after the first `npx tgcloud push`.

// Mini App URL printed by `push` (https://app<app_id>.tgcloud.ai/). Used for "Open app"
// buttons in bot messages; leave empty to send messages without the button.
export const MINI_APP_URL = 'https://app8767574452.tgcloud.ai/';

// Telegram user ids allowed to call the `tick` endpoint (the reminder scheduler signs
// its calls as one of these) and admin endpoints such as `adminSeed`.
export const SCHEDULER_USER_IDS = [];
export const ADMIN_USER_IDS = [];
