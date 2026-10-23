import { db } from 'sdk';
import { eq, and, inArray, sql } from 'sdk/db';
import { notFound } from './validate.js';

// The row with this id owned by this user, or a NOT_FOUND error. Use it for every
// id that comes from the client — it is the access check.
export async function own(table, id, userId, what) {
  const row = await db.select().from(table).where(and(eq(table.id, id), eq(table.userId, userId))).get();
  if (!row) notFound(what);
  return row;
}

// Same, but shared catalogue rows (user_id 0) are visible too.
export async function visible(table, id, userId, what) {
  const row = await db.select().from(table).where(and(eq(table.id, id), inArray(table.userId, [0, userId]))).get();
  if (!row) notFound(what);
  return row;
}

const CHUNK = 40;   // keeps each batch insert well under SQLite's bound-variable limit

export async function insertChunked(table, rows) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(table).values(rows.slice(i, i + CHUNK)).run();
  }
}

export function isUniqueViolation(e) {
  return /UNIQUE constraint failed/i.test(String(e && e.message));
}

// Raw-SQL rows come back unconverted: timestamps as unix seconds.
export function fromUnix(sec) {
  return sec === null || sec === undefined ? null : new Date(Number(sec) * 1000);
}

export const unix = (d) => Math.floor(d.getTime() / 1000);

// Timestamp comparisons. The platform binds a Date in writes (insert/update values) but
// not in a where clause — `lte(col, new Date())` throws "unsupported value type" — so
// compare against unix seconds, which is how timestamp columns are stored.
export const atOrBefore = (col, d) => sql`${col} <= ${unix(d)}`;
export const atOrAfter = (col, d) => sql`${col} >= ${unix(d)}`;
