import { useEffect, useState } from 'react';
import { call, mutate, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { startOrResume } from '../lib/workout-start.js';
import { MainButton, NumberInput, Switch, Spinner, toast, toastError } from '../ui/kit.jsx';
import ExercisePicker from '../ui/ExercisePicker.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic, confirmDialog } from '../lib/tg.js';

const REST_OPTIONS = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];
const WEIGHTED = ['weight_reps', 'weighted_bodyweight'];
const TIMED = ['duration', 'distance_duration'];

function newItem(ex, fmt) {
  return {
    exercise: { id: ex.id, name: ex.name, trackType: ex.trackType, muscle: ex.muscle },
    targetSets: 3,
    targetRepsMin: TIMED.includes(ex.trackType) ? null : 8,
    targetRepsMax: TIMED.includes(ex.trackType) ? null : 10,
    targetWeightKg: null,
    targetDurationSec: TIMED.includes(ex.trackType) ? 60 : null,
    restSec: null,
    autoProgress: WEIGHTED.includes(ex.trackType),
    incrementKg: fmt.weightUnit === 'lb' ? fmt.toKg(5) : 2.5,
  };
}

function ItemCard({ item, index, count, fmt, defaultRest, onChange, onMove, onRemove }) {
  const t = item.exercise.trackType;
  return (
    <div className="card" style={{ gap: 10 }}>
      <div className="row-between">
        <span className="bold ellipsis" style={{ fontSize: 17 }}>{index + 1}. {item.exercise.name}</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" className="icon-btn" style={{ width: 32, height: 32, background: 'transparent' }} aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}><Icon name="moveUp" size={18} stroke={2.4} /></button>
          <button type="button" className="icon-btn" style={{ width: 32, height: 32, background: 'transparent' }} aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}><Icon name="moveDown" size={18} stroke={2.4} /></button>
          <button type="button" className="icon-btn" style={{ width: 32, height: 32, background: 'transparent', color: 'var(--destructive)' }} aria-label={`Remove ${item.exercise.name}`} onClick={onRemove}><Icon name="trash" size={18} /></button>
        </div>
      </div>
      <div className="grid3">
        <label className="form-row"><span className="label">Sets</span>
          <NumberInput value={item.targetSets} decimals={0} min={1} max={20} onCommit={(v) => onChange({ targetSets: v || 1 })} label="Sets" /></label>
        {TIMED.includes(t) ? (
          <label className="form-row" style={{ gridColumn: 'span 2' }}><span className="label">Time, seconds</span>
            <NumberInput value={item.targetDurationSec} decimals={0} onCommit={(v) => onChange({ targetDurationSec: v })} label="Target time" /></label>
        ) : (
          <>
            <label className="form-row"><span className="label">Reps from</span>
              <NumberInput value={item.targetRepsMin} decimals={0} onCommit={(v) => onChange({ targetRepsMin: v, targetRepsMax: Math.max(v || 0, item.targetRepsMax || 0) || v })} label="Minimum reps" /></label>
            <label className="form-row"><span className="label">to</span>
              <NumberInput value={item.targetRepsMax} decimals={0} onCommit={(v) => onChange({ targetRepsMax: v, targetRepsMin: Math.min(v || 0, item.targetRepsMin || v || 0) || v })} label="Maximum reps" /></label>
          </>
        )}
      </div>
      <div className="grid2">
        {WEIGHTED.includes(t) && (
          <label className="form-row"><span className="label">{t === 'weighted_bodyweight' ? 'Added weight' : 'Weight'}, {fmt.weightUnit}</span>
            <NumberInput value={fmt.wNum(item.targetWeightKg)} decimals={2} placeholder="Last time" onCommit={(v) => onChange({ targetWeightKg: fmt.toKg(v) })} label="Target weight" /></label>
        )}
        <label className="form-row"><span className="label">Rest</span>
          <select className="input" value={item.restSec ?? ''} onChange={(e) => onChange({ restSec: e.target.value === '' ? null : Number(e.target.value) })}>
            <option value="">Default ({Math.round(defaultRest / 6) / 10} min)</option>
            {REST_OPTIONS.map((s) => <option key={s} value={s}>{s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'No rest'}</option>)}
          </select></label>
      </div>
      {WEIGHTED.includes(t) && (
        <div className="row-between">
          <span className="small">Add {fmt.w(item.incrementKg)} when all reps are hit</span>
          <Switch checked={item.autoProgress} onChange={(v) => onChange({ autoProgress: v })} label="Auto progression" />
        </div>
      )}
    </div>
  );
}

export default function RoutineEditor({ id }) {
  const { user, fmt } = useUser();
  const nav = useNav();
  const [r, setR] = useState(id ? null : { name: '', notes: '', items: [] });
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(!id);

  useEffect(() => {
    if (!id) return;
    call('getRoutine', { id }).then(({ routine }) => setR({
      name: routine.name, notes: routine.notes || '',
      items: routine.items.filter((i) => i.exercise).map((i) => ({ ...i, exercise: i.exercise })),
    }), toastError);
  }, [id]);

  if (!r) return <div className="screen sub"><Spinner /></div>;
  const update = (patch) => { setR({ ...r, ...patch }); setDirty(true); };
  const setItem = (i, patch) => update({ items: r.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const move = (i, d) => { const items = [...r.items]; [items[i], items[i + d]] = [items[i + d], items[i]]; update({ items }); };

  async function save() {
    setBusy(true);
    try {
      const res = await mutate('saveRoutine', {
        ...(id ? { id } : {}),
        name: r.name.trim(), notes: r.notes.trim() || null,
        items: r.items.map((it) => ({
          ...(it.id ? { id: it.id } : {}),
          exerciseId: it.exercise.id, targetSets: it.targetSets,
          targetRepsMin: it.targetRepsMin ?? null, targetRepsMax: it.targetRepsMax ?? null,
          targetWeightKg: it.targetWeightKg ?? null, targetDurationSec: it.targetDurationSec ?? null,
          restSec: it.restSec ?? null, autoProgress: !!it.autoProgress, incrementKg: it.incrementKg ?? null,
          ...(it.supersetGroup ? { supersetGroup: it.supersetGroup } : {}),
        })),
      }, AFFECTS.routines);
      haptic.success();
      toast('Routine saved');
      if (id) setDirty(false); else nav.replace('RoutineEditor', { id: res.routine.id });
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }

  async function archive() {
    if (!(await confirmDialog(`Delete routine “${r.name}”? Past workouts are kept.`))) return;
    try { await mutate('archiveRoutine', { id }, AFFECTS.routines); nav.pop(); } catch (e) { toastError(e); }
  }

  return (
    <div className="screen sub">
      <h1 className="title" style={{ padding: '0 4px' }}>{id ? 'Edit routine' : 'New routine'}</h1>
      <div className="card">
        <label className="form-row"><span className="label">Name</span><input className="input" value={r.name} placeholder="e.g. Push A" onChange={(e) => update({ name: e.target.value })} /></label>
        <label className="form-row"><span className="label">Notes</span><textarea className="input" value={r.notes} placeholder="Optional" onChange={(e) => update({ notes: e.target.value })} /></label>
      </div>
      {r.items.map((it, i) => (
        <ItemCard key={it.id || `new-${i}-${it.exercise.id}`} item={it} index={i} count={r.items.length} fmt={fmt} defaultRest={user.defaultRestSec}
          onChange={(p) => setItem(i, p)} onMove={(d) => move(i, d)} onRemove={() => update({ items: r.items.filter((_, j) => j !== i) })} />
      ))}
      <button type="button" className="btn plain lg block" onClick={() => setPicker(true)}><Icon name="plus" size={18} stroke={2.4} />Add exercise</button>
      {id && !dirty && r.items.length > 0 && <button type="button" className="btn soft lg block" onClick={() => startOrResume(nav, id)}>Start this routine</button>}
      {id && <button type="button" className="btn danger block" onClick={archive}>Delete routine</button>}
      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(ex) => { setPicker(false); update({ items: [...r.items, newItem(ex, fmt)] }); }} />
      <MainButton text={dirty ? 'Save routine' : 'Saved'} disabled={!dirty || !r.name.trim()} busy={busy} onClick={save} />
    </div>
  );
}
