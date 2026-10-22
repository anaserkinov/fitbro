import { useState } from 'react';
import { useApi } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { MUSCLE_LABEL, shortDay, signed } from '../lib/format.js';
import { describePr } from '../../tgcloud/lib/strength.js';
import { Loader, Section, List, Row, Empty } from '../ui/kit.jsx';
import { LineChart } from '../ui/charts.jsx';
import { tg, inTelegram } from '../lib/tg.js';

export const RANGES = [{ value: 4, label: '1M' }, { value: 12, label: '3M' }, { value: 26, label: '6M' }, { value: 52, label: '1Y' }];
const PR_ICON = { max_weight: ['trophy', '#E8A400'], e1rm: ['trend', '#1E73BE'], session_volume: ['bars', '#8E5BD8'], max_reps: ['trend', '#1E73BE'], max_duration: ['clock', '#23843F'], max_distance: ['trend', '#23843F'] };

// Which number to chart for an exercise's tracking type.
export function metricFor(track) {
  if (track === 'duration') return { key: 'maxDurationSec', label: 'Longest set', fmt: (v, f) => f.dur(v) };
  if (track === 'distance_duration') return { key: 'maxDistanceM', label: 'Longest distance', fmt: (v) => `${(v / 1000).toFixed(2)} km` };
  if (track === 'bodyweight_reps') return { key: 'maxReps', label: 'Most reps', fmt: (v) => `${v} reps` };
  return { key: 'e1rmKg', label: 'Estimated 1RM', fmt: (v, f) => f.w(v) };
}

export function StrengthChart({ exerciseId, weeks, onWeeks }) {
  const { fmt } = useUser();
  const q = useApi('getExerciseHistory', { exerciseId, weeks });
  return (
    <Loader q={q}>
      {(h) => {
        const m = metricFor(h.exercise.trackType);
        const pts = h.series.map((s) => s[m.key]).filter((v) => v !== null);
        const last = pts[pts.length - 1];
        const delta = pts.length > 1 ? last - pts[0] : null;
        const scaled = (v) => (m.key === 'e1rmKg' ? fmt.wNum(v) : v);
        return (
          <div className="card">
            <div className="row-between" style={{ alignItems: 'flex-end' }}>
              <div>
                <div className="small hint">{m.label}</div>
                <div className="big-num">{last !== undefined ? m.fmt(last, fmt) : '—'}</div>
              </div>
              {delta !== null && delta !== 0 && (
                <span className="badge green" style={{ height: 26, fontSize: 13, background: delta > 0 ? 'var(--good-soft)' : 'var(--field)', color: delta > 0 ? 'var(--good)' : 'var(--hint)' }}>
                  {signed(scaled(delta), m.key === 'e1rmKg' ? 1 : 0)}{m.key === 'e1rmKg' ? ` ${fmt.weightUnit}` : ''}
                </span>
              )}
            </div>
            <LineChart series={pts.map((y) => ({ y: scaled(y) }))} label={`${m.label} over time`} />
            <div className="row-between tiny hint"><span>{h.series[0] ? shortDay(h.series[0].date) : ''}</span><span>Now</span></div>
            <div className="segmented" style={{ background: 'transparent', gap: 6 }} role="tablist" aria-label="Range">
              {RANGES.map((r) => (
                <button key={r.value} type="button" role="tab" aria-selected={weeks === r.value} onClick={() => onWeeks(r.value)}
                  style={{ background: weeks === r.value ? 'var(--accent-soft)' : 'transparent', color: weeks === r.value ? 'var(--link)' : 'var(--hint)', boxShadow: 'none', fontWeight: 600 }}>{r.label}</button>
              ))}
            </div>
          </div>
        );
      }}
    </Loader>
  );
}

export function RecordsList({ exerciseId, weeks }) {
  const { fmt } = useUser();
  const q = useApi('getExerciseHistory', { exerciseId, weeks });
  if (!q.data) return null;
  const recs = q.data.records;
  return (
    <Section title="Personal records">
      {!recs.length ? <div className="card"><Empty>Records appear after your first sessions.</Empty></div> : (
        <List>
          {recs.map((r) => {
            const [icon, color] = PR_ICON[r.type] || ['trophy', '#E8A400'];
            const [label, value] = describePr(r, (kg) => fmt.w(kg)).split(': ');
            return <Row key={r.type} icon={icon} iconColor={color} title={label} value={<span style={{ color: 'var(--text)', fontWeight: 600 }}>{value}</span>}><span className="small hint" style={{ width: 48, textAlign: 'right' }}>{shortDay(new Date(r.achievedAt).toISOString().slice(0, 10))}</span></Row>;
          })}
        </List>
      )}
    </Section>
  );
}

export default function ExerciseDetail({ id }) {
  const { fmt } = useUser();
  const nav = useNav();
  const [weeks, setWeeks] = useState(12);
  const q = useApi('getExerciseHistory', { exerciseId: id, weeks });
  return (
    <div className="screen sub">
      <Loader q={q}>
        {(h) => (
          <>
            <div className="row-between" style={{ padding: '0 4px', alignItems: 'flex-end' }}>
              <div className="stack-sm" style={{ gap: 2 }}>
                <span className="eyebrow">{MUSCLE_LABEL[h.exercise.muscle]}{h.exercise.equipment ? ` · ${h.exercise.equipment}` : ''}</span>
                <h1 className="title">{h.exercise.name}</h1>
              </div>
              {h.exercise.userId !== 0 && <button type="button" className="btn ghost" onClick={() => nav.push('ExerciseEditor', { id })}>Edit</button>}
            </div>
            {(h.exercise.notes || h.exercise.link) && (
              <div className="card">
                {h.exercise.notes && <p style={{ whiteSpace: 'pre-line' }}>{h.exercise.notes}</p>}
                {h.exercise.link && <a href={h.exercise.link} target="_blank" rel="noreferrer" onClick={(e) => { if (inTelegram) { e.preventDefault(); tg.openLink(h.exercise.link); } }}>Open form guide</a>}
              </div>
            )}
            <StrengthChart exerciseId={id} weeks={weeks} onWeeks={setWeeks} />
            <RecordsList exerciseId={id} weeks={weeks} />
            <Section title="Recent sessions">
              {!h.sessions.length ? <div className="card"><Empty>No sessions in this period.</Empty></div> : (
                <List>
                  {h.sessions.map((s) => (
                    <Row key={s.workoutId} title={shortDay(s.date)} onClick={() => nav.push('Workout', { id: s.workoutId })} chevron
                      sub={s.sets.map((x) => (x.weightKg ? `${fmt.w(x.weightKg, { suffix: false })}×${x.reps}` : x.reps ? `×${x.reps}` : x.durationSec ? fmt.dur(x.durationSec) : '')).join(', ')}
                      value={s.volumeKg ? fmt.w(s.volumeKg, { digits: 0 }) : null} />
                  ))}
                </List>
              )}
            </Section>
          </>
        )}
      </Loader>
    </div>
  );
}
