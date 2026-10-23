import { EndpointError } from 'sdk';
import { ROUTES } from '../lib/api-routes.js';

// The Mini App's single entry point: { fn: '<name>', input: {…} } → that call's result.
// See lib/api-routes.js for why everything goes through here.
export default async function (body, ctx) {
  const name = body && body.fn;
  const route = typeof name === 'string' && Object.prototype.hasOwnProperty.call(ROUTES, name) ? ROUTES[name] : null;
  if (!route) throw new EndpointError('Unknown call', { code: 'UNKNOWN_CALL' });
  return route(body.input && typeof body.input === 'object' && !Array.isArray(body.input) ? body.input : {}, ctx);
}
