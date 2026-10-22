import { endpoint } from '../lib/endpoint.js';
import { lookupBarcode } from '../lib/food.js';

export default endpoint(lookupBarcode);
