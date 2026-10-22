// Test double for the platform's `sdk`: db from the shim; api calls are recorded in
// globalThis.apiCalls and answered by globalThis.fakeApi[method] (default {});
// fetch is delegated to globalThis.fakeFetch.

export { db } from './sdk-db.js';
export class EndpointError extends Error { constructor(m, p) { super(m); this.parameters = p; } }
export class BotApiError extends Error { constructor(code, d) { super(d); this.code = code; this.description = d; } }
export class InputFile { constructor(bytes, name, opts) { this.bytes = bytes; this.name = name; this.type = opts?.type; } }
export const api = new Proxy({}, {
  get: (_, method) => async (params) => {
    (globalThis.apiCalls ??= []).push([method, params]);
    const fake = globalThis.fakeApi?.[method];
    return fake ? fake(params) : {};
  },
});
export const fetch = async (url, opts) => globalThis.fakeFetch(url, opts);
