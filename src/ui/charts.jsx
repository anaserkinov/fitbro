import { t } from '../lib/i18n.js';

// Small SVG charts drawn on a fixed viewBox and stretched to the container width.

export function Ring({ size = 116, pct, color = 'var(--accent)', stroke = 10, label, children }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct || 0));
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={label}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${(c * p).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dasharray 0.4s ease' }} />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

const W = 320;

function scale(values, height, pad) {
  const nums = values.filter((v) => v !== null && v !== undefined);
  let min = Math.min(...nums), max = Math.max(...nums);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.08; max += span * 0.08;
  return (v) => pad + (1 - (v - min) / (max - min)) * (height - pad * 2);
}

// series: [{ y, ... }] in order; optional `line` (secondary y values, e.g. 7-day avg),
// `goal` (horizontal dashed line), `dots` to draw raw points.
export function LineChart({ series, height = 120, color = 'var(--accent)', area = true, goal = null, line = null, dots = false, label }) {
  const pts = series.filter((p) => p.y !== null && p.y !== undefined);
  if (pts.length < 2) {
    return <div className="empty small" style={{ height }}>{t('Log a few more sessions to see a trend')}</div>;
  }
  const ys = [...pts.map((p) => p.y), ...(line ? line.filter((v) => v !== null) : []), ...(goal !== null ? [goal] : [])];
  const y = scale(ys, height, 8);
  const x = (i, n) => 3 + (i / Math.max(1, n - 1)) * (W - 6);
  const main = pts.map((p, i) => `${x(i, pts.length).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const last = pts.length - 1;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      {[0.1, 0.5, 0.9].map((f) => <line key={f} x1="0" x2={W} y1={height * f} y2={height * f} stroke="var(--track)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
      {goal !== null && <line x1="0" x2={W} y1={y(goal)} y2={y(goal)} stroke={color} strokeOpacity="0.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
      {area && !dots && <polygon points={`${main} ${x(last, pts.length)},${height} ${x(0, pts.length)},${height}`} fill={color} fillOpacity="0.1" />}
      {dots && pts.map((p, i) => <circle key={i} cx={x(i, pts.length)} cy={y(p.y)} r="2.5" fill={color} fillOpacity="0.45" />)}
      {line && (
        <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          points={line.map((v, i) => (v === null ? null : `${x(i, line.length).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ')} />
      )}
      {!dots && <polyline points={main} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

export function Sparkline({ values, color = 'var(--fat)', height = 24 }) {
  const v = values.filter((n) => n !== null && n !== undefined);
  if (v.length < 2) return <div style={{ height }} />;
  const y = scale(v, height, 3);
  const pts = v.map((n, i) => `${(i / (v.length - 1)) * 140},${y(n).toFixed(1)}`).join(' ');
  return (
    <svg width="100%" height={height} viewBox={`0 0 140 ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
