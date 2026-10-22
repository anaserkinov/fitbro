import { db, fetch } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import * as T from '../schema.js';
import { round, KJ_PER_KCAL } from './units.js';
import * as v from './validate.js';

// Barcode lookup via Open Food Facts (free, no key). Products are cached in `foods`
// with user_id 0 / source 'off', so each barcode is fetched from OFF only once.

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = 'product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,product_quantity_unit';
// OFF asks every app to identify itself.
const USER_AGENT = 'FitPro/0.1 (Telegram bot)';

export function cleanBarcode(raw) {
  const code = String(raw ?? '').replace(/\s+/g, '');
  if (!/^\d{8,14}$/.test(code)) v.invalid('A barcode is 8–14 digits', 'barcode');
  return code;
}

async function cached(code) {
  return db.select().from(T.foods)
    .where(and(eq(T.foods.barcode, code), eq(T.foods.userId, 0), isNull(T.foods.archivedAt)))
    .get();
}

// OFF product → foods row, or null when it lacks usable nutrition.
export function mapProduct(code, p) {
  const n = p.nutriments || {};
  let kcal = n['energy-kcal_100g'];
  if ((kcal === undefined || kcal === null) && n['energy-kj_100g'] !== undefined) kcal = n['energy-kj_100g'] / KJ_PER_KCAL;
  if (kcal === undefined || kcal === null || !Number.isFinite(Number(kcal))) return null;

  const name = (p.product_name_en || p.product_name || '').trim();
  if (!name) return null;
  const servingGrams = Number(p.serving_quantity);
  const liquid = p.product_quantity_unit === 'ml';

  return {
    userId: 0,
    source: 'off',
    barcode: code,
    name: name.slice(0, 120),
    brand: (p.brands || '').split(',')[0].trim().slice(0, 80) || null,
    baseUnit: liquid ? 'ml' : 'g',
    kcalPer100: round(Number(kcal), 1),
    proteinPer100: round(Number(n.proteins_100g) || 0, 1),
    carbsPer100: round(Number(n.carbohydrates_100g) || 0, 1),
    fatPer100: round(Number(n.fat_100g) || 0, 1),
    fiberPer100: n.fiber_100g === undefined ? null : round(Number(n.fiber_100g), 1),
    sugarPer100: n.sugars_100g === undefined ? null : round(Number(n.sugars_100g), 1),
    servingLabel: servingGrams > 0 ? (p.serving_size || `1 serving`).slice(0, 40) : null,
    servingGrams: servingGrams > 0 ? servingGrams : null,
  };
}

// Returns the foods row for a barcode, or null if Open Food Facts doesn't know it.
export async function lookupBarcode(raw) {
  const code = cleanBarcode(raw);
  const hit = await cached(code);
  if (hit) return hit;

  const res = await fetch(`${OFF_URL}${code}?fields=${FIELDS}`, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts: HTTP ${res.status}`);
  const body = await res.json();
  if (body.status !== 1 || !body.product) return null;

  const row = mapProduct(code, body.product);
  if (!row) return null;
  const [saved] = await db.insert(T.foods).values(row).returning();
  return saved;
}
