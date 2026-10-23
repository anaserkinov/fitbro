// Built-in exercise catalogue (user_id 0). Adding a row here and calling seedCatalog()
// inserts it; existing rows are matched by name and left alone.
//
// [name, muscle, equipment, category, trackType, secondaryMuscles, aliases]

const WR = 'weight_reps', BW = 'bodyweight_reps', WBW = 'weighted_bodyweight', DUR = 'duration', DIST = 'distance_duration';
const C = 'compound', I = 'isolation';

const ROWS = [
  // Chest
  ['Barbell Bench Press',        'chest', 'barbell',    C, WR,  ['triceps', 'shoulders'], ['bench', 'bench press', 'bb bench']],
  ['Incline Barbell Bench Press','chest', 'barbell',    C, WR,  ['shoulders', 'triceps'], ['incline bench']],
  ['Decline Bench Press',        'chest', 'barbell',    C, WR,  ['triceps'],              ['decline bench']],
  ['Dumbbell Bench Press',       'chest', 'dumbbell',   C, WR,  ['triceps', 'shoulders'], ['db bench']],
  ['Incline Dumbbell Press',     'chest', 'dumbbell',   C, WR,  ['shoulders', 'triceps'], ['incline db press', 'incline db']],
  ['Dumbbell Fly',               'chest', 'dumbbell',   I, WR,  [],                       ['db fly', 'flyes']],
  ['Cable Fly',                  'chest', 'cable',      I, WR,  [],                       ['cable crossover']],
  ['Chest Press Machine',        'chest', 'machine',    C, WR,  ['triceps'],              ['machine press']],
  ['Pec Deck',                   'chest', 'machine',    I, WR,  [],                       ['machine fly']],
  ['Push-up',                    'chest', 'bodyweight', C, BW,  ['triceps', 'shoulders'], ['pushup', 'push up']],
  ['Dip',                        'chest', 'bodyweight', C, WBW, ['triceps', 'shoulders'], ['dips', 'chest dip']],

  // Back
  ['Deadlift',                   'back', 'barbell',    C, WR,  ['legs', 'core'],         ['dl', 'conventional deadlift']],
  ['Pull-up',                    'back', 'bodyweight', C, WBW, ['biceps'],               ['pullup', 'pull up']],
  ['Chin-up',                    'back', 'bodyweight', C, WBW, ['biceps'],               ['chinup', 'chin up']],
  ['Lat Pulldown',               'back', 'cable',      C, WR,  ['biceps'],               ['pulldown']],
  ['Barbell Row',                'back', 'barbell',    C, WR,  ['biceps'],               ['bent over row', 'bb row']],
  ['Dumbbell Row',               'back', 'dumbbell',   C, WR,  ['biceps'],               ['db row', 'one arm row']],
  ['Seated Cable Row',           'back', 'cable',      C, WR,  ['biceps'],               ['cable row']],
  ['T-Bar Row',                  'back', 'barbell',    C, WR,  ['biceps'],               ['tbar row']],
  ['Chest-Supported Row',        'back', 'machine',    C, WR,  ['biceps'],               ['seal row']],
  ['Straight-Arm Pulldown',      'back', 'cable',      I, WR,  [],                       ['straight arm pulldown']],
  ['Back Extension',             'back', 'bodyweight', I, WBW, ['legs'],                 ['hyperextension']],
  ['Rack Pull',                  'back', 'barbell',    C, WR,  ['legs'],                 []],
  ['Barbell Shrug',              'back', 'barbell',    I, WR,  [],                       ['shrug', 'shrugs']],
  ['Dumbbell Shrug',             'back', 'dumbbell',   I, WR,  [],                       ['db shrug']],

  // Legs
  ['Back Squat',                 'legs', 'barbell',    C, WR,  ['core'],                 ['squat', 'squats']],
  ['Front Squat',                'legs', 'barbell',    C, WR,  ['core'],                 []],
  ['Goblet Squat',               'legs', 'dumbbell',   C, WR,  [],                       []],
  ['Romanian Deadlift',          'legs', 'barbell',    C, WR,  ['back'],                 ['rdl']],
  ['Sumo Deadlift',              'legs', 'barbell',    C, WR,  ['back'],                 ['sumo']],
  ['Leg Press',                  'legs', 'machine',    C, WR,  [],                       []],
  ['Hack Squat',                 'legs', 'machine',    C, WR,  [],                       []],
  ['Bulgarian Split Squat',      'legs', 'dumbbell',   C, WR,  [],                       ['bss', 'split squat']],
  ['Walking Lunge',              'legs', 'dumbbell',   C, WR,  [],                       ['lunges', 'lunge']],
  ['Step-up',                    'legs', 'dumbbell',   C, WR,  [],                       ['step up']],
  ['Hip Thrust',                 'legs', 'barbell',    C, WR,  [],                       ['glute bridge', 'hip thrusts']],
  ['Leg Extension',              'legs', 'machine',    I, WR,  [],                       ['quad extension']],
  ['Lying Leg Curl',             'legs', 'machine',    I, WR,  [],                       ['leg curl', 'hamstring curl']],
  ['Seated Leg Curl',            'legs', 'machine',    I, WR,  [],                       []],
  ['Standing Calf Raise',        'legs', 'machine',    I, WR,  [],                       ['calf raise', 'calves']],
  ['Seated Calf Raise',          'legs', 'machine',    I, WR,  [],                       []],
  ['Hip Adduction Machine',      'legs', 'machine',    I, WR,  [],                       ['adductor', 'adduction']],
  ['Hip Abduction Machine',      'legs', 'machine',    I, WR,  [],                       ['abductor', 'abduction']],

  // Shoulders
  ['Overhead Press',             'shoulders', 'barbell',  C, WR, ['triceps'], ['ohp', 'military press', 'shoulder press']],
  ['Seated Dumbbell Press',      'shoulders', 'dumbbell', C, WR, ['triceps'], ['db shoulder press', 'db press']],
  ['Arnold Press',               'shoulders', 'dumbbell', C, WR, ['triceps'], []],
  ['Machine Shoulder Press',     'shoulders', 'machine',  C, WR, ['triceps'], []],
  ['Lateral Raise',              'shoulders', 'dumbbell', I, WR, [],          ['side raise', 'lateral raises', 'laterals']],
  ['Cable Lateral Raise',        'shoulders', 'cable',    I, WR, [],          []],
  ['Front Raise',                'shoulders', 'dumbbell', I, WR, [],          []],
  ['Rear Delt Fly',              'shoulders', 'dumbbell', I, WR, ['back'],    ['reverse fly', 'rear delt']],
  ['Reverse Pec Deck',           'shoulders', 'machine',  I, WR, ['back'],    []],
  ['Face Pull',                  'shoulders', 'cable',    I, WR, ['back'],    ['face pulls']],
  ['Upright Row',                'shoulders', 'barbell',  C, WR, ['back'],    []],

  // Arms
  ['Barbell Curl',               'arms', 'barbell',  I, WR,  [],            ['bb curl', 'biceps curl']],
  ['Dumbbell Curl',              'arms', 'dumbbell', I, WR,  [],            ['db curl', 'bicep curl']],
  ['Hammer Curl',                'arms', 'dumbbell', I, WR,  [],            ['hammers']],
  ['Incline Dumbbell Curl',      'arms', 'dumbbell', I, WR,  [],            ['incline curl']],
  ['Preacher Curl',              'arms', 'barbell',  I, WR,  [],            ['ez preacher']],
  ['Cable Curl',                 'arms', 'cable',    I, WR,  [],            []],
  ['Triceps Pushdown',           'arms', 'cable',    I, WR,  [],            ['pushdown', 'tricep pushdown', 'rope pushdown']],
  ['Overhead Triceps Extension', 'arms', 'cable',    I, WR,  [],            ['overhead extension', 'french press']],
  ['Skull Crusher',              'arms', 'barbell',  I, WR,  [],            ['skullcrusher', 'lying triceps extension']],
  ['Close-Grip Bench Press',     'arms', 'barbell',  C, WR,  ['chest'],     ['cgbp', 'close grip bench']],
  ['Bench Dip',                  'arms', 'bodyweight', C, BW, ['chest'],    []],
  ['Wrist Curl',                 'arms', 'dumbbell', I, WR,  [],            ['forearm curl']],

  // Core
  ['Plank',                      'core', 'bodyweight', I, DUR, [],   []],
  ['Side Plank',                 'core', 'bodyweight', I, DUR, [],   []],
  ['Hanging Leg Raise',          'core', 'bodyweight', I, BW,  [],   ['leg raise', 'hanging knee raise']],
  ['Crunch',                     'core', 'bodyweight', I, BW,  [],   ['crunches', 'sit-up']],
  ['Cable Crunch',               'core', 'cable',      I, WR,  [],   []],
  ['Ab Wheel Rollout',           'core', 'other',      I, BW,  [],   ['ab wheel', 'rollout']],
  ['Russian Twist',              'core', 'other',      I, WR,  [],   []],
  ['Dead Bug',                   'core', 'bodyweight', I, BW,  [],   []],
  ['Pallof Press',               'core', 'cable',      I, WR,  [],   []],

  // Cardio
  ['Running',                    'cardio', 'other',   C, DIST, [], ['run', 'jog']],
  ['Treadmill',                  'cardio', 'machine', C, DIST, [], []],
  ['Walking',                    'cardio', 'other',   C, DIST, [], ['walk']],
  ['Cycling',                    'cardio', 'other',   C, DIST, [], ['bike', 'ride']],
  ['Stationary Bike',            'cardio', 'machine', C, DIST, [], ['exercise bike', 'spin']],
  ['Rowing Machine',             'cardio', 'machine', C, DIST, [], ['row erg', 'rower', 'erg']],
  ['Elliptical',                 'cardio', 'machine', C, DUR,  [], ['cross trainer']],
  ['Stair Climber',              'cardio', 'machine', C, DUR,  [], ['stairmaster', 'stairs']],
  ['Jump Rope',                  'cardio', 'other',   C, DUR,  [], ['skipping']],

  // Dumbbell and home training (programs)
  ['Dumbbell Romanian Deadlift', 'legs', 'dumbbell', C, WR, ['back'], ['db rdl']],
  ['Dumbbell Calf Raise',        'legs', 'dumbbell', I, WR, [], ['db calf raise']],
  ['Inverted Row',               'back', 'bodyweight', C, BW, ['biceps'], ['body row', 'australian pull-up']],
  ['Pike Push-up',               'shoulders', 'bodyweight', C, BW, ['triceps'], ['pike pushup']],
  ['Glute Bridge',               'legs', 'bodyweight', I, BW, ['core'], ['hip bridge']],
  ['Bodyweight Squat',           'legs', 'bodyweight', C, BW, [], ['air squat']],
  ['Single-Leg Calf Raise',      'legs', 'bodyweight', I, BW, [], ['single leg calf raise']],
  ['Reverse Lunge',              'legs', 'bodyweight', C, BW, [], ['back lunge']],

  // Full body
  ['Kettlebell Swing',           'full_body', 'kettlebell', C, WR, ['legs', 'back'], ['kb swing']],
  ['Power Clean',                'full_body', 'barbell',    C, WR, ['legs', 'back'], ['clean']],
  ['Thruster',                   'full_body', 'barbell',    C, WR, ['legs', 'shoulders'], []],
  ['Burpee',                     'full_body', 'bodyweight', C, BW, [], ['burpees']],
];

export const BUILTIN_EXERCISES = ROWS.map(([name, muscle, equipment, category, trackType, secondaryMuscles, aliases]) => ({
  name, muscle, equipment, category, trackType,
  secondaryMuscles: secondaryMuscles.length ? secondaryMuscles : null,
  aliases: aliases.length ? aliases : null,
}));
