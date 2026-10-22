// Built-in foods (user_id 0, source 'builtin'). Values per 100 g (or 100 ml for
// drinks), typical figures in line with USDA FoodData Central — good enough for
// tracking; packaged products come from Open Food Facts by barcode instead.
//
// [name, baseUnit, kcal, protein, carbs, fat, servingLabel, servingGrams]

const ROWS = [
  // Meat & fish (cooked unless noted)
  ['Chicken breast, cooked',       'g', 165, 31,   0,    3.6,  null, null],
  ['Chicken breast, raw',          'g', 120, 22.5, 0,    2.6,  null, null],
  ['Chicken thigh, cooked',        'g', 209, 26,   0,    10.9, null, null],
  ['Turkey breast, cooked',        'g', 135, 30,   0,    1,    null, null],
  ['Ground beef 90/10, cooked',    'g', 217, 26,   0,    11.7, null, null],
  ['Beef sirloin steak, cooked',   'g', 206, 29,   0,    9,    null, null],
  ['Pork loin, cooked',            'g', 197, 27,   0,    9,    null, null],
  ['Bacon, cooked',                'g', 541, 37,   1.4,  42,   '1 slice', 8],
  ['Salmon, cooked',               'g', 206, 22,   0,    12,   null, null],
  ['Tuna, canned in water',        'g', 116, 26,   0,    0.8,  '1 can (drained)', 120],
  ['Cod, cooked',                  'g', 105, 23,   0,    0.9,  null, null],
  ['Shrimp, cooked',               'g', 99,  24,   0.2,  0.3,  null, null],

  // Eggs & dairy
  ['Egg, whole',                   'g', 143, 12.6, 0.7,  9.5,  '1 large', 50],
  ['Egg white',                    'g', 52,  11,   0.7,  0.2,  '1 large', 33],
  ['Greek yogurt 0%',              'g', 59,  10.3, 3.6,  0.4,  '1 cup', 170],
  ['Greek yogurt 2%',              'g', 73,  10,   3.9,  2,    '1 cup', 170],
  ['Cottage cheese 2%',            'g', 81,  10.5, 4.8,  2.3,  '1 cup', 226],
  ['Cheddar cheese',               'g', 403, 25,   1.3,  33,   '1 slice', 28],
  ['Mozzarella',                   'g', 280, 28,   3.1,  17,   null, null],
  ['Milk, whole',                  'ml', 61, 3.2,  4.8,  3.3,  '1 glass', 250],
  ['Milk 2%',                      'ml', 50, 3.3,  4.8,  2,    '1 glass', 250],
  ['Milk, skim',                   'ml', 34, 3.4,  5,    0.1,  '1 glass', 250],
  ['Butter',                       'g', 717, 0.9,  0.1,  81,   '1 tbsp', 14],
  ['Whey protein powder',          'g', 400, 80,   8,    6,    '1 scoop', 30],

  // Grains & starches
  ['Oats, rolled (dry)',           'g', 379, 13,   68,   6.5,  null, null],
  ['White rice, cooked',           'g', 130, 2.7,  28,   0.3,  '1 cup', 158],
  ['Brown rice, cooked',           'g', 123, 2.7,  25.6, 1,    '1 cup', 195],
  ['Pasta, cooked',                'g', 158, 5.8,  31,   0.9,  '1 cup', 140],
  ['Quinoa, cooked',               'g', 120, 4.4,  21,   1.9,  '1 cup', 185],
  ['White bread',                  'g', 265, 9,    49,   3.2,  '1 slice', 28],
  ['Whole wheat bread',            'g', 252, 12.4, 43,   3.5,  '1 slice', 32],
  ['Flour tortilla',               'g', 312, 8,    52,   8,    '1 medium', 45],
  ['Potato, boiled',               'g', 87,  1.9,  20,   0.1,  '1 medium', 170],
  ['Sweet potato, baked',          'g', 90,  2,    21,   0.2,  '1 medium', 150],
  ['Corn flakes',                  'g', 357, 7.5,  84,   0.4,  '1 cup', 28],
  ['Granola',                      'g', 471, 10,   64,   20,   null, null],
  ['Rice cake',                    'g', 387, 8,    82,   2.8,  '1 cake', 9],

  // Legumes & plant protein
  ['Lentils, cooked',              'g', 116, 9,    20,   0.4,  '1 cup', 198],
  ['Chickpeas, cooked',            'g', 164, 8.9,  27.4, 2.6,  '1 cup', 164],
  ['Black beans, cooked',          'g', 132, 8.9,  23.7, 0.5,  '1 cup', 172],
  ['Tofu, firm',                   'g', 144, 17.3, 2.8,  8.7,  null, null],
  ['Hummus',                       'g', 166, 7.9,  14.3, 9.6,  '2 tbsp', 30],

  // Fruit
  ['Banana',                       'g', 89,  1.1,  23,   0.3,  '1 medium', 118],
  ['Apple',                        'g', 52,  0.3,  14,   0.2,  '1 medium', 182],
  ['Orange',                       'g', 47,  0.9,  12,   0.1,  '1 medium', 131],
  ['Blueberries',                  'g', 57,  0.7,  14.5, 0.3,  '1 cup', 148],
  ['Strawberries',                 'g', 32,  0.7,  7.7,  0.3,  '1 cup', 152],
  ['Grapes',                       'g', 69,  0.7,  18,   0.2,  '1 cup', 151],
  ['Avocado',                      'g', 160, 2,    8.5,  14.7, '1 medium', 150],

  // Vegetables
  ['Broccoli, cooked',             'g', 35,  2.4,  7.2,  0.4,  '1 cup', 156],
  ['Spinach, raw',                 'g', 23,  2.9,  3.6,  0.4,  '1 cup', 30],
  ['Green beans, cooked',          'g', 35,  1.9,  7.9,  0.3,  '1 cup', 125],
  ['Tomato',                       'g', 18,  0.9,  3.9,  0.2,  '1 medium', 123],
  ['Cucumber',                     'g', 15,  0.7,  3.6,  0.1,  null, null],
  ['Carrot',                       'g', 41,  0.9,  9.6,  0.2,  '1 medium', 61],
  ['Red bell pepper',              'g', 31,  1,    6,    0.3,  '1 medium', 119],
  ['Onion',                        'g', 40,  1.1,  9.3,  0.1,  '1 medium', 110],

  // Nuts, fats & sweets
  ['Peanut butter',                'g', 588, 25,   20,   50,   '1 tbsp', 16],
  ['Almonds',                      'g', 579, 21,   22,   50,   '1 handful', 28],
  ['Walnuts',                      'g', 654, 15,   14,   65,   '1 handful', 28],
  ['Cashews',                      'g', 553, 18,   30,   44,   '1 handful', 28],
  ['Olive oil',                    'g', 884, 0,    0,    100,  '1 tbsp', 13.5],
  ['Honey',                        'g', 304, 0.3,  82,   0,    '1 tbsp', 21],
  ['Dark chocolate 70–85%',        'g', 598, 7.8,  46,   43,   '1 square', 10],

  // Drinks
  ['Orange juice',                 'ml', 45, 0.7,  10.4, 0.2,  '1 glass', 250],
  ['Cola',                         'ml', 42, 0,    10.6, 0,    '1 can', 330],
  ['Beer',                         'ml', 43, 0.5,  3.6,  0,    '1 bottle', 500],
  ['Coffee, black',                'ml', 1,  0.1,  0,    0,    '1 cup', 240],
];

export const BUILTIN_FOODS = ROWS.map(([name, baseUnit, kcal, protein, carbs, fat, servingLabel, servingGrams]) => ({
  name, baseUnit,
  kcalPer100: kcal, proteinPer100: protein, carbsPer100: carbs, fatPer100: fat,
  servingLabel, servingGrams,
}));
