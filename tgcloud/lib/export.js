import { api, InputFile } from 'sdk';
import { eq, sql } from 'sdk/db';
import { db } from 'sdk';
import * as T from '../schema.js';
import * as v from './validate.js';
import { toOwnChat } from './own-chat.js';
import { catalogName } from './i18n/catalog.js';
import { tr } from './i18n/bot.js';

// "Export my data": CSV files the bot sends to the user's chat (a Mini App download
// is unreliable inside Telegram's webview). Values are in storage units — kg, kcal,
// cm, metres — and the headers say so. UTF-8 with a BOM so Excel reads Cyrillic.

const EXPORT_EVERY_SEC = 3600;

// One CSV cell (RFC 4180). Text that a spreadsheet would run as a formula gets a
// leading ' — names can come from groupmates via copied routines.
export function cell(value) {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'number' ? String(value) : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header, rows) {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

async function workoutsCsv(user) {
  const rows = await db.all(sql`
    SELECT w.local_date AS date, w.name AS workout, e.name AS exercise, s.set_type AS setType,
           s.weight_kg AS weightKg, s.reps, s.duration_sec AS durationSec, s.distance_m AS distanceM, s.rpe, s.e1rm_kg AS e1rmKg
    FROM sets s JOIN workouts w ON w.id = s.workout_id JOIN exercises e ON e.id = s.exercise_id
    LEFT JOIN workout_exercises we ON we.id = s.workout_exercise_id
    WHERE s.user_id = ${user.id} AND s.completed = 1 AND w.ended_at IS NOT NULL
    ORDER BY w.local_date, w.id, we.position, s.position`);
  return toCsv(['date', 'workout', 'exercise', 'set_type', 'weight_kg', 'reps', 'duration_sec', 'distance_m', 'rpe', 'e1rm_kg'],
    rows.map((r) => [r.date, r.workout, catalogName(user.language, r.exercise), r.setType, r.weightKg, r.reps, r.durationSec, r.distanceM, r.rpe, r.e1rmKg]));
}

async function foodCsv(user) {
  const F = T.foodLogs;
  const rows = await db.select().from(F).where(eq(F.userId, user.id)).orderBy(F.localDate, F.id).all();
  return toCsv(['date', 'meal', 'food', 'quantity', 'unit', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
    rows.map((r) => [r.localDate, r.meal, catalogName(user.language, r.name), r.quantity, r.unit, r.grams, r.kcal, r.proteinG, r.carbsG, r.fatG]));
}

async function weightCsv(user) {
  const B = T.bodyWeights;
  const rows = await db.select().from(B).where(eq(B.userId, user.id)).orderBy(B.localDate).all();
  return toCsv(['date', 'weight_kg'], rows.map((r) => [r.localDate, r.weightKg]));
}

async function measurementsCsv(user) {
  const M = T.bodyMeasurements;
  const rows = await db.select().from(M).where(eq(M.userId, user.id)).orderBy(M.localDate).all();
  return toCsv(['date', 'waist_cm', 'chest_cm', 'arms_cm', 'thighs_cm', 'hips_cm', 'neck_cm', 'body_fat_pct'],
    rows.map((r) => [r.localDate, r.waistCm, r.chestCm, r.armsCm, r.thighsCm, r.hipsCm, r.neckCm, r.bodyFatPct]));
}

const FILES = [
  ['fitpro-workouts.csv', workoutsCsv],
  ['fitpro-food.csv', foodCsv],
  ['fitpro-weight.csv', weightCsv],
  ['fitpro-measurements.csv', measurementsCsv],
];

export async function exportData(user) {
  const last = user.lastExportAt;
  const wait = last ? Math.ceil(EXPORT_EVERY_SEC - (Date.now() - last.getTime()) / 1000) : 0;
  if (wait > 0) v.refuse('You can export once an hour — try again a bit later', 'RATE_LIMITED', { retryAfterSec: wait });

  const files = [];
  for (const [name, build] of FILES) {
    const csv = await build(user);
    if (csv.split('\r\n').length > 2) files.push({ name, bytes: new TextEncoder().encode(`﻿${csv}`) });   // header + at least one row
  }
  if (!files.length) v.refuse('There is nothing to export yet', 'NOTHING_TO_EXPORT');

  const caption = `📦 ${tr(user)('Your FitPro data')}`;
  const doc = (f) => new InputFile(f.bytes, f.name, { type: 'text/csv' });
  await toOwnChat(() => (files.length === 1
    ? api.sendDocument({ chat_id: user.id, document: doc(files[0]), caption })
    // A media group needs 2–10 items; the caption goes on the last one.
    : api.sendMediaGroup({ chat_id: user.id, media: files.map((f, i) => ({ type: 'document', media: doc(f), ...(i === files.length - 1 ? { caption } : {}) })) })));
  await db.update(T.users).set({ lastExportAt: new Date() }).where(eq(T.users.id, user.id)).run();
  return { files: files.map((f) => f.name) };
}
