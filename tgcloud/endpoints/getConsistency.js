import { endpoint } from '../lib/endpoint.js';
import { getConsistency } from '../lib/stats.js';

export default endpoint(getConsistency, { onboarded: true });
