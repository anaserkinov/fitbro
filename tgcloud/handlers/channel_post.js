// handlers/channel_post — posts in channels where the bot is an admin. The only one we
// act on is the heartbeat: "tick" in the TICK_CHANNEL_ID channel runs the scheduler
// (reminders, rest pings, friends' pings, challenge results, group chat posts).

import { onChannelPost } from '../lib/notify.js';

export default async function (post) {
  await onChannelPost(post);
}
