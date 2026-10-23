import { useEffect, useRef, useState } from 'react';
import { useApi, call, mutate, invalidate, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { shortDay } from '../lib/format.js';
import { describePrT } from './WorkoutSummary.jsx';
import { workoutName } from '../lib/workout-start.js';
import { t, cname } from '../lib/i18n.js';
import { Loader, MainButton, NumberInput, Sheet, List, Row, Stepper, toast, toastError } from '../ui/kit.jsx';
import ShareButton from '../ui/ShareButton.jsx';
import ExercisePicker from '../ui/ExercisePicker.jsx';
import { GuideSheet, GuideThumb } from '../ui/ExerciseGuide.jsx';
import { exerciseGuide } from '../lib/exercise-guides.js';
import { Icon } from '../ui/icons.jsx';
import { haptic, confirmDialog } from '../lib/tg.js';
import { blocks, nextOpenSet } from '../../tgcloud/lib/supersets.js';
import { describeChange } from '../../tgcloud/lib/data/programs.js';

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

// Labels are translation keys — wrap with t() at render.
const SET_TYPES = [
  { value: 'working', label: 'Working set' },
  { value: 'warmup', label: 'Warm-up' },
  { value: 'drop', label: 'Drop set' },
  { value: 'failure', label: 'To failure' },
];

// One-letter badges: W(arm-up), D(rop), F(ailure) — localised.
function setLabel(set, index) {
  if (set.setType === 'warmup') return t('W@warmup');
  if (set.setType === 'drop') return t('D@drop');
  if (set.setType === 'failure') return t('F@failure');
  return String(index);
}

function previousText(p, fmt, track) {
  if (!p) return '—';
  if (track === 'duration') return clock(p.durationSec || 0);
  if (track === 'distance_duration') return `${((p.distanceM || 0) / 1000).toFixed(2)} ${t('km')}`;
  if (track === 'bodyweight_reps' || !p.weightKg) return p.reps ? `× ${p.reps}` : '—';
  return `${fmt.w(p.weightKg, { suffix: false })} × ${p.reps ?? '—'}`;
}

const WEIGHTED = ['weight_reps', 'weighted_bodyweight'];
const RIR = [[0, '0'], [1, '1'], [2, '2'], [3, '3+']];

// After a program set: how many more reps it had in it. Calibration and the next
// weight use it; skipping it is fine.
function RepsLeft({ set, onPick }) {
  return (
    <div className="rir-row" role="group" aria-label={t('Reps left in the tank')}>
      <span>{t('Reps left in the tank')}</span>
      {RIR.map(([n, label]) => (
        <button key={n} type="button" className="chip" aria-pressed={set.rir === n} onClick={() => { haptic.select(); onPick(set.rir === n ? null : n); }}>{label}</button>
      ))}
    </div>
  );
}

// A drop set's weight: about 20% lighter, on the plate step, never below one step.
function dropWeightKg(kg, fmt) {
  if (!kg) return null;
  const step = fmt.plateStep;
  return fmt.toKg(Math.max(step, Math.round((fmt.wNum(kg) * 0.8) / step) * step));
}

// Swipe a set row left to reveal Delete (the set menu has it too).
const SWIPE = 88;
function useSwipe(onOpen) {
  const [dx, setDx] = useState(0);
  const start = useRef(null);
  const handlers = {
    onTouchStart: (e) => { const p = e.touches[0]; start.current = { x: p.clientX, y: p.clientY, base: dx, horizontal: null }; },
    onTouchMove: (e) => {
      const s = start.current;
      if (!s) return;
      const p = e.touches[0];
      const mx = p.clientX - s.x, my = p.clientY - s.y;
      if (s.horizontal === null && Math.abs(mx) + Math.abs(my) > 8) s.horizontal = Math.abs(mx) > Math.abs(my);
      if (s.horizontal) setDx(Math.max(-SWIPE - 24, Math.min(0, s.base + mx)));
    },
    onTouchEnd: () => {
      const s = start.current;
      start.current = null;
      if (!s || !s.horizontal) return;
      const opened = dx < -SWIPE / 2;
      setDx(opened ? -SWIPE : 0);
      if (opened && s.base === 0) { haptic.select(); onOpen?.(); }
    },
  };
  return { dx, close: () => setDx(0), handlers };
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

function SetRow({ set, number, current, track, fmt, prev, onChange, onMenu, onDelete }) {
  const cls = `set-grid set-row${set.completed ? ' done' : current ? ' current' : ''}`;
  const grid = track === 'weight_reps' || track === 'weighted_bodyweight' ? '' : track === 'distance_duration' ? ' time-dist' : ' no-weight';
  const label = setLabel(set, number);
  const swipe = useSwipe();
  return (
    <div className="swipe">
      <button type="button" className="swipe-delete" tabIndex={swipe.dx ? 0 : -1} aria-hidden={!swipe.dx}
        onClick={() => { swipe.close(); onDelete(); }}><Icon name="trash" size={18} />{t('Delete')}</button>
    <div className={cls + grid} {...swipe.handlers} style={{ transform: swipe.dx ? `translateX(${swipe.dx}px)` : undefined }}>
      <button type="button" className={`set-label${set.setType === 'warmup' ? ' warm' : set.setType === 'drop' ? ' drop' : ''}`} onClick={onMenu} aria-label={t('Set {label} options', { label })}>{label}</button>
      <span className="small hint ellipsis">{previousText(prev, fmt, track)}</span>
      {(track === 'weight_reps' || track === 'weighted_bodyweight') && (
        <NumberInput className="inline-input" value={fmt.wNum(set.weightKg)} decimals={2} label={t('Set {label} weight', { label })}
          onCommit={(v) => onChange({ weightKg: fmt.toKg(v) })} placeholder={track === 'weighted_bodyweight' ? '+0' : '0'} />
      )}
      {track === 'distance_duration' && (
        <NumberInput className="inline-input" value={set.distanceM === null ? null : set.distanceM / 1000} decimals={2} label={t('Set {label} distance in km', { label })}
          onCommit={(v) => onChange({ distanceM: v === null ? null : Math.round(v * 1000) })} placeholder={t('km')} />
      )}
      {track === 'duration' || track === 'distance_duration' ? (
        <TimeInput value={set.durationSec} label={t('Set {label} time', { label })} onCommit={(v) => onChange({ durationSec: v })} />
      ) : (
        <NumberInput className="inline-input" value={set.reps} decimals={0} label={t('Set {label} reps', { label })} onCommit={(v) => onChange({ reps: v })} placeholder="0" />
      )}
      <button type="button" className="check" aria-pressed={!!set.completed} aria-label={set.completed ? t('Undo set {label}', { label }) : t('Complete set {label}', { label })}
        onClick={() => onChange({ completed: !set.completed })}>
        <Icon name="check" size={18} stroke={2.6} />
      </button>
    </div>
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
          <div className="eyebrow">{left > 0 ? t('Rest') : t('Ready for next set')}</div>
          <div style={{ fontSize: 30, lineHeight: '36px', fontWeight: 700, letterSpacing: -0.5 }}>{clock(left)}</div>
        </div>
        <div className="rest-btns">
          <button type="button" onClick={() => onAdjust(left - 15)}>−15</button>
          <button type="button" onClick={() => onAdjust(left + 15)}>+15</button>
          <button type="button" className="solid" onClick={onSkip}>{t('Skip')}</button>
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
  const [guide, setGuide] = useState(null);         // exercise name
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
        // Ticking a set sets the rest timer — or clears it before a drop set / the next superset exercise.
        return patch.completed ? { ...next, workout: { ...next.workout, restEndsAt: r.restEndsAt } } : next;
      });
      if (r.restEndsAt) setRestTotal(ex.restSec);
      if (r.prs.length) {
        haptic.success();
        const best = r.prs.find((p) => p.type === 'max_weight') || r.prs.find((p) => p.type === 'e1rm') || r.prs[0];
        toast(t('New PR · {pr}', { pr: describePrT(best, (kg) => fmt.w(kg)) }), 'gold');
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
    if (left && !(await confirmDialog(t.n(left, '{n} set not ticked will be removed. Finish workout?', '{n} sets not ticked will be removed. Finish workout?')))) return;
    setFinishing(true);
    try {
      const r = await mutate('finishWorkout', { id: data.workout.id }, AFFECTS.workout);
      haptic.success();
      if (r.discarded) { toast(t('Nothing logged — workout discarded')); nav.pop(); }
      else nav.replace('WorkoutSummary', { result: r });
    } catch (e) { toastError(e); } finally { setFinishing(false); }
  }

  function addDrop(e, base) {
    haptic.tap();
    run('addSet', { workoutExerciseId: e.id, setType: 'drop', afterSetId: base.id, weightKg: dropWeightKg(base.weightKg, fmt) });
  }

  async function discard() {
    setExMenu(null);
    if (!(await confirmDialog(t('Discard this workout? Nothing from it will be saved.')))) return;
    try { await mutate('discardWorkout', { id: data.workout.id }, AFFECTS.workout); nav.pop(); } catch (e) { toastError(e); }
  }

  return (
    <div className="screen sub">
      <Loader q={q}>
        {(d) => {
          if (!d.workout) return <div className="empty">{t('This workout no longer exists.')}</div>;
          const w = d.workout;
          const elapsed = open ? (now - new Date(w.startedAt).getTime()) / 1000 : w.durationSec;
          const restOn = open && w.restEndsAt && new Date(w.restEndsAt).getTime() > now - 15000;
          const live = d.exercises.flatMap((e) => e.sets.map((s) => ({ ...s, track: e.exercise.trackType })));
          const doneSets = live.filter((s) => s.completed && s.setType !== 'warmup');
          const volume = doneSets.reduce((a, s) => a + (WEIGHTED.includes(s.track) ? (s.weightKg || 0) * (s.reps || 0) : 0), 0);
          const firstOpen = nextOpenSet(d.exercises)?.set.id ?? null;   // alternates inside a superset
          return (
            <>
              <div className="row-between" style={{ padding: '0 4px' }}>
                <div className="stack-sm" style={{ gap: 2, minWidth: 0 }}>
                  <h1 className="title ellipsis">{workoutName(w.name)}</h1>
                  <span className="small hint">
                    {open ? '' : `${shortDay(w.localDate)} · `}{t.n(live.filter((s) => s.setType !== 'warmup').length, '{done} of {n} set', '{done} of {n} sets', { done: doneSets.length })} · {fmt.w(volume, { digits: 0 })}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="pill" style={{ fontSize: 16 }}>
                    {open && <span style={{ width: 8, height: 8, borderRadius: 4, background: '#E5484D' }} />}
                    {clock(elapsed || 0)}
                  </span>
                  <button type="button" className="icon-btn" aria-label={t('Workout options')} onClick={() => setExMenu('workout')}><Icon name="more" size={22} stroke={3} /></button>
                </div>
              </div>

              {restOn && <RestBanner endsAt={w.restEndsAt} total={restTotal} now={now} onAdjust={adjustRest} onSkip={() => adjustRest(0)} />}

              {blocks(d.exercises).map((b) => {
                const cards = b.exercises.map((e) => {
                const working = e.previous.filter((p) => p.setType !== 'warmup');
                const weighted = WEIGHTED.includes(e.exercise.trackType);
                const dropBase = [...e.sets].reverse().find((s) => s.completed) || e.sets[e.sets.length - 1];
                const lastWorking = [...e.sets].reverse().find((s) => s.setType !== 'warmup');
                let n = 0;
                return (
                  <div key={e.id} className="ex-card">
                    <div className="ex-head">
                      <GuideThumb name={e.exercise.name} onOpen={() => setGuide(e.exercise.name)} />
                      <button type="button" style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0 }} onClick={() => nav.push('ExerciseDetail', { id: e.exercise.id })}>
                        <div className="bold ellipsis" style={{ fontSize: 17 }}>{cname(e.exercise.name)}</div>
                        <div className="small hint ellipsis">
                          {working.length ? t('Last time · {sets}', { sets: working.map((p) => previousText(p, fmt, e.exercise.trackType)).join(', ') }) : e.target ? t('Target {sets} × {reps}', { sets: e.target.sets, reps: e.target.repsMin === e.target.repsMax ? e.target.repsMin : `${e.target.repsMin}–${e.target.repsMax}` }) : t('First time — have fun')}
                        </div>
                      </button>
                      {e.bestWeightKg && <span className="badge gold"><Icon name="trophy" size={13} stroke={2.4} />PR {fmt.w(e.bestWeightKg)}</span>}
                      <button type="button" className="icon-btn" style={{ width: 32, height: 32, background: 'transparent' }} aria-label={t('{name} options', { name: cname(e.exercise.name) })} onClick={() => setExMenu(e)}><Icon name="more" size={20} stroke={3} /></button>
                    </div>
                    {e.program && (e.program.calibrate || e.program.change) && (
                      <div className={`ex-note${e.program.calibrate ? ' calibrate' : ''}`}>
                        {e.program.calibrate
                          ? `${e.program.guess ? `${t('The weight is a starting guess.')} ` : ''}${t('Find your weight: work up until a set leaves about 2 reps in the tank, then say how many were left.')}`
                          : describeChange(e.program.change, t, (kg) => fmt.w(kg))}
                      </div>
                    )}
                    <div className={`set-grid set-head${e.exercise.trackType === 'weight_reps' || e.exercise.trackType === 'weighted_bodyweight' ? '' : e.exercise.trackType === 'distance_duration' ? ' time-dist' : ' no-weight'}`}>
                      <span>{t('Set@col')}</span><span>{t('Previous')}</span>
                      {(e.exercise.trackType === 'weight_reps' || e.exercise.trackType === 'weighted_bodyweight') && <span className="center">{e.exercise.trackType === 'weighted_bodyweight' ? `+${fmt.weightLabel}` : fmt.weightLabel}</span>}
                      {e.exercise.trackType === 'distance_duration' && <span className="center">{t('km')}</span>}
                      <span className="center">{e.exercise.trackType === 'duration' || e.exercise.trackType === 'distance_duration' ? t('Time') : t('Reps')}</span><span />
                    </div>
                    {e.sets.map((s, i) => {
                      if (s.setType !== 'warmup') n += 1;
                      const prev = s.setType === 'warmup' ? e.previous.find((p) => p.setType === 'warmup') : working[n - 1];
                      const askRir = open && e.program && weighted && s.completed && s.setType !== 'warmup' && (e.program.calibrate || s === lastWorking);
                      return (
                        <div key={s.id}>
                          <SetRow set={s} number={n} current={s.id === firstOpen} track={e.exercise.trackType} fmt={fmt} prev={prev}
                            onChange={(patch) => changeSet(e, s, patch)} onMenu={() => setSetMenu({ set: s, ex: e })} onDelete={() => run('deleteSet', { id: s.id })} />
                          {askRir && <RepsLeft set={s} onPick={(rir) => changeSet(e, s, { rir })} />}
                        </div>
                      );
                    })}
                    <div className="add-set-row">
                      <button type="button" className="add-set" onClick={() => { haptic.tap(); run('addSet', { workoutExerciseId: e.id }); }}>
                        <Icon name="plus" size={16} stroke={2.4} />{t('Add set')}
                      </button>
                      {weighted && dropBase && (
                        <button type="button" className="add-set" onClick={() => addDrop(e, dropBase)}>
                          <Icon name="plus" size={16} stroke={2.4} />{t('Drop set')}
                        </button>
                      )}
                    </div>
                  </div>
                );
                });
                if (b.group === null) return cards;
                return (
                  <div key={`ss-${b.exercises[0].id}`} className="superset">
                    <div className="superset-head"><Icon name="link" size={14} stroke={2.4} />{t('Superset')}<span className="hint"> · {t('no rest between exercises')}</span></div>
                    {cards}
                  </div>
                );
              })}

              <button type="button" className="btn plain lg block" onClick={() => setPicker(true)}><Icon name="plus" size={18} stroke={2.4} />{t('Add exercise')}</button>
              {w.notes && <p className="small hint" style={{ padding: '0 4px' }}>{t('Notes: {notes}', { notes: w.notes })}</p>}

              <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(ex) => { setPicker(false); run('addWorkoutExercise', { workoutId: w.id, exerciseId: ex.id }); }} />

              <Sheet open={!!setMenu} onClose={() => setSetMenu(null)} title={t('Set')}>
                {setMenu && (
                  <>
                    <List>
                      {SET_TYPES.map((st) => (
                        <Row key={st.value} title={t(st.label)} onClick={() => { changeSet(setMenu.ex, setMenu.set, { setType: st.value }); setSetMenu(null); }}>
                          {setMenu.set.setType === st.value && <Icon name="check" size={18} color="var(--link)" stroke={2.6} />}
                        </Row>
                      ))}
                    </List>
                    {WEIGHTED.includes(setMenu.ex.exercise.trackType) && (
                      <List>
                        <Row title={t('Add a drop set after this one')} sub={setMenu.set.weightKg ? fmt.w(dropWeightKg(setMenu.set.weightKg, fmt)) : null}
                          onClick={() => { const { ex, set } = setMenu; setSetMenu(null); addDrop(ex, set); }} />
                      </List>
                    )}
                    <button type="button" className="btn danger block" style={{ background: 'var(--field)' }} onClick={() => { const s = setMenu.set; setSetMenu(null); run('deleteSet', { id: s.id }); }}>{t('Delete set')}</button>
                  </>
                )}
              </Sheet>

              <Sheet open={!!exMenu} onClose={() => setExMenu(null)} title={exMenu === 'workout' ? t('Workout') : exMenu?.exercise && cname(exMenu.exercise.name)}>
                {exMenu === 'workout' ? (
                  <List>
                    <Row title={t('Discard workout')} danger onClick={discard} />
                  </List>
                ) : exMenu && (
                  <>
                    {exerciseGuide(exMenu.exercise.name) && (
                      <List>
                        <Row title={t('How to do it')} chevron onClick={() => { const name = exMenu.exercise.name; setExMenu(null); setGuide(name); }} />
                      </List>
                    )}
                    <div className="stack-sm">
                      <span className="label">{t('Rest between sets')}</span>
                      <Stepper value={(exMenu.restSec || 0) / 60} step={0.25} decimals={2} unit={t('min')} label={t('rest')}
                        onChange={(v) => { const sec = Math.max(0, Math.round(v * 60)); setExMenu({ ...exMenu, restSec: sec }); }} />
                    </div>
                    <List>
                      <Row title={t('Save rest time')} onClick={() => { const e = exMenu; setExMenu(null); run('updateWorkoutExercise', { id: e.id, restSec: e.restSec }); }} />
                      {(() => {
                        const i = d.exercises.findIndex((x) => x.id === exMenu.id);
                        const block = blocks(d.exercises).find((b) => b.exercises.some((x) => x.id === exMenu.id));
                        const next = d.exercises[i + 1];
                        const linked = block && block.group !== null;
                        const linkedToNext = linked && next && block.exercises.some((x) => x.id === next.id);
                        return (
                          <>
                            {next && !linkedToNext && <Row title={t('Superset with next exercise')} sub={cname(next.exercise.name)} onClick={() => { const e = exMenu; setExMenu(null); run('updateWorkoutExercise', { id: e.id, linkNext: true }); }} />}
                            {linked && <Row title={t('Remove from superset')} onClick={() => { const e = exMenu; setExMenu(null); run('updateWorkoutExercise', { id: e.id, supersetGroup: null }); }} />}
                          </>
                        );
                      })()}
                      <Row title={t('Move up')} onClick={() => { const e = exMenu; setExMenu(null); run('updateWorkoutExercise', { id: e.id, position: Math.max(0, d.exercises.indexOf(d.exercises.find((x) => x.id === e.id)) - 1) }); }} />
                      <Row title={t('Move down')} onClick={() => { const e = exMenu; setExMenu(null); run('updateWorkoutExercise', { id: e.id, position: d.exercises.findIndex((x) => x.id === e.id) + 1 }); }} />
                      <Row title={t('Remove exercise')} danger onClick={async () => { const e = exMenu; setExMenu(null); if (await confirmDialog(t('Remove {name} and its sets?', { name: cname(e.exercise.name) }))) run('removeWorkoutExercise', { id: e.id }); }} />
                    </List>
                  </>
                )}
              </Sheet>

              <GuideSheet name={guide} onClose={() => setGuide(null)} />

              {open && <MainButton text={t('Finish workout')} busy={finishing} onClick={finish} />}
              {!open && <ShareButton workout={d.workout} prs={d.prs || []} />}
            </>
          );
        }}
      </Loader>
    </div>
  );
}
