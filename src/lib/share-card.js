import { t, cname } from './i18n.js';
import { longDay } from './format.js';
import { workoutName } from './workout-start.js';
import { describePr } from '../../tgcloud/lib/strength.js';

// Draws a finished workout as a 1080×1350 PNG (Telegram's portrait photo ratio) and
// returns it as base64 for prepareShare. Text is translated at draw time.

const W = 1080, H = 1350;

function fit(ctx, text, maxWidth, size, weight = 700) {
  let s = size;
  do { ctx.font = `${weight} ${s}px -apple-system, system-ui, "Segoe UI", Roboto, sans-serif`; s -= 4; } while (ctx.measureText(text).width > maxWidth && s > 24);
}

export function drawWorkoutCard({ workout, prs = [], fmt }) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1E73BE'); bg.addColorStop(1, '#0B3D6E');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#FFFFFF'; ctx.textBaseline = 'top';

  fit(ctx, 'FitPro', 400, 44); ctx.globalAlpha = 0.85; ctx.fillText('💪 FitPro', 80, 80); ctx.globalAlpha = 1;

  const name = workoutName(workout.name);
  fit(ctx, name, W - 160, 96); ctx.fillText(name, 80, 200);
  fit(ctx, longDay(workout.localDate), W - 160, 40, 500); ctx.globalAlpha = 0.8; ctx.fillText(longDay(workout.localDate), 80, 320); ctx.globalAlpha = 1;

  const stats = [
    [fmt.dur(workout.durationSec), t('Duration')],
    [String(workout.totalSets ?? 0), t.n(workout.totalSets ?? 0, 'Set@count', 'Sets@count')],
    [fmt.n(fmt.wNum(workout.totalVolumeKg || 0)), t('{unit} volume', { unit: fmt.weightLabel })],
  ];
  const colW = (W - 160) / 3;
  stats.forEach(([value, label], i) => {
    const x = 80 + i * colW;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.roundRect(x, 430, colW - 24, 220, 28); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    fit(ctx, value, colW - 72, 72); ctx.fillText(value, x + 24, 470);
    fit(ctx, label, colW - 72, 34, 500); ctx.globalAlpha = 0.8; ctx.fillText(label, x + 24, 580); ctx.globalAlpha = 1;
  });

  const top = prs.filter((p) => p.type !== 'reps_at_weight').slice(0, 3);
  if (top.length) {
    fit(ctx, t('New records'), W - 160, 44); ctx.fillText(`🏆 ${t('New records')}`, 80, 730);
    top.forEach((p, i) => {
      const line = `${cname(p.exerciseName)} — ${describePr(p, (kg) => fmt.w(kg), t)}`;
      fit(ctx, line, W - 160, 38, 500); ctx.fillText(line, 80, 810 + i * 70);
    });
  }

  fit(ctx, t('Tracked with FitPro'), W - 160, 36, 500); ctx.globalAlpha = 0.7; ctx.fillText(t('Tracked with FitPro'), 80, H - 120); ctx.globalAlpha = 1;
  return canvas.toDataURL('image/png').split(',')[1];
}
