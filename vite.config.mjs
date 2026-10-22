import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

// The front-end imports a few pure modules from tgcloud/lib (units, dates, nutrition).
// Their `sdk` imports resolve to a stub in the browser; on the dev server (SSR) they
// resolve to the test shims, so the real endpoints run locally on in-memory SQLite.
function sdkResolver() {
  return {
    name: 'fitpro-sdk',
    enforce: 'pre',
    resolveId(id, _importer, opts) {
      if (id !== 'sdk' && id !== 'sdk/db') return null;
      if (opts && opts.ssr) return here(id === 'sdk' ? './test/shim/sdk.js' : './test/shim/sdk-db.js');
      return here('./src/lib/sdk-browser.js');
    },
  };
}

const DEV_USER = { id: 1, first_name: 'Dev', username: 'dev', language_code: 'en' };

// `npm run dev`: POST /api/<name> runs tgcloud/endpoints/<name>.js as DEV_USER.
// Data lives in memory and resets when the dev server restarts.
function devApi() {
  let ready = null;
  const files = new Map();   // fake Telegram file storage for progress photos
  return {
    name: 'fitpro-dev-api',
    apply: 'serve',
    configureServer(server) {
      const setup = async () => {
        const shim = await server.ssrLoadModule(here('./test/shim/sdk-db.js'));
        const schema = await server.ssrLoadModule(here('./tgcloud/schema.js'));
        for (const t of Object.values(schema)) for (const s of shim.ddl(t)) shim.sqlite.exec(s);
        await (await server.ssrLoadModule(here('./tgcloud/lib/catalog.js'))).seedCatalog();
        globalThis.fakeFetch = (url, opts) => fetch(url, opts).then(async (r) => {
          const text = await r.text();
          return { ok: r.ok, status: r.status, json: async () => JSON.parse(text), text: async () => text };
        });
        globalThis.fakeApi = {
          sendPhoto: (p) => {
            const id = `dev-${files.size + 1}`;
            files.set(id, p.photo.bytes);
            return { message_id: files.size, photo: [{ file_id: id, file_unique_id: id, width: 1080, height: 1440 }] };
          },
          getFileContent: (fileId) => files.get(fileId) ?? new Uint8Array(),
        };
      };

      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST' || !req.url.startsWith('/api/')) return next();
        const name = req.url.slice(5).split('?')[0];
        const send = (status, body) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || !existsSync(here(`./tgcloud/endpoints/${name}.js`))) {
          return send(404, { ok: false, description: 'Unknown endpoint' });
        }
        try {
          ready ??= setup();
          await ready;
          let raw = '';
          for await (const chunk of req) raw += chunk;
          const mod = await server.ssrLoadModule(here(`./tgcloud/endpoints/${name}.js`));
          const result = await mod.default(raw ? JSON.parse(raw) : {}, { initData: { user: DEV_USER } });
          send(200, { ok: true, result });
        } catch (e) {
          if (e && e.parameters) return send(400, { ok: false, error_type: 'ENDPOINT_ERROR', description: e.message, parameters: e.parameters });
          console.error(e);
          send(500, { ok: false, error_type: 'INTERNAL', description: 'Internal error' });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [sdkResolver(), react(), devApi()],
  server: { fs: { allow: [here('.')] } },
  build: { outDir: 'dist', target: 'es2020', sourcemap: false },
});
