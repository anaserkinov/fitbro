import { endpoint } from '../lib/endpoint.js';
import { ADMIN_USER_IDS } from '../lib/config.js';
import { seedCatalog } from '../lib/catalog.js';

export default endpoint(seedCatalog, { allow: ADMIN_USER_IDS });
