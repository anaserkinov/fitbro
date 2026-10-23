// Project settings that aren't secrets. Fill these in after the first `npx tgcloud push`.

// Mini App URL printed by `push` (https://app<app_id>.tgcloud.ai/). Used for "Open app"
// buttons in bot messages; leave empty to send messages without the button.
export const MINI_APP_URL = 'https://app8767574452.tgcloud.ai/';

// Telegram user ids allowed to call the `tick` endpoint and admin endpoints such as
// `adminSeed`. The platform only accepts init data signed by Telegram, so an outside
// scheduler can't call `tick` this way — see TICK_CHANNEL_ID. `npx tgcloud run
// endpoints/tick '{}' --ctx '{ initData: { user: { id: <id> } } }'` still works by hand.
export const SCHEDULER_USER_IDS = [];

// The heartbeat: a private channel where @fitbroapp and a helper bot are admins. A
// Cloudflare cron worker has the helper bot post "tick" there every minute (and delete
// it); handlers/channel_post.js then runs the scheduler (lib/notify.js → tick). Only
// posts in this channel count. null = off. Private channel ids look like -100…
export const TICK_CHANNEL_ID = -1004426968608;   // "FitBro Tick"
export const ADMIN_USER_IDS = [];
