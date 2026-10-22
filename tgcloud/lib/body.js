import { db, api, InputFile } from 'sdk';
import { eq, and, gte, asc, desc } from 'sdk/db';
import * as T from '../schema.js';
import * as v from './validate.js';
import { own } from './db-util.js';
import { today } from './users.js';
import { addDays, daysBetween } from './dates.js';
import { round } from './units.js';
import { decodeBase64, encodeBase64, imageType } from './base64.js';

const BW = T.bodyWeights, BM = T.bodyMeasurements, PP = T.progressPhotos;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;   // Bot API photo upload limit
const MEASURE_FIELDS = ['waistCm', 'chestCm', 'armsCm', 'thighsCm', 'hipsCm', 'neckCm', 'bodyFatPct'];

// ── Weight ──────────────────────────────────────────────────────────────────────

// One weigh-in per day: logging again the same day replaces it.
export async function logWeight(user, input) {
  const date = v.date(input.date, 'date', { optional: true }) ?? today(user);
  const weightKg = round(v.num(input.weightKg, 'weightKg', { min: 20, max: 400 }), 2);
  const note = v.str(input.note, 'note', { max: 200, optional: true });
  const where = and(eq(BW.userId, user.id), eq(BW.localDate, date));
  const existing = await db.select().from(BW).where(where).get();
  if (existing) await db.update(BW).set({ weightKg, note, measuredAt: new Date() }).where(eq(BW.id, existing.id)).run();
  else await db.insert(BW).values({ userId: user.id, localDate: date, weightKg, note }).run();
  return { weight: await weightSummary(user) };
}

export async function deleteWeight(user, input) {
  const date = v.date(input.date, 'date');
  await db.delete(BW).where(and(eq(BW.userId, user.id), eq(BW.localDate, date))).run();
  return { weight: await weightSummary(user) };
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

// Least-squares slope in kg/day; null without at least 4 weigh-ins over a week.
function slopePerDay(points) {
  if (points.length < 4 || points[points.length - 1].x - points[0].x < 7) return null;
  const mx = mean(points.map((p) => p.x)), my = mean(points.map((p) => p.y));
  let num = 0, den = 0;
  for (const p of points) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  return den ? num / den : null;
}

// Latest weigh-in, 7-day average, change vs the week before, trend and the date
// the goal weight is reached at the current rate (null if moving away from it).
export async function weightSummary(user, days = 30) {
  const t = today(user);
  const rows = await db.select().from(BW)
    .where(and(eq(BW.userId, user.id), gte(BW.localDate, addDays(t, -(days + 35)))))
    .orderBy(asc(BW.localDate)).all();
  const avgEnding = (end) => {
    const from = addDays(end, -6);
    return round(mean(rows.filter((r) => r.localDate >= from && r.localDate <= end).map((r) => r.weightKg)), 2);
  };
  const avg7 = avgEnding(t);
  const prevAvg7 = avgEnding(addDays(t, -7));
  const recent = rows.filter((r) => r.localDate >= addDays(t, -27)).map((r) => ({ x: daysBetween(t, r.localDate), y: r.weightKg }));
  const slope = slopePerDay(recent);

  let projectedGoalDate = null;
  const goal = user.goalWeightKg;
  if (goal && avg7 !== null && slope && Math.abs(slope) > 0.005) {
    const toGo = goal - avg7;
    const daysToGoal = toGo / slope;
    if (Math.abs(toGo) < 0.1) projectedGoalDate = t;
    else if (daysToGoal > 0 && daysToGoal <= 730) projectedGoalDate = addDays(t, Math.ceil(daysToGoal));
  }

  const latest = rows.length ? rows[rows.length - 1] : null;
  return {
    latest: latest ? { date: latest.localDate, weightKg: latest.weightKg } : null,
    avg7Kg: avg7,
    weekChangeKg: avg7 !== null && prevAvg7 !== null ? round(avg7 - prevAvg7, 2) : null,
    ratePerWeekKg: slope === null ? null : round(slope * 7, 2),
    goalWeightKg: goal,
    projectedGoalDate,
    series: rows.filter((r) => r.localDate > addDays(t, -days)).map((r) => ({ date: r.localDate, weightKg: r.weightKg, avg7Kg: avgEnding(r.localDate) })),
  };
}

// ── Measurements ────────────────────────────────────────────────────────────────

// Fields given are saved for that day; fields not given keep their value.
export async function logMeasurements(user, input) {
  const { date: rawDate, ...fields } = input;
  const date = v.date(rawDate, 'date', { optional: true }) ?? today(user);
  const spec = {};
  for (const f of MEASURE_FIELDS) {
    spec[f] = (x, k) => v.num(x, k, f === 'bodyFatPct' ? { min: 2, max: 70, optional: true } : { min: 10, max: 250, optional: true });
  }
  const p = v.patch(fields, spec);
  if (!Object.keys(p).length) v.invalid('Enter at least one measurement');
  const where = and(eq(BM.userId, user.id), eq(BM.localDate, date));
  const existing = await db.select().from(BM).where(where).get();
  if (existing) await db.update(BM).set({ ...p, measuredAt: new Date() }).where(eq(BM.id, existing.id)).run();
  else await db.insert(BM).values({ userId: user.id, localDate: date, ...p }).run();
  return { measurements: await measurementSummary(user) };
}

// Latest values per field, compared with the newest entry at least 3 weeks older
// (or the first entry), like "Waist 84.0 cm −1.5 vs 1 Sep".
export async function measurementSummary(user) {
  const rows = await db.select().from(BM).where(eq(BM.userId, user.id)).orderBy(desc(BM.localDate)).limit(60).all();
  if (!rows.length) return { latest: null, previous: null, deltas: {} };
  const latest = {}, latestDate = rows[0].localDate;
  for (const f of MEASURE_FIELDS) {
    const r = rows.find((x) => x[f] !== null);
    if (r) latest[f] = { value: r[f], date: r.localDate };
  }
  const cutoff = addDays(latestDate, -21);
  const previous = rows.find((r) => r.localDate <= cutoff) ?? (rows.length > 1 ? rows[rows.length - 1] : null);
  const deltas = {};
  if (previous) for (const f of MEASURE_FIELDS) {
    if (latest[f] && previous[f] !== null && latest[f].date !== previous.localDate) deltas[f] = round(latest[f].value - previous[f], 1);
  }
  return { latest, previous: previous ? { date: previous.localDate } : null, deltas };
}

// ── Progress photos ─────────────────────────────────────────────────────────────

// Photos live on Telegram: the bot sends the image to the user's own chat to get a
// file_id, stores that, then removes the message to keep the chat clean.
export async function uploadPhoto(user, input) {
  const date = v.date(input.date, 'date', { optional: true }) ?? today(user);
  const pose = v.oneOf(input.pose, 'pose', 'pose', { optional: true }) ?? 'front';
  const bytes = typeof input.imageBase64 === 'string' ? decodeBase64(input.imageBase64) : null;
  if (!bytes || !bytes.length) v.invalid('imageBase64 must be a base64 image', 'imageBase64');
  if (bytes.length > MAX_PHOTO_BYTES) v.invalid('Photo is larger than 10 MB', 'imageBase64');
  const type = imageType(bytes);
  if (!type) v.invalid('Only JPEG or PNG photos', 'imageBase64');

  const msg = await api.sendPhoto({
    chat_id: user.id,
    photo: new InputFile(bytes, type === 'image/png' ? 'progress.png' : 'progress.jpg', { type }),
    caption: `Progress photo · ${date} · ${pose}`,
    disable_notification: true,
  });
  const photo = await savePhotoSizes(user, msg.photo, { date, pose });
  try {
    await api.deleteMessage({ chat_id: user.id, message_id: msg.message_id });
  } catch (e) {
    console.warn('could not delete photo message', e.description || e.message);
  }
  return { photo };
}

// Stores the largest size of a Telegram photo (from an upload or a chat message).
export async function savePhotoSizes(user, sizes, { date, pose = 'front' }) {
  const best = sizes[sizes.length - 1];
  const [row] = await db.insert(PP).values({
    userId: user.id, localDate: date ?? today(user), pose,
    fileId: best.file_id, fileUniqueId: best.file_unique_id, width: best.width, height: best.height,
  }).returning();
  return row;
}

export async function listPhotos(user, limit = 24) {
  return db.select().from(PP).where(eq(PP.userId, user.id)).orderBy(desc(PP.localDate), desc(PP.id)).limit(limit).all();
}

export async function getPhoto(user, input) {
  const photo = await own(PP, v.id(input.id), user.id, 'Photo');
  const bytes = await api.getFileContent(photo.fileId);
  return { photo, mime: imageType(bytes) ?? 'image/jpeg', imageBase64: encodeBase64(bytes) };
}

export async function deletePhoto(user, input) {
  const photo = await own(PP, v.id(input.id), user.id, 'Photo');
  await db.delete(PP).where(eq(PP.id, photo.id)).run();
  return { ok: true };
}

export async function getBody(user, input = {}) {
  const days = v.num(input.days, 'days', { min: 7, max: 365, int: true, optional: true }) ?? 30;
  return {
    weight: await weightSummary(user, days),
    measurements: await measurementSummary(user),
    photos: await listPhotos(user),
  };
}
