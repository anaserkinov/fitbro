// How the tests reach an endpoint by name, the way the Mini App does: through the
// single `api` endpoint (tgcloud/endpoints/api.js) — except tick and adminSeed, which
// stay separate endpoints.
const SEPARATE = new Set(['tick', 'adminSeed']);
const api = (await import('../tgcloud/endpoints/api.js')).default;

export async function endpointFn(name) {
  if (SEPARATE.has(name)) return (await import(`../tgcloud/endpoints/${name}.js`)).default;
  return (input, ctx) => api({ fn: name, input }, ctx);
}
