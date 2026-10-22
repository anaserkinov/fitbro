import { round } from './units.js';
import { ageOn } from './dates.js';
import { invalid } from './validate.js';

// Calorie targets (Mifflin-St Jeor) and food maths.

export const ACTIVITY_FACTOR = { light: 1.375, moderate: 1.55, active: 1.725 };
export const GOAL_ADJUST_KCAL = { cut: -300, maintain: 0, bulk: 250 };
const PROTEIN_G_PER_KG = { cut: 2.2, maintain: 2.0, bulk: 2.0 };
const FAT_SHARE = 0.28;          // of total kcal
const MIN_FAT_G_PER_KG = 0.6;

const to5 = (n) => Math.round(n / 5) * 5;

export function bmr({ sex, weightKg, heightCm, age }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'female' ? -161 : 5);
}

// Returns null until the profile has everything the formula needs.
export function computeTargets({ sex, birthDate, heightCm, weightKg, activityLevel, goal }, today) {
  if (!sex || !birthDate || !heightCm || !weightKg || !activityLevel || !goal) return null;
  const age = ageOn(birthDate, today);
  const tdee = bmr({ sex, weightKg, heightCm, age }) * ACTIVITY_FACTOR[activityLevel];
  const kcal = Math.max(1200, Math.round((tdee + GOAL_ADJUST_KCAL[goal]) / 50) * 50);
  const protein = to5(PROTEIN_G_PER_KG[goal] * weightKg);
  const fat = Math.max(to5((kcal * FAT_SHARE) / 9), to5(MIN_FAT_G_PER_KG * weightKg));
  const carbs = Math.max(0, to5((kcal - protein * 4 - fat * 9) / 4));
  return { kcalTarget: kcal, proteinTargetG: protein, carbsTargetG: carbs, fatTargetG: fat };
}

// How many grams (or ml) an entry of `quantity` `unit` is for this food.
export function gramsFor(food, quantity, unit) {
  if (unit === 'serving') {
    if (!food.servingGrams) invalid(`${food.name} has no serving size — enter grams instead`, 'unit');
    return quantity * food.servingGrams;
  }
  if (unit !== food.baseUnit) invalid(`${food.name} is measured in ${food.baseUnit}`, 'unit');
  return quantity;
}

export function nutrientsFor(food, grams) {
  const k = grams / 100;
  return {
    kcal:     round(food.kcalPer100 * k, 1),
    proteinG: round(food.proteinPer100 * k, 1),
    carbsG:   round(food.carbsPer100 * k, 1),
    fatG:     round(food.fatPer100 * k, 1),
  };
}

export function sumNutrients(rows) {
  const t = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const r of rows) {
    t.kcal += r.kcal || 0;
    t.proteinG += r.proteinG || 0;
    t.carbsG += r.carbsG || 0;
    t.fatG += r.fatG || 0;
  }
  return { kcal: round(t.kcal, 0), proteinG: round(t.proteinG, 1), carbsG: round(t.carbsG, 1), fatG: round(t.fatG, 1) };
}

// Per-100 g values of a recipe from its ingredients: [{ food, grams }].
export function recipePer100(items) {
  const totalGrams = items.reduce((a, i) => a + i.grams, 0);
  if (!totalGrams) return { kcalPer100: 0, proteinPer100: 0, carbsPer100: 0, fatPer100: 0 };
  // Sum unrounded values; rounding happens once, at the end.
  const total = (field) => items.reduce((a, i) => a + i.food[field] * i.grams, 0) / totalGrams;
  return {
    kcalPer100: round(total('kcalPer100'), 1),
    proteinPer100: round(total('proteinPer100'), 1),
    carbsPer100: round(total('carbsPer100'), 1),
    fatPer100: round(total('fatPer100'), 1),
  };
}
