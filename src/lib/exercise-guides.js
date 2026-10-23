// Form guides for the built-in exercises (tgcloud/lib/data/exercises.js): two photos —
// start and end position — and a few short cues to glance at between sets.
//
// Photos: free-exercise-db (github.com/yuhonas/free-exercise-db, public domain),
// converted to 600px WebP in src/assets/exercises/<slug>-0|1.webp. Burpee has no photo.
// Cues are English translation keys (src/i18n/guides.js) — wrap with t() at render.
//
// Keyed by the exact English name. A custom exercise can't reuse a built-in name
// (assertNameFree in tgcloud/lib/exercises.js), so matching by name is safe.

const PHOTOS = import.meta.glob('../assets/exercises/*.webp', { eager: true, query: '?url', import: 'default' });

const SLOW_RAISE = 'Lower slowly, no swinging';
const RAISE_HEELS = ['Lower heels for a full stretch', 'Rise as high as you can, pause'];
const SHRUG = ['Shoulders straight up to the ears', 'Pause, lower slowly — no rolling'];
const ELBOWS_IN = 'Elbows pinned at your sides';
const CURL_DOWN = 'Lower all the way';
const NO_SAG = 'Don’t let your hips sag';
const BIKE = ['Saddle so the knee is slightly bent at the bottom', 'Smooth, steady pedalling', 'Relaxed grip and shoulders'];

const CUES = {
  // Chest
  'Barbell Bench Press':         ['Shoulder blades squeezed, feet planted', 'Lower the bar to mid-chest', 'Press up and slightly back'],
  'Incline Barbell Bench Press': ['Bench at 30–45°', 'Lower the bar to upper chest', 'Elbows slightly tucked, press up'],
  'Decline Bench Press':         ['Lock your legs in, shoulder blades back', 'Lower the bar to lower chest', 'Press straight up'],
  'Dumbbell Bench Press':        ['Dumbbells over your chest, palms forward', 'Lower until elbows are just below the bench', 'Press up, bringing the dumbbells together'],
  'Incline Dumbbell Press':      ['Bench at 30–45°', 'Lower the dumbbells to upper chest', 'Press up, don’t bang them together'],
  'Dumbbell Fly':                ['Slight bend in the elbows, keep it fixed', 'Open wide until you feel a chest stretch', 'Bring them up in a wide arc'],
  'Cable Fly':                   ['Step forward, slight lean', 'Soft elbows, bring the hands together in an arc', 'Squeeze the chest, return slowly'],
  'Chest Press Machine':         ['Handles at mid-chest height', 'Back flat against the pad', 'Press out, return slowly'],
  'Pec Deck':                    ['Seat so the handles are at chest height', 'Bring the pads together, squeeze', 'Open slowly to a chest stretch'],
  'Push-up':                     ['Hands just wider than shoulders', 'Body straight from head to heels', 'Chest a fist above the floor, push up'],
  'Dip':                         ['Lean forward slightly for chest', 'Lower until shoulders are at elbow level', 'Push up to straight arms'],

  // Back
  'Deadlift':                    ['Bar over mid-foot, shins close', 'Flat back, chest up, brace', 'Push the floor away, hips and shoulders rise together'],
  'Pull-up':                     ['Overhand grip, a bit wider than shoulders', 'Pull your chest toward the bar', 'Lower all the way, no swinging'],
  'Chin-up':                     ['Underhand grip, shoulder width', 'Pull until your chin clears the bar', 'Lower all the way, no swinging'],
  'Lat Pulldown':                ['Thighs locked under the pad', 'Pull the bar to upper chest, elbows down', 'Let it rise slowly to a full stretch'],
  'Barbell Row':                 ['Hinge to about 45°, back flat', 'Pull the bar to your lower ribs', 'Lower with control, no jerking'],
  'Dumbbell Row':                ['Hand and knee on the bench, back flat', 'Pull the dumbbell toward your hip', 'Lower to a full stretch'],
  'Seated Cable Row':            ['Sit tall, knees slightly bent', 'Pull to your belly, squeeze the shoulder blades', 'Reach forward without rounding'],
  'T-Bar Row':                   ['Hinge forward, back flat', 'Pull the handle to your chest', 'Lower slowly, keep the torso still'],
  'Chest-Supported Row':         ['Chest on the pad the whole set', 'Pull the elbows back past your torso', 'Lower to straight arms'],
  'Straight-Arm Pulldown':       ['Arms almost straight, slight hinge', 'Sweep the bar down to your thighs', 'Return slowly to eye level'],
  'Back Extension':              ['Hips just over the edge of the pad', 'Lower with a flat back', 'Rise to a straight line, don’t overarch'],
  'Rack Pull':                   ['Bar starts around knee height', 'Flat back, brace hard', 'Drive the hips forward to stand tall'],
  'Barbell Shrug':               ['Hold the bar at arm’s length', ...SHRUG],
  'Dumbbell Shrug':              ['Dumbbells at your sides', ...SHRUG],

  // Legs
  'Back Squat':                  ['Bar on upper back, feet shoulder width', 'Sit down and back, knees follow the toes', 'Thighs to parallel or lower, drive up'],
  'Front Squat':                 ['Bar on the front of the shoulders, elbows high', 'Torso upright, sit straight down', 'Drive up through mid-foot'],
  'Goblet Squat':                ['Hold the weight at your chest', 'Squat down between your knees', 'Chest up, push through the heels'],
  'Romanian Deadlift':           ['Soft knees, push the hips back', 'Bar slides down the thighs, back flat', 'Stop at a hamstring stretch, hips forward to stand'],
  'Sumo Deadlift':               ['Wide stance, toes out, grip inside the knees', 'Chest up, knees pushed out', 'Push the floor apart and stand up'],
  'Leg Press':                   ['Feet shoulder width, mid-platform', 'Lower until the knees reach about 90°', 'Press up, don’t lock the knees'],
  'Hack Squat':                  ['Back and shoulders against the pads', 'Lower until thighs are parallel', 'Drive up through the heels'],
  'Bulgarian Split Squat':       ['Rear foot on a bench behind you', 'Drop the back knee straight down', 'Push through the front heel'],
  'Walking Lunge':               ['Long step forward', 'Back knee almost touches the floor', 'Push off the front foot into the next step'],
  'Step-up':                     ['Whole foot on the box', 'Drive up with the top leg only', 'Step down with control'],
  'Hip Thrust':                  ['Upper back on the bench, bar on the hips', 'Drive the hips up until the body is level', 'Squeeze the glutes at the top, chin tucked'],
  'Leg Extension':               ['Knees in line with the machine pivot', 'Straighten the legs fully, squeeze', 'Lower slowly'],
  'Lying Leg Curl':              ['Pad just above the heels', 'Hips pressed into the bench', 'Curl up, lower slowly'],
  'Seated Leg Curl':             ['Knees in line with the pivot, thigh pad snug', 'Curl the heels toward you', 'Return slowly to straight legs'],
  'Standing Calf Raise':         ['Balls of the feet on the edge', ...RAISE_HEELS],
  'Seated Calf Raise':           ['Pad snug on the knees', ...RAISE_HEELS],
  'Hip Adduction Machine':       ['Sit tall, back against the pad', 'Squeeze the legs together', 'Return slowly, don’t let the weight slam'],
  'Hip Abduction Machine':       ['Sit tall, back against the pad', 'Push the knees out', 'Return slowly, don’t let the weight slam'],

  // Shoulders
  'Overhead Press':              ['Bar on the front of the shoulders', 'Squeeze the glutes, ribs down', 'Press straight up, head through at the top'],
  'Seated Dumbbell Press':       ['Back against an upright bench', 'Dumbbells at ear height', 'Press up until the arms are straight'],
  'Arnold Press':                ['Start with palms facing you at chin height', 'Turn the palms forward as you press', 'Reverse the turn on the way down'],
  'Machine Shoulder Press':      ['Handles at shoulder height', 'Press up without arching your back', 'Lower slowly'],
  'Lateral Raise':               ['Slight bend in the elbows', 'Raise to shoulder height, elbows lead', SLOW_RAISE],
  'Cable Lateral Raise':         ['Cable from the low pulley, across your body', 'Raise to shoulder height, elbows lead', SLOW_RAISE],
  'Front Raise':                 ['Arms almost straight', 'Raise to eye level in front of you', SLOW_RAISE],
  'Rear Delt Fly':               ['Hinge forward, back flat', 'Raise the arms out to the sides', 'Squeeze the rear delts, lower slowly'],
  'Reverse Pec Deck':            ['Chest against the pad', 'Sweep the arms back, elbows soft', 'Return slowly'],
  'Face Pull':                   ['Rope at face height', 'Pull to your forehead, hands apart', 'Elbows high, squeeze the shoulder blades'],
  'Upright Row':                 ['Grip about shoulder width', 'Pull the bar up, elbows lead', 'Stop at shoulder height'],

  // Arms
  'Barbell Curl':                [ELBOWS_IN, 'Curl up without swinging', CURL_DOWN],
  'Dumbbell Curl':               [ELBOWS_IN, 'Turn the palms up as you curl', CURL_DOWN],
  'Hammer Curl':                 ['Palms facing each other', 'Curl up without swinging', CURL_DOWN],
  'Incline Dumbbell Curl':       ['Bench at about 45°, arms hanging', 'Curl up, elbows stay back', CURL_DOWN],
  'Preacher Curl':               ['Armpits snug on the pad', 'Curl up, squeeze at the top', 'Lower slowly to almost straight'],
  'Cable Curl':                  [ELBOWS_IN, 'Curl up without swinging', CURL_DOWN],
  'Triceps Pushdown':            [ELBOWS_IN, 'Push down until the arms are straight', 'Let it rise to just above 90°'],
  'Overhead Triceps Extension':  ['Elbows pointing up, close to your head', 'Lower behind your head for a stretch', 'Straighten the arms fully'],
  'Skull Crusher':               ['Arms straight up over your chest', 'Bend only the elbows, lower toward the forehead', 'Straighten the arms fully'],
  'Close-Grip Bench Press':      ['Hands shoulder width', 'Elbows close to your body', 'Lower to lower chest, press up'],
  'Bench Dip':                   ['Hands on the bench edge, hips close', 'Lower until the elbows are at 90°', 'Push up to straight arms'],
  'Wrist Curl':                  ['Forearms on your thighs, palms up', 'Let the weight roll down to your fingers', 'Curl the wrists up as high as you can'],

  // Core
  'Plank':                       ['Elbows under the shoulders', 'Body straight, squeeze the glutes', NO_SAG],
  'Side Plank':                  ['Elbow under the shoulder, feet stacked', 'Lift the hips into a straight line', NO_SAG],
  'Hanging Leg Raise':           ['Hang with straight arms, no swinging', 'Raise the legs by curling the pelvis up', 'Lower slowly'],
  'Crunch':                      ['Knees bent, feet flat', 'Curl the shoulders off the floor', 'Don’t pull on your neck'],
  'Cable Crunch':                ['Kneel, rope beside your head', 'Curl down, elbows toward the knees', 'Hips stay still'],
  'Ab Wheel Rollout':            ['Start on your knees, wheel under the shoulders', 'Roll out with a braced, flat back', 'Pull back with your abs'],
  'Russian Twist':               ['Lean back, feet up or on the floor', 'Turn your chest side to side', 'Keep your back straight'],
  'Dead Bug':                    ['Lower back pressed to the floor', 'Lower the opposite arm and leg', 'Return, switch sides'],
  'Pallof Press':                ['Stand side-on to the cable', 'Press the handle straight out from your chest', 'Don’t let it twist you'],

  // Cardio
  'Running':                     ['Short, quick steps', 'Land under your hips', 'Relaxed shoulders, arms swing'],
  'Treadmill':                   ['Stand tall, look ahead', 'Rails only to get on and off', 'Add incline for more effort'],
  'Walking':                     ['Stand tall, look ahead', 'Arms swing naturally', 'Brisk: you can talk, but not sing'],
  'Cycling':                     BIKE,
  'Stationary Bike':             BIKE,
  'Rowing Machine':              ['Legs, then body, then arms', 'Back: arms, body, then legs', 'Keep your back straight'],
  'Elliptical':                  ['Stand tall, look ahead', 'Push and pull the handles', 'Whole foot stays on the pedal'],
  'Stair Climber':               ['Stand tall, light grip on the rails', 'Whole foot on each step', 'Don’t lean on the machine'],
  'Jump Rope':                   ['Small jumps on the balls of your feet', 'Turn the rope with your wrists', 'Elbows close to your body'],

  // Full body
  'Kettlebell Swing':            ['Hinge at the hips, it’s not a squat', 'Snap the hips forward to swing the bell', 'Arms relaxed, bell floats to chest height'],
  'Power Clean':                 ['Start like a deadlift, back flat', 'Jump and shrug, pull the bar high', 'Catch it on your shoulders in a quarter squat'],
  'Thruster':                    ['Weight on the front of the shoulders', 'Squat down to parallel', 'Drive up and press overhead in one move'],
  'Burpee':                      ['Squat, hands to the floor', 'Jump the feet back to a plank', 'Jump the feet in, then jump up'],
};

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// { photos: [startUrl, endUrl] (may be empty), cues: [English keys] } or null.
export function exerciseGuide(name) {
  const cues = CUES[name];
  if (!cues) return null;
  const s = slug(name);
  const photos = [PHOTOS[`../assets/exercises/${s}-0.webp`], PHOTOS[`../assets/exercises/${s}-1.webp`]].filter(Boolean);
  return { photos, cues };
}
