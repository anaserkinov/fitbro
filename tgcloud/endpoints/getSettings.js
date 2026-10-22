import { endpoint } from '../lib/endpoint.js';
import { getSettings } from '../lib/account.js';

export default endpoint(getSettings);
