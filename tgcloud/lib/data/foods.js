// Built-in foods (user_id 0, source 'builtin'). Values per 100 g (or 100 ml for
// drinks), typical figures in line with USDA FoodData Central — good enough for
// tracking; packaged products come from Open Food Facts by barcode instead.
//
// [name, baseUnit, kcal, protein, carbs, fat, servingLabel, servingGrams, extra?]; a
// string starts a category (what the Mini App browses by). `extra`: { fiber, sugar,
// fdc } — fdc is the USDA FoodData Central id (SR Legacy, 2018) the values come from,
// for rows taken from it as they are. Source: USDA FoodData Central (public domain).
//
// Serving labels are English translation keys (src/i18n/food.js).

const ROWS = [
  'meat_fish',     // Meat & fish (cooked unless noted)
  ['Chicken breast, cooked',       'g', 165, 31,   0,    3.6,  null, null],
  ['Chicken breast, raw',          'g', 120, 22.5, 0,    2.6,  null, null],
  ['Chicken thigh, cooked',        'g', 209, 26,   0,    10.9, null, null],
  ['Turkey breast, cooked',        'g', 135, 30,   0,    1,    null, null],
  ['Ground beef 90/10, cooked',    'g', 217, 26,   0,    11.7, null, null],
  ['Beef sirloin steak, cooked',   'g', 206, 29,   0,    9,    null, null],
  ['Salmon, cooked',               'g', 206, 22,   0,    12,   null, null],
  ['Tuna, canned in water',        'g', 116, 26,   0,    0.8,  '1 can (drained)', 120],
  ['Cod, cooked',                  'g', 105, 23,   0,    0.9,  null, null],
  ['Shrimp, cooked',               'g', 99,  24,   0.2,  0.3,  null, null],
  ['Lamb shoulder, stewed',        'g', 344, 28.7, 0,    24.6, null, null, { fdc: 172497 }],
  ['Lamb, grilled',                'g', 278, 24.4, 0,    19.3, null, null, { fdc: 174324 }],
  ['Ground lamb, cooked',          'g', 283, 24.8, 0,    19.6, null, null, { fdc: 172544 }],
  ['Lamb fat (dumba), cooked',     'g', 674, 5.2,  0.6,  72.3, null, null, { fdc: 172613 }],
  ['Beef chuck, stewed',           'g', 302, 30.1, 0,    19.2, null, null, { fdc: 168667 }],
  ['Horse meat, cooked',           'g', 175, 28.1, 0,    6,    null, null, { fdc: 175087 }],

  'dairy',         // Eggs & dairy
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
  ['Katyk (plain yogurt)',         'g', 61,  3.5,  4.7,  3.2,  null, null, { fdc: 171284 }],

  'grains',        // Grains & starches
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
  ['Puff pastry, baked',           'g', 558, 7.4,  45.7, 38.5, null, null, { fdc: 172738 }],

  'legumes',       // Legumes & plant protein
  ['Lentils, cooked',              'g', 116, 9,    20,   0.4,  '1 cup', 198],
  ['Chickpeas, cooked',            'g', 164, 8.9,  27.4, 2.6,  '1 cup', 164],
  ['Black beans, cooked',          'g', 132, 8.9,  23.7, 0.5,  '1 cup', 172],
  ['Tofu, firm',                   'g', 144, 17.3, 2.8,  8.7,  null, null],
  ['Hummus',                       'g', 166, 7.9,  14.3, 9.6,  '2 tbsp', 30],
  ['Mung beans, cooked',           'g', 105, 7,    19.1, 0.4,  null, null, { fdc: 174257 }],

  'fruit',         // Fruit
  ['Banana',                       'g', 89,  1.1,  23,   0.3,  '1 medium', 118],
  ['Apple',                        'g', 52,  0.3,  14,   0.2,  '1 medium', 182],
  ['Orange',                       'g', 47,  0.9,  12,   0.1,  '1 medium', 131],
  ['Blueberries',                  'g', 57,  0.7,  14.5, 0.3,  '1 cup', 148],
  ['Strawberries',                 'g', 32,  0.7,  7.7,  0.3,  '1 cup', 152],
  ['Grapes',                       'g', 69,  0.7,  18,   0.2,  '1 cup', 151],
  ['Avocado',                      'g', 160, 2,    8.5,  14.7, '1 medium', 150],

  'vegetables',    // Vegetables
  ['Broccoli, cooked',             'g', 35,  2.4,  7.2,  0.4,  '1 cup', 156],
  ['Spinach, raw',                 'g', 23,  2.9,  3.6,  0.4,  '1 cup', 30],
  ['Green beans, cooked',          'g', 35,  1.9,  7.9,  0.3,  '1 cup', 125],
  ['Tomato',                       'g', 18,  0.9,  3.9,  0.2,  '1 medium', 123],
  ['Cucumber',                     'g', 15,  0.7,  3.6,  0.1,  null, null],
  ['Carrot',                       'g', 41,  0.9,  9.6,  0.2,  '1 medium', 61],
  ['Red bell pepper',              'g', 31,  1,    6,    0.3,  '1 medium', 119],
  ['Onion',                        'g', 40,  1.1,  9.3,  0.1,  '1 medium', 110],
  ['Carrots, cooked',              'g', 35,  0.8,  8.2,  0.2,  null, null, { fdc: 170394 }],
  ['Onion, cooked',                'g', 44,  1.4,  10.2, 0.2,  null, null, { fdc: 170001 }],
  ['Cabbage, cooked',              'g', 23,  1.3,  5.5,  0.1,  null, null, { fdc: 169976 }],
  ['Cabbage, raw',                 'g', 25,  1.3,  5.8,  0.1,  null, null, { fdc: 169975 }],
  ['Radish (daikon)',              'g', 18,  0.6,  4.1,  0.1,  null, null, { fdc: 168451 }],

  'fats_sweets',   // Nuts, fats & sweets
  ['Peanut butter',                'g', 588, 25,   20,   50,   '1 tbsp', 16],
  ['Almonds',                      'g', 579, 21,   22,   50,   '1 handful', 28],
  ['Walnuts',                      'g', 654, 15,   14,   65,   '1 handful', 28],
  ['Cashews',                      'g', 553, 18,   30,   44,   '1 handful', 28],
  ['Olive oil',                    'g', 884, 0,    0,    100,  '1 tbsp', 13.5],
  ['Honey',                        'g', 304, 0.3,  82,   0,    '1 tbsp', 21],
  ['Dark chocolate 70–85%',        'g', 598, 7.8,  46,   43,   '1 square', 10],
  ['Cottonseed oil',               'g', 884, 0,    0,    100,  null, null, { fdc: 171024 }],
  ['Mayonnaise',                   'g', 680, 1,    0.6,  74.8, '1 tbsp', 14, { fdc: 171009 }],
  ['Ketchup',                      'g', 101, 1,    27.4, 0.1,  '1 tbsp', 15, { fdc: 168556 }],

  'drinks',        // Drinks
  ['Orange juice',                 'ml', 45, 0.7,  10.4, 0.2,  '1 glass', 250],
  ['Cola',                         'ml', 42, 0,    10.6, 0,    '1 can', 330],
  ['Beer',                         'ml', 43, 0.5,  3.6,  0,    '1 bottle', 500],
  ['Coffee, black',                'ml', 1,  0.1,  0,    0,    '1 cup', 240],
  ['Beef broth',                   'ml', 13,  2,    1.2,  0.1,  null, null, { fdc: 172883 }],

  'fast_food',     // Fast food — chain items exactly as USDA lists them (US recipes, 2018)
  ["McDonald's Big Mac",                         'g', 257, 11.8, 20.1, 15,   '1 burger', 219, { fiber: 1.6, sugar: 4, fdc: 170720 }],
  ["McDonald's Filet-O-Fish",                    'g', 282, 11.3, 26.4, 14.6, '1 burger', 134, { fiber: 1.4, sugar: 3.7, fdc: 170319 }],
  ["McDonald's Cheeseburger",                    'g', 263, 13,   27.8, 11.8, '1 burger', 119, { fiber: 1.1, sugar: 6.2, fdc: 170320 }],
  ["McDonald's Double Cheeseburger",             'g', 282, 15.5, 18.8, 16.1, '1 burger', 155, { fiber: 0.8, sugar: 4.2, fdc: 172065 }],
  ["McDonald's Hamburger",                       'g', 264, 12.9, 30.3, 10.1, '1 burger', 95, { fiber: 1.3, sugar: 6, fdc: 170717 }],
  ["McDonald's Quarter Pounder with Cheese",     'g', 258, 14.6, 19.9, 14.2, '1 burger', 199, { fiber: 1.4, sugar: 4.9, fdc: 170719 }],
  ["McDonald's McChicken",                       'g', 273, 10.4, 28,   13.2, '1 burger', 131, { fiber: 1.3, sugar: 3.6, fdc: 173305 }],
  ["McDonald's Chicken McNuggets",               'g', 302, 15.8, 15.1, 19.8, '6 pieces', 95, { fiber: null, sugar: 0.1, fdc: 173297 }],
  ["McDonald's French fries",                    'g', 323, 3.4,  42.6, 15.5, '1 medium serving', 117, { fiber: 3.9, sugar: 0.2, fdc: 170721 }],
  ["McDonald's Hash Brown",                      'g', 271, 2.5,  28.6, 16.3, '1 piece', 53, { fiber: 2.8, sugar: 0.5, fdc: 173298 }],
  ["McDonald's McFlurry with Oreo",              'g', 165, 4,    25.6, 5.7,  '1 regular', 337, { fiber: 0.1, sugar: 21.2, fdc: 173304 }],
  ['Burger King Whopper with cheese',            'g', 250, 11.2, 16.7, 15.3, '1 burger', 316, { fiber: 1, sugar: 4.1, fdc: 170728 }],
  ['Burger King Whopper',                        'g', 233, 10.7, 18.6, 12.8, '1 burger', 291, { fiber: 1.8, sugar: 4.2, fdc: 170727 }],
  ['Burger King Double Whopper with cheese',     'g', 266, 14.5, 13.5, 17.1, '1 burger', 399, { fiber: 1.6, sugar: 3.6, fdc: 170730 }],
  ['Burger King Cheeseburger',                   'g', 286, 14.6, 23.7, 14.8, '1 burger', 133, { fiber: 1, sugar: 4.5, fdc: 170329 }],
  ['Burger King Original Chicken Sandwich',      'g', 286, 12.1, 26.2, 14.7, '1 sandwich', 199, { fiber: 2.4, sugar: 3, fdc: 170331 }],
  ['Burger King Chicken Strips',                 'g', 292, 18.2, 20.5, 15.2, '1 strip', 36, { fiber: 1.3, sugar: 0, fdc: 170731 }],
  ['Burger King French fries',                   'g', 280, 3.2,  38.7, 12.5, '1 medium serving', 117, { fiber: 2.9, sugar: 0.5, fdc: 170327 }],
  ['Burger King Onion Rings',                    'g', 417, 3.9,  43.6, 25.2, '1 medium serving', 117, { fiber: 2.7, sugar: 5.4, fdc: 170771 }],
  ['Burger King Vanilla Shake',                  'g', 168, 3.2,  19,   8.7,  '1 small', 298, { fiber: 0, sugar: 11.7, fdc: 170700 }],
  ['KFC Original Recipe chicken breast',         'g', 231, 21.9, 6.3,  13.1, '1 breast', 212, { fiber: null, sugar: 0, fdc: 170744 }],
  ['KFC Original Recipe chicken drumstick',      'g', 239, 22.3, 5.4,  14.2, '1 drumstick', 75, { fiber: null, sugar: null, fdc: 170745 }],
  ['KFC Original Recipe chicken thigh',          'g', 269, 18.9, 8.5,  17.7, '1 thigh', 135, { fiber: 0, sugar: 0, fdc: 170346 }],
  ['KFC Original Recipe chicken wing',           'g', 297, 21.7, 9.9,  18.9, '1 wing', 60, { fiber: 0, sugar: 0, fdc: 170347 }],
  ['KFC Extra Crispy chicken breast',            'g', 268, 21.2, 8.5,  16.6, '1 breast', 212, { fiber: null, sugar: null, fdc: 170348 }],
  ['KFC Extra Crispy chicken drumstick',         'g', 274, 20.6, 8,    17.7, '1 drumstick', 81, { fiber: null, sugar: null, fdc: 170349 }],
  ['KFC Extra Crispy chicken thigh',             'g', 309, 17.2, 10.3, 22.1, '1 thigh', 152, { fiber: null, sugar: null, fdc: 170746 }],
  ['KFC Extra Crispy chicken wing',              'g', 337, 20.8, 11.7, 23,   '1 wing', 68, { fiber: null, sugar: null, fdc: 170747 }],
  ['KFC Crispy Strips',                          'g', 274, 20.2, 13.7, 15.4, '1 strip', 47, { fiber: 1.4, sugar: 0, fdc: 170341 }],
  ['KFC Popcorn Chicken',                        'g', 351, 17.7, 21.2, 21.7, '10 pieces', 56, { fiber: 1, sugar: 0, fdc: 170737 }],
  ['KFC Coleslaw',                               'g', 144, 0.9,  15.7, 8.6,  '1 portion', 112, { fiber: 2, sugar: 13.5, fdc: 170340 }],
  ['Pizza Hut Cheese pizza, stuffed crust',      'g', 274, 12.2, 30,   11.6, '1 slice', 117, { fiber: 1.7, sugar: 2.9, fdc: 170774 }],
  ["Domino's Cheese pizza",                      'g', 257, 10.8, 33.2, 9,    '1 slice', 108, { fiber: 2.2, sugar: 4, fdc: 173282 }],
  ['Subway Oven Roasted Chicken sub',            'g', 157, 10.8, 21.4, 3.1,  '1 sub (6")', 198, { fiber: 1.2, sugar: 3, fdc: 170314 }],
  ['Subway Steak & Cheese sub',                  'g', 183, 12.3, 21.5, 5.3,  '1 sub (6")', 201, { fiber: 1.2, sugar: 3.4, fdc: 170310 }],
  ['Subway Sweet Onion Chicken Teriyaki sub',    'g', 155, 10.9, 22.5, 2.4,  '1 sub (6")', 228, { fiber: 1.2, sugar: 6.1, fdc: 170705 }],
  ['Popeyes Fried chicken breast',               'g', 274, 21.7, 9.8,  16.5, '1 breast', 194, { fiber: 0.4, sugar: 0, fdc: 170353 }],
  ['Popeyes Fried chicken drumstick',            'g', 293, 20.4, 9.8,  19.1, '1 drumstick', 76, { fiber: null, sugar: null, fdc: 170354 }],
  ['Popeyes Spicy chicken strips',               'g', 253, 19.6, 18.5, 11.2, '1 strip', 53, { fiber: 1.2, sugar: 0, fdc: 170338 }],
  ['Chick-fil-A Chicken Sandwich',               'g', 249, 16.3, 20.9, 11.2, '1 sandwich', 187, { fiber: 1.4, sugar: 3.6, fdc: 170790 }],
  ['Hamburger',                                  'g', 263, 13.3, 29.6, 10.2, '1 burger', 97, { fiber: 1.8, sugar: 6, fdc: 170694 }],
  ['Cheeseburger',                               'g', 270, 13.5, 25.5, 12.9, '1 burger', 127, { fiber: 1.9, sugar: 5.2, fdc: 170691 }],
  ['Chicken nuggets',                            'g', 307, 15.9, 14.9, 20.4, '6 pieces', 96, { fiber: 0.9, sugar: 0.1, fdc: 170718 }],
  ['French fries',                               'g', 312, 3.4,  41.4, 14.7, '1 medium serving', 117, { fiber: 3.8, sugar: 0.3, fdc: 170698 }],
  ['Beef taco',                                  'g', 226, 8.9,  19.9, 12.7, '1 taco', 69, { fiber: 3.9, sugar: 0.9, fdc: 170689 }],
  ['Bean burrito',                               'g', 206, 6.5,  32.9, 6.2,  '1 burrito', 108, { fiber: null, sugar: null, fdc: 172038 }],
  ['Grilled chicken wrap',                       'g', 222, 13.8, 18.4, 10.3, '1 wrap', 123, { fiber: 0.9, sugar: 1.5, fdc: 170786 }],
  ['Soft-serve ice cream cone',                  'g', 163, 4.2,  26.4, 4.9,  '1 cone', 120, { fiber: 0.1, sugar: 19.5, fdc: 173274 }],

  'uzbek',         // Uzbek dishes — estimates, see DISHES below (shawarma too, in fast_food)
  ['Non (flatbread)',              'g', 275, 9.1,  55.7, 1.2,  '1 non', 250, { fiber: 2.2, fdc: 174915 }],   // as white pita: lean wheat flatbread
];

// Dishes: estimates (Uzbek dishes, and shawarma for fast food — USDA has none). Each
// is a typical home recipe in grams of cooked
// ingredients (built-in foods above); its per-100 g values are the ingredients'
// weighted average — the same sum as a user's recipe (recipePer100 in nutrition.js), so
// "Make my own version" turns a dish into a recipe with exactly these numbers.
// [name, category, servingLabel, servingGrams, [[ingredient, grams], …]]
export const DISHES = [
  ['Plov', 'uzbek', '1 plate', 350, [
    ['White rice, cooked', 400], ['Lamb shoulder, stewed', 150], ['Carrots, cooked', 200],
    ['Onion, cooked', 50], ['Cottonseed oil', 45], ['Chickpeas, cooked', 40]]],
  ['Samsa (lamb)', 'uzbek', '1 piece', 120, [
    ['Puff pastry, baked', 45], ['Ground lamb, cooked', 45], ['Onion, cooked', 30]]],
  ['Manti (lamb)', 'uzbek', '1 piece', 50, [
    ['Pasta, cooked', 100], ['Ground lamb, cooked', 70], ['Onion, cooked', 60], ['Lamb fat (dumba), cooked', 10]]],
  ['Lagman', 'uzbek', '1 bowl', 500, [
    ['Pasta, cooked', 200], ['Beef chuck, stewed', 70], ['Red bell pepper', 40], ['Carrots, cooked', 30],
    ['Onion, cooked', 30], ['Tomato', 40], ['Radish (daikon)', 30], ['Cottonseed oil', 15], ['Beef broth', 150]]],
  ['Shurpa', 'uzbek', '1 bowl', 450, [
    ['Beef broth', 300], ['Lamb shoulder, stewed', 100], ['Potato, boiled', 100], ['Carrots, cooked', 60],
    ['Onion, cooked', 30], ['Tomato', 40], ['Chickpeas, cooked', 20]]],
  ['Mastava', 'uzbek', '1 bowl', 450, [
    ['Beef broth', 300], ['White rice, cooked', 80], ['Lamb shoulder, stewed', 70], ['Potato, boiled', 60],
    ['Carrots, cooked', 40], ['Onion, cooked', 30], ['Tomato', 30], ['Cottonseed oil', 10], ['Katyk (plain yogurt)', 30]]],
  ['Chuchvara', 'uzbek', '1 bowl', 400, [
    ['Pasta, cooked', 120], ['Ground beef 90/10, cooked', 60], ['Onion, cooked', 20], ['Beef broth', 200], ['Katyk (plain yogurt)', 30]]],
  ['Dimlama', 'uzbek', '1 plate', 400, [
    ['Lamb shoulder, stewed', 150], ['Potato, boiled', 200], ['Cabbage, cooked', 150], ['Carrots, cooked', 80],
    ['Onion, cooked', 60], ['Tomato', 80], ['Red bell pepper', 60], ['Cottonseed oil', 10]]],
  ['Shashlik (lamb)', 'uzbek', '1 skewer', 80, [
    ['Lamb, grilled', 90], ['Lamb fat (dumba), cooked', 10]]],
  ['Norin', 'uzbek', '1 plate', 250, [
    ['Pasta, cooked', 150], ['Horse meat, cooked', 80], ['Onion', 20], ['Beef broth', 30]]],
  ['Moshkichiri', 'uzbek', '1 plate', 350, [
    ['White rice, cooked', 150], ['Mung beans, cooked', 150], ['Beef chuck, stewed', 60], ['Onion, cooked', 30],
    ['Carrots, cooked', 30], ['Cottonseed oil', 15]]],
  ['Achichuk salad', 'uzbek', '1 bowl', 150, [
    ['Tomato', 150], ['Onion', 50]]],
  ['Shawarma (chicken)', 'fast_food', '1 wrap', 340, [
    ['Flour tortilla', 80], ['Chicken thigh, cooked', 130], ['Tomato', 35], ['Cucumber', 35], ['Cabbage, raw', 30],
    ['Mayonnaise', 20], ['Katyk (plain yogurt)', 10]]],
  ['Shawarma (beef)', 'fast_food', '1 wrap', 340, [
    ['Flour tortilla', 80], ['Beef sirloin steak, cooked', 130], ['Tomato', 35], ['Cucumber', 35], ['Cabbage, raw', 30],
    ['Mayonnaise', 20], ['Katyk (plain yogurt)', 10]]],
  ['Lavash (chicken)', 'fast_food', '1 wrap', 325, [
    ['Flour tortilla', 80], ['Chicken thigh, cooked', 110], ['French fries', 40], ['Tomato', 30], ['Cucumber', 30],
    ['Mayonnaise', 20], ['Ketchup', 15]]],
];

export const FOOD_CATEGORIES = ROWS.filter((r) => typeof r === 'string');

const FOOD_ROWS = ROWS.filter((r) => typeof r !== 'string');

export const BUILTIN_FOODS = FOOD_ROWS.map(([name, baseUnit, kcal, protein, carbs, fat, servingLabel, servingGrams, extra = {}]) => ({
  name, baseUnit,
  kcalPer100: kcal, proteinPer100: protein, carbsPer100: carbs, fatPer100: fat,
  fiberPer100: extra.fiber ?? null, sugarPer100: extra.sugar ?? null,
  servingLabel, servingGrams,
}));

// Per-100 g of a dish from its ingredients (same maths as recipePer100).
const r1 = (x) => Math.round(x * 10) / 10;
const BY_NAME = new Map(BUILTIN_FOODS.map((f) => [f.name, f]));
function dishPer100(items) {
  const grams = items.reduce((a, [, g]) => a + g, 0);
  const avg = (field) => r1(items.reduce((a, [n, g]) => a + BY_NAME.get(n)[field] * g, 0) / grams);
  return { kcalPer100: avg('kcalPer100'), proteinPer100: avg('proteinPer100'), carbsPer100: avg('carbsPer100'), fatPer100: avg('fatPer100') };
}
for (const [name, , servingLabel, servingGrams, items] of DISHES) {
  BUILTIN_FOODS.push({ name, baseUnit: 'g', ...dishPer100(items), fiberPer100: null, sugarPer100: null, servingLabel, servingGrams });
}

// Built-ins taken out of the catalogue (no pork). seedCatalog archives them: past log
// entries keep their own copy of the numbers.
export const RETIRED_FOODS = [
  'Pork loin, cooked', 'Bacon, cooked', "McDonald's Egg McMuffin", 'Pizza Hut Pepperoni pizza, hand-tossed',
  'Pizza Hut Pepperoni pizza, pan', 'Pizza Hut Super Supreme pizza', "Domino's Pepperoni pizza", "Domino's ExtravaganZZa pizza",
  'Subway Black Forest Ham sub', 'Subway Meatball Marinara sub',
];

export const DISH_BY_NAME = Object.fromEntries(DISHES.map(([name, category, servingLabel, servingGrams, items]) => [name, { category, servingLabel, servingGrams, items }]));

// Built-in food name → category. Kept out of the table: it's derived from this file,
// so recategorising never needs a migration.
export const BUILTIN_FOOD_CATEGORY = {};
let current = null;
for (const r of ROWS) {
  if (typeof r === 'string') current = r;
  else BUILTIN_FOOD_CATEGORY[r[0]] = current;
}
for (const [name, category] of DISHES) BUILTIN_FOOD_CATEGORY[name] = category;
