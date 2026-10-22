// Lets the tgcloud/ modules run under Node unchanged: `sdk` and `sdk/db` resolve to
// local shims (Drizzle on node:sqlite), and files under tgcloud/ load as ES modules.
const SHIMS = {
  'sdk': new URL('./shim/sdk.js', import.meta.url).href,
  'sdk/db': new URL('./shim/sdk-db.js', import.meta.url).href,
};

export async function resolve(specifier, context, next) {
  if (specifier in SHIMS) return { url: SHIMS[specifier], shortCircuit: true };
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.includes('/tgcloud/') || url.includes('/test/')) return next(url, { ...context, format: 'module' });
  return next(url, context);
}
