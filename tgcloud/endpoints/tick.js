import { endpoint } from '../lib/endpoint.js';
import { SCHEDULER_USER_IDS } from '../lib/config.js';
import { tick } from '../lib/notify.js';

export default endpoint(tick, { allow: SCHEDULER_USER_IDS });
