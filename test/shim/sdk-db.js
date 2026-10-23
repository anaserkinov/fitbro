// Test double for the platform's `sdk/db`: the same DSL mapped onto Drizzle ORM
// running on node:sqlite (in memory), plus ddl() to create tables like `tgcloud migrate`.
// Close to the real thing, not identical — the cloud migrate is the final check.

import * as d from 'drizzle-orm/sqlite-core';
import { sql, eq, ne, gt, gte, lt, lte, like, notLike, isNull, isNotNull, and, or, not, between, notBetween, inArray, notInArray, asc, desc, count, sum, avg, min, max, getTableColumns, is, SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { DatabaseSync } from 'node:sqlite';
export { sql, like, notLike, isNull, isNotNull, and, or, not, notBetween, notInArray, asc, desc, count, sum, avg, min, max };

// Like the platform: a Date can be written (insert/update values) but not compared in a
// where clause ("db: unsupported value type: object"). Compare timestamps as unix seconds
// (atOrBefore/atOrAfter in lib/db-util.js).
const noDates = (name, op) => (...args) => {
  if (args.slice(1).some((x) => x instanceof Date || (Array.isArray(x) && x.some((y) => y instanceof Date)))) {
    throw new TypeError(`db: unsupported value type: object (Date passed to ${name})`);
  }
  return op(...args);
};
const eq_ = noDates('eq', eq), ne_ = noDates('ne', ne), gt_ = noDates('gt', gt), gte_ = noDates('gte', gte), lt_ = noDates('lt', lt), lte_ = noDates('lte', lte);
const between_ = noDates('between', between), inArray_ = noDates('inArray', inArray);
export { eq_ as eq, ne_ as ne, gt_ as gt, gte_ as gte, lt_ as lt, lte_ as lte, between_ as between, inArray_ as inArray };

export const text = (n, o) => o?.mode === 'json' ? d.text(n, { mode: 'json' }) : d.text(n);
export const integer = (n, o) => o?.mode ? d.integer(n, { mode: o.mode }) : d.integer(n);
export const real = (n) => d.real(n);
export const boolean = (n) => d.integer(n, { mode: 'boolean' });
export const json = (n) => d.text(n, { mode: 'json' });
export const index = d.index, uniqueIndex = d.uniqueIndex, primaryKey = d.primaryKey;
export const table = (name, cols, extras) => d.sqliteTable(name, cols, extras);

export const sqlite = new DatabaseSync(':memory:');
const prep = (q, p) => { const st = sqlite.prepare(q); return [st, p.map((x) => typeof x === 'boolean' ? (x ? 1 : 0) : x)]; };
const inner = drizzle(async (q, params, method) => {
  const [st, p] = prep(q, params);
  if (method === 'run') { st.run(...p); return { rows: [] }; }
  if (method === 'get') { const r = st.get(...p); return { rows: r ? Object.values(r) : undefined }; }
  return { rows: st.all(...p).map((r) => Object.values(r)) };
});
const compile = (s) => typeof s === 'string' ? { sql: s, params: [] } : inner.dialect.sqlToQuery(s);
export const db = {
  select: (...a) => inner.select(...a), insert: (t) => inner.insert(t), update: (t) => inner.update(t), delete: (t) => inner.delete(t),
  $count: (t, w) => inner.$count(t, w),
  async run(s) { const q = compile(s); const [st, p] = prep(q.sql, q.params); const r = st.run(...p); return { rowsAffected: r.changes, lastInsertRowid: Number(r.lastInsertRowid), rows: [] }; },
  async all(s) { const q = compile(s); const [st, p] = prep(q.sql, q.params); return st.all(...p); },
  async get(s) { const q = compile(s); const [st, p] = prep(q.sql, q.params); return st.get(...p) ?? null; },
  async values(s) { const q = compile(s); const [st, p] = prep(q.sql, q.params); return st.all(...p).map(Object.values); },
};
export default db;

// CREATE TABLE / INDEX from the drizzle tables, like the platform's migrate would.
export function ddl(t) {
  const c = d.getTableConfig(t);
  const lit = (v) => v instanceof SQL || is(v, SQL) ? inner.dialect.sqlToQuery(v).sql : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'object' ? `'${JSON.stringify(v)}'` : v;
  const cols = c.columns.map((col) => [`"${col.name}"`, col.getSQLType(), col.primary ? 'PRIMARY KEY' : '', col.autoIncrement ? 'AUTOINCREMENT' : '', col.notNull && !col.primary ? 'NOT NULL' : '', col.isUnique ? 'UNIQUE' : '', col.hasDefault && col.default !== undefined ? `DEFAULT ${lit(col.default)}` : ''].filter(Boolean).join(' '));
  for (const pk of c.primaryKeys) cols.push(`PRIMARY KEY (${pk.columns.map((x) => `"${x.name}"`).join(', ')})`);
  const out = [`CREATE TABLE "${c.name}" (\n  ${cols.join(',\n  ')}\n)`];
  const strip = (s) => s.replaceAll(`"${c.name}".`, '');
  for (const ix of c.indexes) {
    const cfg = ix.config;
    const on = cfg.columns.map((x) => is(x, SQL) ? strip(inner.dialect.sqlToQuery(x).sql) : `"${x.name}"`).join(', ');
    out.push(`CREATE ${cfg.unique ? 'UNIQUE ' : ''}INDEX "${cfg.name}" ON "${c.name}" (${on})${cfg.where ? ' WHERE ' + strip(inner.dialect.sqlToQuery(cfg.where).sql) : ''}`);
  }
  return out;
}
