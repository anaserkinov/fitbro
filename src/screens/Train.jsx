import { useMemo, useState } from 'react';
import { useApi, mutate, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { startOrResume } from '../lib/workout-start.js';
import { Loader, Segmented, Chips, Sheet, Section, Empty, toast, toastError, List, Row } from '../ui/kit.jsx';
import { MuscleBadge, filterExercises, muscleFilters, exerciseMeta } from '../ui/ExercisePicker.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic } from '../lib/tg.js';
import { t, cname } from '../lib/i18n.js';

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
    <Sheet open={open} onClose={() => { setPlan(null); onClose(); }} title={t('Weekly plan')} right={<button type="button" className="btn ghost" onClick={save}>{t('Save')}</button>}>
      <div className="list">
        {order.map((wd) => (
          <label key={wd} className="row">
            <span className="grow"><span className="row-title">{t(DAY_NAMES[wd])}</span></span>
            <select value={days[wd] || ''} onChange={(e) => setPlan({ ...days, [wd]: e.target.value ? Number(e.target.value) : null })}
              style={{ border: 0, background: 'transparent', color: days[wd] ? 'var(--link)' : 'var(--hint)', fontSize: 16, textAlign: 'right', maxWidth: '55%' }}>
              <option value="">{t('Rest@day')}</option>
              {data.routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="small hint">{t('Planned workouts show on Today and in the workout-day reminder.')}</p>
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
          <Section title={t('This week')} action={<button type="button" onClick={() => setSchedule(true)}>{t('Edit plan')}</button>}>
            <button type="button" className="list week-strip" style={{ border: 0, width: '100%' }} onClick={() => setSchedule(true)} aria-label={t('Edit weekly plan')}>
              {d.week.map((day) => (
                <span key={day.date} className={`week-day${day.isToday ? ' today' : ''}`}>
                  <span className="tiny bold" style={{ color: day.isToday ? 'var(--link)' : 'var(--hint)' }}>{t(DAY_SHORT[day.weekday])}</span>
                  <span className={`week-dot${day.done ? ' done' : day.isToday && day.routineId ? ' planned' : ''}`}>{day.done && <Icon name="check" size={14} stroke={3} />}</span>
                  <span className="ellipsis" style={{ fontSize: 11, fontWeight: 600, maxWidth: '100%', color: day.routineId ? (day.isToday ? 'var(--link)' : 'var(--text)') : 'var(--hint)' }}>{day.routineName || t('Rest@day')}</span>
                </span>
              ))}
            </button>
          </Section>

          <Section>
            <List>
              <Row icon="calendar" iconColor="#1E73BE" title={t('Programs')} sub={t('Multi-week plans that set your weights for you')} chevron onClick={() => nav.push('Programs')} />
            </List>
          </Section>

          <Section title={t('My routines')}>
            {!d.routines.length ? (
              <div className="card"><Empty action={<button type="button" className="btn soft" onClick={() => nav.push('RoutineEditor', {})}>{t('Create a routine')}</button>}>{t('Routines are workout templates — e.g. “Push A”: bench, overhead press, dips.')}</Empty></div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {d.routines.map((r) => {
                  const today = d.week.find((x) => x.isToday)?.routineId === r.id;
                  return (
                    <div key={r.id} className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <button type="button" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => nav.push('RoutineEditor', { id: r.id })}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="bold" style={{ fontSize: 17 }}>{r.name}</span>{today && <span className="badge blue">{t('Today')}</span>}</span>
                        <span className="small hint ellipsis" style={{ fontSize: 14 }}>{r.items.map((i) => i.exercise?.name).filter(Boolean).map(cname).join(', ') || t('No exercises yet')}</span>
                        <span className="small">{t.n(r.exerciseCount, '{n} exercise', '{n} exercises')} · {t.n(r.setCount, '{n} set', '{n} sets')} · ~{r.estMinutes} {t('min')}</span>
                      </button>
                      <button type="button" className={`btn sm${today ? '' : ' soft'}`} disabled={!r.exerciseCount} onClick={() => startOrResume(nav, r.id)}>{t('Start')}</button>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <button type="button" className="btn plain lg block" onClick={() => startOrResume(nav, null)}><Icon name="plus" size={18} stroke={2.2} />{t('Start empty workout')}</button>
          <ScheduleSheet open={schedule} onClose={() => setSchedule(false)} data={d} onSaved={(r) => { q.setData(r); toast(t('Plan saved')); }} />
        </>
      )}
    </Loader>
  );
}

const FILTER_MUSCLES = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio', 'full_body'];

function Exercises() {
  const nav = useNav();
  const q = useApi('listExercises');
  const [text, setText] = useState('');
  const [muscle, setMuscle] = useState('all');
  const rows = useMemo(() => (q.data ? filterExercises(q.data.exercises, text, muscle) : []), [q.data, text, muscle]);
  return (
    <>
      <label className="field">
        <Icon name="search" size={18} color="var(--hint)" /><span className="sr-only">{t('Search exercises')}</span>
        <input type="search" placeholder={q.data ? t.n(q.data.exercises.length, 'Search {n} exercise', 'Search {n} exercises') : t('Search exercises')} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <Chips options={muscleFilters(FILTER_MUSCLES)} value={muscle} onChange={setMuscle} />
      <Loader q={q}>
        {() => (!rows.length ? <Empty>{t('No exercises match.')}</Empty> : (
          <div className="list">
            {rows.map((e) => (
              <button key={e.id} type="button" className="row" style={{ minHeight: 56, '--inset': '64px' }} onClick={() => nav.push('ExerciseDetail', { id: e.id })}>
                <MuscleBadge muscle={e.muscle} name={e.name} />
                <span className="grow">
                  <span className="row-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="ellipsis">{cname(e.name)}</span>{e.custom && <span className="badge gray">{t('Custom')}</span>}</span>
                  <span className="sub">{exerciseMeta(e, [e.category && t(e.category)])}</span>
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
        <h1 className="large-title">{t('Train')}</h1>
        <button type="button" className="icon-btn" aria-label={tab === 'routines' ? t('New routine') : t('New exercise')}
          onClick={() => nav.push(tab === 'routines' ? 'RoutineEditor' : 'ExerciseEditor', {})}><Icon name="plus" size={20} stroke={2.4} /></button>
      </div>
      <Segmented label={t('Train section')} value={tab} onChange={setTab} options={[{ value: 'routines', label: t('Routines') }, { value: 'exercises', label: t('Exercises') }]} />
      {tab === 'routines' ? <Routines /> : <Exercises />}
    </div>
  );
}
