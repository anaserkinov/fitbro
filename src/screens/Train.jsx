import { useMemo, useState } from 'react';
import { useApi, mutate, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { MUSCLE_LABEL } from '../lib/format.js';
import { startOrResume } from '../lib/workout-start.js';
import { Loader, Segmented, Chips, Sheet, Section, Empty, toast, toastError } from '../ui/kit.jsx';
import { MuscleBadge, filterExercises } from '../ui/ExercisePicker.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic } from '../lib/tg.js';

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function ScheduleSheet({ open, onClose, data, onSaved }) {
  const [plan, setPlan] = useState(null);
  const days = plan ?? Object.fromEntries(data.week.map((d) => [d.weekday, d.routineId]));
  const order = data.week.map((d) => d.weekday);
  async function save() {
    try {
      const r = await mutate('saveSchedule', { days: order.map((wd) => ({ weekday: wd, routineId: days[wd] || null })) }, AFFECTS.routines);
      haptic.success();
      onSaved(r);
      setPlan(null);
      onClose();
    } catch (e) { toastError(e); }
  }
  return (
    <Sheet open={open} onClose={() => { setPlan(null); onClose(); }} title="Weekly plan" right={<button type="button" className="btn ghost" onClick={save}>Save</button>}>
      <div className="list">
        {order.map((wd) => (
          <label key={wd} className="row">
            <span className="grow"><span className="row-title">{DAY_NAMES[wd]}</span></span>
            <select value={days[wd] || ''} onChange={(e) => setPlan({ ...days, [wd]: e.target.value ? Number(e.target.value) : null })}
              style={{ border: 0, background: 'transparent', color: days[wd] ? 'var(--link)' : 'var(--hint)', fontSize: 16, textAlign: 'right', maxWidth: '55%' }}>
              <option value="">Rest</option>
              {data.routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="small hint">Planned workouts show on Today and in the workout-day reminder.</p>
    </Sheet>
  );
}

function Routines() {
  const nav = useNav();
  const q = useApi('listRoutines');
  const [schedule, setSchedule] = useState(false);
  return (
    <Loader q={q}>
      {(d) => (
        <>
          <Section title="This week" action={<button type="button" onClick={() => setSchedule(true)}>Edit plan</button>}>
            <button type="button" className="list week-strip" style={{ border: 0, width: '100%' }} onClick={() => setSchedule(true)} aria-label="Edit weekly plan">
              {d.week.map((day) => (
                <span key={day.date} className={`week-day${day.isToday ? ' today' : ''}`}>
                  <span className="tiny bold" style={{ color: day.isToday ? 'var(--link)' : 'var(--hint)' }}>{DAY_NAMES[day.weekday].slice(0, 3)}</span>
                  <span className={`week-dot${day.done ? ' done' : day.isToday && day.routineId ? ' planned' : ''}`}>{day.done && <Icon name="check" size={14} stroke={3} />}</span>
                  <span className="ellipsis" style={{ fontSize: 11, fontWeight: 600, maxWidth: '100%', color: day.routineId ? (day.isToday ? 'var(--link)' : 'var(--text)') : 'var(--hint)' }}>{day.routineName || 'Rest'}</span>
                </span>
              ))}
            </button>
          </Section>

          <Section title="My routines">
            {!d.routines.length ? (
              <div className="card"><Empty action={<button type="button" className="btn soft" onClick={() => nav.push('RoutineEditor', {})}>Create a routine</button>}>Routines are workout templates — e.g. “Push A”: bench, overhead press, dips.</Empty></div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {d.routines.map((r) => {
                  const today = d.week.find((x) => x.isToday)?.routineId === r.id;
                  return (
                    <div key={r.id} className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <button type="button" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => nav.push('RoutineEditor', { id: r.id })}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="bold" style={{ fontSize: 17 }}>{r.name}</span>{today && <span className="badge blue">Today</span>}</span>
                        <span className="small hint ellipsis" style={{ fontSize: 14 }}>{r.items.map((i) => i.exercise?.name).filter(Boolean).join(', ') || 'No exercises yet'}</span>
                        <span className="small">{r.exerciseCount} exercises · {r.setCount} sets · ~{r.estMinutes} min</span>
                      </button>
                      <button type="button" className={`btn sm${today ? '' : ' soft'}`} disabled={!r.exerciseCount} onClick={() => startOrResume(nav, r.id)}>Start</button>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <button type="button" className="btn plain lg block" onClick={() => startOrResume(nav, null)}><Icon name="plus" size={18} stroke={2.2} />Start empty workout</button>
          <ScheduleSheet open={schedule} onClose={() => setSchedule(false)} data={d} onSaved={(r) => { q.setData(r); toast('Plan saved'); }} />
        </>
      )}
    </Loader>
  );
}

const FILTERS = [{ value: 'all', label: 'All' }, ...['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio', 'full_body'].map((m) => ({ value: m, label: MUSCLE_LABEL[m] }))];

function Exercises() {
  const nav = useNav();
  const q = useApi('listExercises');
  const [text, setText] = useState('');
  const [muscle, setMuscle] = useState('all');
  const rows = useMemo(() => (q.data ? filterExercises(q.data.exercises, text, muscle) : []), [q.data, text, muscle]);
  return (
    <>
      <label className="field">
        <Icon name="search" size={18} color="var(--hint)" /><span className="sr-only">Search exercises</span>
        <input type="search" placeholder={q.data ? `Search ${q.data.exercises.length} exercises` : 'Search exercises'} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <Chips options={FILTERS} value={muscle} onChange={setMuscle} />
      <Loader q={q}>
        {() => (!rows.length ? <Empty>No exercises match.</Empty> : (
          <div className="list">
            {rows.map((e) => (
              <button key={e.id} type="button" className="row" style={{ minHeight: 56, '--inset': '64px' }} onClick={() => nav.push('ExerciseDetail', { id: e.id })}>
                <MuscleBadge muscle={e.muscle} />
                <span className="grow">
                  <span className="row-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="ellipsis">{e.name}</span>{e.custom && <span className="badge gray">Custom</span>}</span>
                  <span className="sub">{MUSCLE_LABEL[e.muscle]}{e.equipment ? ` · ${e.equipment}` : ''}{e.category ? ` · ${e.category}` : ''}</span>
                </span>
                <Icon name="chevronRight" size={16} stroke={2.2} color="var(--hint)" />
              </button>
            ))}
          </div>
        ))}
      </Loader>
    </>
  );
}

export default function Train() {
  const nav = useNav();
  const [tab, setTab] = useState('routines');
  return (
    <div className="screen">
      <div className="title-row" style={{ alignItems: 'center' }}>
        <h1 className="large-title">Train</h1>
        <button type="button" className="icon-btn" aria-label={tab === 'routines' ? 'New routine' : 'New exercise'}
          onClick={() => nav.push(tab === 'routines' ? 'RoutineEditor' : 'ExerciseEditor', {})}><Icon name="plus" size={20} stroke={2.4} /></button>
      </div>
      <Segmented label="Train section" value={tab} onChange={setTab} options={[{ value: 'routines', label: 'Routines' }, { value: 'exercises', label: 'Exercises' }]} />
      {tab === 'routines' ? <Routines /> : <Exercises />}
    </div>
  );
}
