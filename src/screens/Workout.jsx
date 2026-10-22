import { useEffect, useState } from 'react';
import { useApi, call, mutate, invalidate, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { shortDay } from '../lib/format.js';
import { describePr } from '../../tgcloud/lib/strength.js';
import { Loader, MainButton, NumberInput, Sheet, List, Row, Stepper, toast, toastError } from '../ui/kit.jsx';
import ExercisePicker from '../ui/ExercisePicker.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic, confirmDialog } from '../lib/tg.js';

const pad = (n) => String(n).padStart(2, '0');
const clock = (sec) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  return h ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};
const parseClock = (t) => {
  if (!t) return null;
  const parts = String(t).split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((a, n) => a * 60 + n, 0);
};

function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [active]);
  return now;
}

const SET_TYPES = [
  { value: 'working', label: 'Working set' },
  { value: 'warmup', label: 'Warm-up' },
  { value: 'drop', label: 'Drop set' },
  { value: 'failure', label: 'To failure' },
];

function setLabel(set, index) {
  if (set.setType === 'warmup') return 'W';
  if (set.setType === 'drop') return 'D';
  if (set.setType === 'failure') return 'F';
  return String(index);
}

function previousText(p, fmt, track) {
  if (!p) return '—';
  if (track === 'duration') return clock(p.durationSec || 0);
  if (track === 'distance_duration') return `${((p.distanceM || 0) / 1000).toFixed(2)} km`;
  if (track === 'bodyweight_reps' || !p.weightKg) return p.reps ? `× ${p.reps}` : '—';
  return `${fmt.w(p.weightKg, { suffix: false })} × ${p.reps ?? '—'}`;
}

function TimeInput({ value, onCommit, label }) {
  const [text, setText] = useState(value ? clock(value) : '');
  useEffect(() => setText(value ? clock(value) : ''), [value]);
  return (
    <input className="inline-input" inputMode="numeric" placeholder="0:00" aria-label={label} value={text}
      onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()}
      onBlur={() => { const s = parseClock(text); if (s !== value) onCommit(s); }} />
  );
}

function SetRow({ set, number, current, track, fmt, prev, onChange, onMenu }) {
  const cls = `set-grid set-row${set.completed ? ' done' : current ? ' current' : ''}`;
  const grid = track === 'weight_reps' || track === 'weighted_bodyweight' ? '' : track === 'distance_duration' ? ' time-dist' : ' no-weight';
  const label = setLabel(set, number);
  return (
    <div className={cls + grid}>
      <button type="button" className={`set-label${set.setType === 'warmup' ? ' warm' : ''}`} onClick={onMenu} aria-label={`Set ${label} options`}>{label}</button>
      <span className="small hint ellipsis">{previousText(prev, fmt, track)}</span>
      {(track === 'weight_reps' || track === 'weighted_bodyweight') && (
        <NumberInput className="inline-input" value={fmt.wNum(set.weightKg)} decimals={2} label={`Set ${label} weight`}
          onCommit={(v) => onChange({ weightKg: fmt.toKg(v) })} placeholder={track === 'weighted_bodyweight' ? '+0' : '0'} />
      )}
      {track === 'distance_duration' && (
        <NumberInput className="inline-input" value={set.distanceM === null ? null : set.distanceM / 1000} decimals={2} label={`Set ${label} distance in km`}
          onCommit={(v) => onChange({ distanceM: v === null ? null : Math.round(v * 1000) })} placeholder="km" />
      )}
      {track === 'duration' || track === 'distance_duration' ? (
        <TimeInput value={set.durationSec} label={`Set ${label} time`} onCommit={(v) => onChange({ durationSec: v })} />
      ) : (
        <NumberInput className="inline-input" value={set.reps} decimals={0} label={`Set ${label} reps`} onCommit={(v) => onChange({ reps: v })} placeholder="0" />
      )}
      <button type="button" className="check" aria-pressed={!!set.completed} aria-label={set.completed ? `Undo set ${label}` : `Complete set ${label}`}
        onClick={() => onChange({ completed: !set.completed })}>
        <Icon name="check" size={18} stroke={2.6} />
      </button>
    </div>
  );
}

function RestBanner({ endsAt, total, onAdjust, onSkip, now }) {
  const left = Math.max(0, (new Date(endsAt).getTime() - now) / 1000);
  useEffect(() => { if (left === 0) haptic.warn(); }, [left === 0]);
  return (
    <div className="rest" role="timer" aria-live="off">
      <div className="row-between">
        <div>
          <div className="eyebrow">{left > 0 ? 'Rest' : 'Ready for next set'}</div>
          <div style={{ fontSize: 30, lineHeight: '36px', fontWeight: 700, letterSpacing: -0.5 }}>{clock(left)}</div>
        </div>
        <div className="rest-btns">
          <button type="button" onClick={() => onAdjust(left - 15)}>−15</button>
          <button type="button" onClick={() => onAdjust(left + 15)}>+15</button>
          <button type="button" className="solid" onClick={onSkip}>Skip</button>
        </div>
      </div>
      <div className="bar"><div style={{ width: `${total ? Math.min(100, (left / total) * 100) : 0}%` }} /></div>
    </div>
  );
}

export default function Workout({ id }) {
  const { user, fmt } = useUser();
  const nav = useNav();
  const q = useApi('getWorkout', { id });
  const [picker, setPicker] = useState(false);
  const [setMenu, setSetMenu] = useState(null);     // { set, ex }
  const [exMenu, setExMenu] = useState(null);       // exercise entry
  const [restTotal, setRestTotal] = useState(user.defaultRestSec);
  const [finishing, setFinishing] = useState(false);
  const open = q.data?.workout && !q.data.workout.endedAt;
  const now = useNow(!!open);

  const data = q.data;
  const mapSet = (cur, setId, fn) => ({
    ...cur,
    exercises: cur.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? fn(s) : s)) })),
  });

  async function changeSet(ex, set, patch) {
    if (patch.completed !== undefined) (patch.completed ? haptic.success : haptic.tap)();
    q.setData((cur) => mapSet(cur, set.id, (s) => ({ ...s, ...patch })));
    try {
      const r = await call('updateSet', { id: set.id, ...patch });
      q.setData((cur) => {
        const next = mapSet(cur, set.id, () => r.set);
        return r.restEndsAt ? { ...next, workout: { ...next.workout, restEndsAt: r.restEndsAt } } : next;
      });
      if (r.restEndsAt) setRestTotal(ex.restSec);
      if (r.prs.length) {
        haptic.success();
        const best = r.prs.find((p) => p.type === 'max_weight') || r.prs.find((p) => p.type === 'e1rm') || r.prs[0];
        toast(`New PR · ${describePr(best, (kg) => fmt.w(kg))}`, 'gold');
      }
      invalidate('getToday');
    } catch (e) {
      toastError(e);
      q.reload();
    }
  }

  async function run(name, input, after) {
    try {
      const r = await call(name, input);
      if (r && r.workout !== undefined && r.exercises) q.setData(r); else q.reload();
      if (after) after(r);
    } catch (e) { toastError(e); }
  }

  async function adjustRest(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const restEndsAt = s ? new Date(Date.now() + s * 1000).toISOString() : null;
    q.setData((cur) => ({ ...cur, workout: { ...cur.workout, restEndsAt } }));
    try { await call('setRest', { workoutId: data.workout.id, seconds: s }); } catch (e) { toastError(e); }
  }

  async function finish() {
    const left = data.exercises.reduce((a, e) => a + e.sets.filter((s) => !s.completed).length, 0);
    if (left && !(await confirmDialog(`${left} set${left === 1 ? '' : 's'} not ticked will be removed. Finish workout?`))) return;
    setFinishing(true);
    try {
      const r = await mutate('finishWorkout', { id: data.workout.id }, AFFECTS.workout);
      haptic.success();
      if (r.discarded) { toast('Nothing logged — workout discarded'); nav.pop(); }
      else nav.replace('WorkoutSummary', { result: r });
    } catch (e) { toastError(e); } finally { setFinishing(false); }
  }

  async function discard() {
    setExMenu(null);
    if (!(await confirmDialog('Discard this workout? Nothing from it will be saved.'))) return;
    try { await mutate('discardWorkout', { id: data.workout.id }, AFFECTS.workout); nav.pop(); } catch (e) { toastError(e); }
  }

  return (
    <div className="screen sub">
      <Loader q={q}>
        {(d) => {
          if (!d.workout) return <div className="empty">This workout no longer exists.</div>;
          const w = d.workout;
          const elapsed = open ? (now - new Date(w.startedAt).getTime()) / 1000 : w.durationSec;
          const restOn = open && w.restEndsAt && new Date(w.restEndsAt).getTime() > now - 15000;
          const WEIGHTED = ['weight_reps', 'weighted_bodyweight'];
          const live = d.exercises.flatMap((e) => e.sets.map((s) => ({ ...s, track: e.exercise.trackType })));
          const doneSets = live.filter((s) => s.completed && s.setType !== 'warmup');
          const volume = doneSets.reduce((a, s) => a + (WEIGHTED.includes(s.track) ? (s.weightKg || 0) * (s.reps || 0) : 0), 0);
          let firstOpen = null;
          for (const e of d.exercises) { const s = e.sets.find((x) => !x.completed); if (s) { firstOpen = s.id; break; } }
          return (
            <>
              <div className="row-between" style={{ padding: '0 4px' }}>
                <div className="stack-sm" style={{ gap: 2, minWidth: 0 }}>
                  <h1 className="title ellipsis">{w.name}</h1>
                  <span className="small hint">
                    {open ? '' : `${shortDay(w.localDate)} · `}{doneSets.length} of {live.filter((s) => s.setType !== 'warmup').length} sets · {fmt.w(volume, { digits: 0 })}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="pill" style={{ fontSize: 16 }}>
                    {open && <span style={{ width: 8, height: 8, borderRadius: 4, background: '#E5484D' }} />}
                    {clock(elapsed || 0)}
                  </span>
                  <button type="button" className="icon-btn" aria-label="Workout options" onClick={() => setExMenu('workout')}><Icon name="more" size={22} stroke={3} /></button>
                </div>
              </div>

              {restOn && <RestBanner endsAt={w.restEndsAt} total={restTotal} now={now} onAdjust={adjustRest} onSkip={() => adjustRest(0)} />}

              {d.exercises.map((e) => {
                const working = e.previous.filter((p) => p.setType !== 'warmup');
                let n = 0;
                return (
                  <div key={e.id} className="ex-card">
                    <div className="ex-head">
                      <button type="button" style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0 }} onClick={() => nav.push('ExerciseDetail', { id: e.exercise.id })}>
                        <div className="bold ellipsis" style={{ fontSize: 17 }}>{e.exercise.name}</div>
                        <div className="small hint ellipsis">
                          {working.length ? `Last time · ${working.map((p) => previousText(p, fmt, e.exercise.trackType)).join(', ')}` : e.target ? `Target ${e.target.sets} × ${e.target.repsMin === e.target.repsMax ? e.target.repsMin : `${e.target.repsMin}–${e.target.repsMax}`}` : 'First time — have fun'}
                        </div>
                      </button>
                      {e.bestWeightKg && <span className="badge gold"><Icon name="trophy" size={13} stroke={2.4} />PR {fmt.w(e.bestWeightKg)}</span>}
                      <button type="button" className="icon-btn" style={{ width: 32, height: 32, background: 'transparent' }} aria-label={`${e.exercise.name} options`} onClick={() => setExMenu(e)}><Icon name="more" size={20} stroke={3} /></button>
                    </div>
                    <div className={`set-grid set-head${e.exercise.trackType === 'weight_reps' || e.exercise.trackType === 'weighted_bodyweight' ? '' : e.exercise.trackType === 'distance_duration' ? ' time-dist' : ' no-weight'}`}>
                      <span>Set</span><span>Previous</span>
                      {(e.exercise.trackType === 'weight_reps' || e.exercise.trackType === 'weighted_bodyweight') && <span className="center">{e.exercise.trackType === 'weighted_bodyweight' ? `+${fmt.weightUnit}` : fmt.weightUnit}</span>}
                      {e.exercise.trackType === 'distance_duration' && <span className="center">km</span>}
                      <span className="center">{e.exercise.trackType === 'duration' || e.exercise.trackType === 'distance_duration' ? 'Time' : 'Reps'}</span><span />
                    </div>
                    {e.sets.map((s, i) => {
                      if (s.setType !== 'warmup') n += 1;
                      const prev = s.setType === 'warmup' ? e.previous.find((p) => p.setType === 'warmup') : working[n - 1];
                      return (
                        <SetRow key={s.id} set={s} number={n} current={s.id === firstOpen} track={e.exercise.trackType} fmt={fmt} prev={prev}
                          onChange={(patch) => changeSet(e, s, patch)} onMenu={() => setSetMenu({ set: s, ex: e })} />
                      );
                    })}
                    <button type="button" className="add-set" onClick={() => { haptic.tap(); run('addSet', { workoutExerciseId: e.id }); }}>
                      <Icon name="plus" size={16} stroke={2.4} />Add set
                    </button>
                  </div>
                );
              })}

              <button type="button" className="btn plain lg block" onClick={() => setPicker(true)}><Icon name="plus" size={18} stroke={2.4} />Add exercise</button>
              {w.notes && <p className="small hint" style={{ padding: '0 4px' }}>Notes: {w.notes}</p>}

              <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(ex) => { setPicker(false); run('addWorkoutExercise', { workoutId: w.id, exerciseId: ex.id }); }} />

              <Sheet open={!!setMenu} onClose={() => setSetMenu(null)} title="Set">
                {setMenu && (
                  <>
                    <List>
                      {SET_TYPES.map((t) => (
                        <Row key={t.value} title={t.label} onClick={() => { changeSet(setMenu.ex, setMenu.set, { setType: t.value }); setSetMenu(null); }}>
                          {setMenu.set.setType === t.value && <Icon name="check" size={18} color="var(--link)" stroke={2.6} />}
                        </Row>
                      ))}
                    </List>
                    <button type="button" className="btn danger block" style={{ background: 'var(--field)' }} onClick={() => { const s = setMenu.set; setSetMenu(null); run('deleteSet', { id: s.id }); }}>Delete set</button>
                  </>
                )}
              </Sheet>

              <Sheet open={!!exMenu} onClose={() => setExMenu(null)} title={exMenu === 'workout' ? 'Workout' : exMenu?.exercise?.name}>
                {exMenu === 'workout' ? (
                  <List>
                    <Row title="Discard workout" danger onClick={discard} />
                  </List>
                ) : exMenu && (
                  <>
                    <div className="stack-sm">
                      <span className="label">Rest between sets</span>
                      <Stepper value={(exMenu.restSec || 0) / 60} step={0.25} decimals={2} unit="min" label="rest"
                        onChange={(v) => { const sec = Math.max(0, Math.round(v * 60)); setExMenu({ ...exMenu, restSec: sec }); }} />
                    </div>
                    <List>
                      <Row title="Save rest time" onClick={() => { const e = exMenu; setExMenu(null); run('updateWorkoutExercise', { id: e.id, restSec: e.restSec }); }} />
                      <Row title="Move up" onClick={() => { const e = exMenu; setExMenu(null); run('updateWorkoutExercise', { id: e.id, position: Math.max(0, d.exercises.indexOf(d.exercises.find((x) => x.id === e.id)) - 1) }); }} />
                      <Row title="Move down" onClick={() => { const e = exMenu; setExMenu(null); run('updateWorkoutExercise', { id: e.id, position: d.exercises.findIndex((x) => x.id === e.id) + 1 }); }} />
                      <Row title="Remove exercise" danger onClick={async () => { const e = exMenu; setExMenu(null); if (await confirmDialog(`Remove ${e.exercise.name} and its sets?`)) run('removeWorkoutExercise', { id: e.id }); }} />
                    </List>
                  </>
                )}
              </Sheet>

              {open && <MainButton text="Finish workout" busy={finishing} onClick={finish} />}
            </>
          );
        }}
      </Loader>
    </div>
  );
}
