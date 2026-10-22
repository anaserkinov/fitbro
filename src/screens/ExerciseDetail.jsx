import { useState } from 'react';
import { useApi } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { MUSCLE_LABEL, shortDay, signed } from '../lib/format.js';
import { Loader, Section, List, Row, Empty } from '../ui/kit.jsx';
import { LineChart } from '../ui/charts.jsx';
import { tg, inTelegram } from '../lib/tg.js';
import { t, cname } from '../lib/i18n.js';

// English labels (translation keys) — wrap with t() at display.
export const EQUIPMENT_LABEL = { barbell: 'Barbell', dumbbell: 'Dumbbell', machine: 'Machine', cable: 'Cable', bodyweight: 'Bodyweight', kettlebell: 'Kettlebell', band: 'Band', other: 'Other' };
export const RANGES = [{ value: 4, label: '1M' }, { value: 12, label: '3M' }, { value: 26, label: '6M' }, { value: 52, label: '1Y' }];
// A record as [label, value], e.g. ['Heaviest set', '85 kg × 3'] — the Mini App's
// translated counterpart of describePr() in tgcloud/lib/strength.js.
export function prText(pr, fmt) {
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  switch (pr.type) {
    case 'max_weight':     return [t('Heaviest set'), `${fmt.w(pr.value)} × ${pr.reps}`];
    case 'e1rm':           return [t('Estimated 1RM'), fmt.w(pr.value)];
    case 'reps_at_weight': return [t('Most reps at {w}', { w: fmt.w(pr.weightKg) }), String(pr.value)];
    case 'max_reps':       return [t('Most reps'), String(pr.value)];
    case 'session_volume': return [t('Best session volume'), fmt.w(pr.value)];
    case 'max_duration':   return [t('Longest'), mmss(pr.value)];
    case 'max_distance':   return [t('Longest distance'), `${fmt.n(pr.value / 1000, 2)} ${t('km')}`];
    default:               return [pr.type, ''];
  }
}

const PR_ICON = { max_weight: ['trophy', '#E8A400'], e1rm: ['trend', '#1E73BE'], session_volume: ['bars', '#8E5BD8'], max_reps: ['trend', '#1E73BE'], max_duration: ['clock', '#23843F'], max_distance: ['trend', '#23843F'] };

// Which number to chart for an exercise's tracking type.
export function metricFor(track) {
  if (track === 'duration') return { key: 'maxDurationSec', label: t('Longest set'), fmt: (v, f) => f.dur(v) };
  if (track === 'distance_duration') return { key: 'maxDistanceM', label: t('Longest distance'), fmt: (v, f) => `${f.n(v / 1000, 2)} ${t('km')}` };
  if (track === 'bodyweight_reps') return { key: 'maxReps', label: t('Most reps'), fmt: (v) => t.n(v, '{n} rep', '{n} reps') };
  return { key: 'e1rmKg', label: t('Estimated 1RM'), fmt: (v, f) => f.w(v) };
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
                  {signed(scaled(delta), m.key === 'e1rmKg' ? 1 : 0)}{m.key === 'e1rmKg' ? ` ${fmt.weightLabel}` : ''}
                </span>
              )}
            </div>
            <LineChart series={pts.map((y) => ({ y: scaled(y) }))} label={t('{metric} over time', { metric: m.label })} />
            <div className="row-between tiny hint"><span>{h.series[0] ? shortDay(h.series[0].date) : ''}</span><span>{t('Now')}</span></div>
            <div className="segmented" style={{ background: 'transparent', gap: 6 }} role="tablist" aria-label={t('Range')}>
              {RANGES.map((r) => (
                <button key={r.value} type="button" role="tab" aria-selected={weeks === r.value} onClick={() => onWeeks(r.value)}
                  style={{ background: weeks === r.value ? 'var(--accent-soft)' : 'transparent', color: weeks === r.value ? 'var(--link)' : 'var(--hint)', boxShadow: 'none', fontWeight: 600 }}>{t(r.label)}</button>
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
    <Section title={t('Personal records')}>
      {!recs.length ? <div className="card"><Empty>{t('Records appear after your first sessions.')}</Empty></div> : (
        <List>
          {recs.map((r) => {
            const [icon, color] = PR_ICON[r.type] || ['trophy', '#E8A400'];
            const [label, value] = prText(r, fmt);
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
                <span className="eyebrow">{t(MUSCLE_LABEL[h.exercise.muscle])}{h.exercise.equipment ? ` · ${t(EQUIPMENT_LABEL[h.exercise.equipment] || h.exercise.equipment)}` : ''}</span>
                <h1 className="title">{cname(h.exercise.name)}</h1>
              </div>
              {h.exercise.userId !== 0 && <button type="button" className="btn ghost" onClick={() => nav.push('ExerciseEditor', { id })}>{t('Edit')}</button>}
            </div>
            {(h.exercise.notes || h.exercise.link) && (
              <div className="card">
                {h.exercise.notes && <p style={{ whiteSpace: 'pre-line' }}>{h.exercise.notes}</p>}
                {h.exercise.link && <a href={h.exercise.link} target="_blank" rel="noreferrer" onClick={(e) => { if (inTelegram) { e.preventDefault(); tg.openLink(h.exercise.link); } }}>{t('Open form guide')}</a>}
              </div>
            )}
            <StrengthChart exerciseId={id} weeks={weeks} onWeeks={setWeeks} />
            <RecordsList exerciseId={id} weeks={weeks} />
            <Section title={t('Recent sessions')}>
              {!h.sessions.length ? <div className="card"><Empty>{t('No sessions in this period.')}</Empty></div> : (
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
