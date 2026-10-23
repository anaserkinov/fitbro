// Achievement catalogue — plain data, shared by the bot (lib/achievements.js) and the
// Mini App. Adding a badge needs no migration: only grants are stored.
// `metric` is a field of the stats snapshot in lib/achievements.js; earned at >= `at`.
// Titles and hints are English translation keys (tgcloud/lib/i18n/friends.js).

export const ACHIEVEMENTS = [
  { code: 'first_workout', icon: '🏁', metric: 'workouts', at: 1, title: 'First workout', hint: 'Finish your first workout' },
  { code: 'workouts_10', icon: '💪', metric: 'workouts', at: 10, title: '10 workouts', hint: 'Finish 10 workouts' },
  { code: 'workouts_50', icon: '🏋️', metric: 'workouts', at: 50, title: '50 workouts', hint: 'Finish 50 workouts' },
  { code: 'workouts_100', icon: '💯', metric: 'workouts', at: 100, title: '100 workouts', hint: 'Finish 100 workouts' },
  { code: 'workouts_250', icon: '🏆', metric: 'workouts', at: 250, title: '250 workouts', hint: 'Finish 250 workouts' },
  { code: 'first_pr', icon: '🥇', metric: 'prs', at: 1, title: 'First record', hint: 'Beat one of your records' },
  { code: 'prs_10', icon: '🎯', metric: 'prs', at: 10, title: '10 records', hint: 'Beat your records 10 times' },
  { code: 'streak_4', icon: '🔥', metric: 'goalStreak', at: 4, title: '4-week streak', hint: 'Hit your weekly goal 4 weeks in a row' },
  { code: 'streak_12', icon: '⚡', metric: 'goalStreak', at: 12, title: '12-week streak', hint: 'Hit your weekly goal 12 weeks in a row' },
  { code: 'streak_26', icon: '🌟', metric: 'goalStreak', at: 26, title: 'Half-year streak', hint: 'Hit your weekly goal 26 weeks in a row' },
  { code: 'session_10t', icon: '🦍', metric: 'maxSessionKg', at: 10000, title: '10-tonne session', hint: 'Move 10 tonnes in one workout' },
  { code: 'lifetime_100t', icon: '🚀', metric: 'lifetimeKg', at: 100000, title: '100 tonnes lifted', hint: 'Move 100 tonnes in total' },
];

export const ACHIEVEMENT_BY_CODE = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.code, a]));
