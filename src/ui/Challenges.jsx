import { useState } from 'react';
import { useApi, call, invalidate } from '../lib/api.js';
import { useUser } from '../lib/app-state.jsx';
import { Section, List, Row, Sheet, Segmented, Chips, NumberInput, Empty, toastError } from './kit.jsx';
import ExercisePicker from './ExercisePicker.jsx';
import { haptic, confirmDialog } from '../lib/tg.js';
import { shortDay } from '../lib/format.js';
import { addDays } from '../../tgcloud/lib/dates.js';
import { t, cname } from '../lib/i18n.js';

// A group's challenges: running and recently ended ones with standings, and a sheet to
// start a new one. Everyone in the group takes part automatically.

const METRICS = [
  { value: 'workouts', label: 'Workouts' },
  { value: 'volume_kg', label: 'Volume' },
  { value: 'sets', label: 'Sets' },
  { value: 'active_days', label: 'Active days' },
  { value: 'exercise_reps', label: 'Reps' },
];
const LENGTHS = [7, 14, 30];

export function challengeTitle(c) {
  if (c.title) return c.title;
  switch (c.metric) {
    case 'workouts': return t('Most workouts');
    case 'volume_kg': return t('Most volume');
    case 'sets': return t('Most sets');
    case 'active_days': return t('Most active days');
    default: return t('Most {exercise} reps', { exercise: cname(c.exerciseName || '') });
  }
}

function useValue() {
  const { fmt } = useUser();
  return (metric, v) => {
    switch (metric) {
      case 'workouts': return t.n(v, '{n} workout', '{n} workouts');
      case 'volume_kg': return fmt.w(v, { digits: 0 });
      case 'sets': return t.n(v, '{n} set', '{n} sets');
      case 'active_days': return t.n(v, '{n} active day', '{n} active days');
      default: return t.n(v, '{n} rep', '{n} reps');
    }
  };
}

function NewChallenge({ open, onClose, groupId, onCreated }) {
  const { today, fmt } = useUser();
  const [metric, setMetric] = useState('workouts');
  const [days, setDays] = useState(7);
  const [startTomorrow, setStartTomorrow] = useState(false);
  const [target, setTarget] = useState(null);
  const [exercise, setExercise] = useState(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const startDate = startTomorrow ? addDays(today, 1) : today;
  const endDate = addDays(startDate, days - 1);
  const ready = metric !== 'exercise_reps' || exercise;

  async function create() {
    setBusy(true);
    try {
      const value = target && metric === 'volume_kg' ? fmt.toKg(target) : target;
      await call('createChallenge', { groupId, metric, startDate, endDate, ...(value ? { target: value } : {}), ...(metric === 'exercise_reps' ? { exerciseId: exercise.id } : {}) });
      haptic.success();
      onCreated();
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('New challenge')}>
      <div className="stack" style={{ padding: '0 16px 16px' }}>
        <span className="label">{t('Who has the most…')}</span>
        <Chips value={metric} onChange={setMetric} options={METRICS.map((m) => ({ value: m.value, label: t(m.label) }))} />
        {metric === 'exercise_reps' && (
          <button type="button" className="btn plain" onClick={() => setPicking(true)}>{exercise ? cname(exercise.name) : t('Choose an exercise')}</button>
        )}
        <span className="label">{t('How long')}</span>
        <Segmented label={t('How long')} value={days} onChange={setDays} options={LENGTHS.map((d) => ({ value: d, label: t.n(d, '{n} day', '{n} days') }))} />
        <Segmented label={t('Starts')} value={startTomorrow ? 'tomorrow' : 'today'} onChange={(v) => setStartTomorrow(v === 'tomorrow')}
          options={[{ value: 'today', label: t('Today') }, { value: 'tomorrow', label: t('Tomorrow') }]} />
        <span className="small hint">{t('{from} – {to}', { from: shortDay(startDate), to: shortDay(endDate) })}</span>
        <label className="form-row">
          <span className="label">{t('Target per person (optional)')}</span>
          <NumberInput value={target} onCommit={setTarget} decimals={0} live placeholder="—" label={t('Target per person (optional)')} />
        </label>
        <button type="button" className="btn lg block" disabled={!ready || busy} onClick={create}>{t('Start challenge')}</button>
      </div>
      <ExercisePicker open={picking} onClose={() => setPicking(false)} onPick={(ex) => { setPicking(false); setExercise(ex); }} />
    </Sheet>
  );
}

export default function Challenges({ groupId, me, isOwner }) {
  const { today } = useUser();
  const q = useApi('listChallenges', { groupId });
  const [creating, setCreating] = useState(false);
  const value = useValue();
  const reload = () => { q.reload(); invalidate('listChallenges'); };

  async function remove(c) {
    if (!(await confirmDialog(t('Delete the challenge “{name}”?', { name: challengeTitle(c) })))) return;
    try { await call('deleteChallenge', { id: c.id }); reload(); } catch (e) { toastError(e); }
  }
  const list = q.data ? q.data.challenges : [];
  return (
    <Section title={t('Challenges')} action={<button type="button" className="btn ghost" onClick={() => setCreating(true)}>{t('New')}</button>}>
      {!list.length ? (
        <div className="card"><Empty>{t('Start a challenge — most workouts this week, most push-ups this month…')}</Empty></div>
      ) : list.map((c) => {
        const mine = c.standings.find((r) => r.userId === me);
        const when = c.status === 'upcoming' ? t('Starts {date}', { date: shortDay(c.startDate) })
          : c.status === 'ended' ? t('Ended {date}', { date: shortDay(c.endDate) })
            : t.n(Math.max(1, Math.round((new Date(`${c.endDate}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000) + 1), '{n} day left', '{n} days left');
        return (
          <div key={c.id} className="stack-sm" style={{ marginBottom: 12 }}>
            <List>
              <Row title={`🏁 ${challengeTitle(c)}`} sub={[when, c.target ? t('Target: {value}', { value: value(c.metric, c.target) }) : null].filter(Boolean).join(' · ')}>
                {(c.createdBy === me || isOwner) && <button type="button" className="btn ghost" onClick={() => remove(c)}>{t('Delete')}</button>}
              </Row>
              {c.standings.slice(0, 3).map((r) => (
                <Row key={r.userId} title={`${['🥇', '🥈', '🥉'][r.rank - 1]} ${r.userId === me ? t('You') : r.name || t('Member')}`} value={value(c.metric, r.value)} />
              ))}
              {mine && mine.rank > 3 && <Row title={`${mine.rank}. ${t('You')}`} value={value(c.metric, mine.value)} />}
            </List>
          </div>
        );
      })}
      <NewChallenge open={creating} onClose={() => setCreating(false)} groupId={groupId} onCreated={reload} />
    </Section>
  );
}
