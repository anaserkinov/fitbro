import { EndpointError } from 'sdk';
import { ensureUser } from './users.js';

// Wraps a domain function `(user, input) => result` as a Mini App endpoint. The
// platform has already verified ctx.initData, so its `user` is the trusted caller.
//
// Contract with the Mini App: weights in kg, energy in kcal, dates 'YYYY-MM-DD',
// instants as ISO strings. The app converts to the user's units for display.
export function endpoint(fn, { onboarded = false, allow = null } = {}) {
  return async function (input, ctx) {
    const tg = ctx && ctx.initData && ctx.initData.user;
    if (!tg) throw new EndpointError('Open the app from Telegram', { code: 'NO_USER' });
    if (allow && !allow.includes(tg.id)) throw new EndpointError('Not allowed', { code: 'FORBIDDEN' });
    const user = await ensureUser(tg);
    if (onboarded && !user.onboardedAt) throw new EndpointError('Finish setup first', { code: 'NOT_ONBOARDED' });
    return toWire(await fn(user, input && typeof input === 'object' && !Array.isArray(input) ? input : {}));
  };
}

// The platform serializes a Date in a response as `{}`, so instants are turned into
// ISO strings here (an invalid Date becomes null).
export function toWire(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Array.isArray(value)) return value.map(toWire);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toWire(v);
    return out;
  }
  return value;
}

// Refusals that aren't about one input field.
export function refuse(message, code, extra = {}) {
  throw new EndpointError(message, { code, ...extra });
}
