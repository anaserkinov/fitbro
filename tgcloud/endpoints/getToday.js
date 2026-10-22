import { endpoint } from '../lib/endpoint.js';
import { getToday } from '../lib/stats.js';

export default endpoint(getToday, { onboarded: true });
