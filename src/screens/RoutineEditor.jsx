import { useEffect, useState } from 'react';
import { call, mutate, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { startOrResume } from '../lib/workout-start.js';
import { MainButton, NumberInput, Switch, Spinner, toast, toastError } from '../ui/kit.jsx';
import ExercisePicker from '../ui/ExercisePicker.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic, confirmDialog } from '../lib/tg.js';
import { t as tr, cname } from '../lib/i18n.js';
import { normalizeGroups } from '../../tgcloud/lib/supersets.js';

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

const linked = (a, b) => !!a && !!b && a.supersetGroup != null && a.supersetGroup === b.supersetGroup;

// Links item i with item i + 1 into a superset (merging groups), or splits them.
function toggleLink(items, i) {
  const list = items.map((x) => ({ ...x }));
  const fresh = Math.max(0, ...list.map((x) => x.supersetGroup || 0)) + 1;
  const a = list[i], b = list[i + 1];
  if (linked(a, b)) {
    const g = a.supersetGroup;
    for (let j = i + 1; j < list.length && list[j].supersetGroup === g; j++) list[j].supersetGroup = fresh;
  } else {
    const g = a.supersetGroup ?? b.supersetGroup ?? fresh;
    const old = b.supersetGroup;
    a.supersetGroup = g;
    for (let j = i + 1; j < list.length && (j === i + 1 || (old != null && list[j].supersetGroup === old)); j++) list[j].supersetGroup = g;
  }
  return normalizeGroups(list);
}

function ItemCard({ item, index, count, fmt, defaultRest, superset, onChange, onMove, onRemove }) {
  const t = item.exercise.trackType;
  return (
    <div className={`card${superset ? ' in-superset' : ''}`} style={{ gap: 10 }}>
      <div className="row-between">
        <span className="bold ellipsis" style={{ fontSize: 17 }}>{index + 1}. {cname(item.exercise.name)}</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" className="icon-btn" style={{ width: 32, height: 32, background: 'transparent' }} aria-label={tr('Move up')} disabled={index === 0} onClick={() => onMove(-1)}><Icon name="moveUp" size={18} stroke={2.4} /></button>
          <button type="button" className="icon-btn" style={{ width: 32, height: 32, background: 'transparent' }} aria-label={tr('Move down')} disabled={index === count - 1} onClick={() => onMove(1)}><Icon name="moveDown" size={18} stroke={2.4} /></button>
          <button type="button" className="icon-btn" style={{ width: 32, height: 32, background: 'transparent', color: 'var(--destructive)' }} aria-label={tr('Remove {name}', { name: cname(item.exercise.name) })} onClick={onRemove}><Icon name="trash" size={18} /></button>
        </div>
      </div>
      <div className="grid3">
        <label className="form-row"><span className="label">{tr('Sets')}</span>
          <NumberInput value={item.targetSets} decimals={0} min={1} max={20} onCommit={(v) => onChange({ targetSets: v || 1 })} label={tr('Sets')} /></label>
        {TIMED.includes(t) ? (
          <label className="form-row" style={{ gridColumn: 'span 2' }}><span className="label">{tr('Time, seconds')}</span>
            <NumberInput value={item.targetDurationSec} decimals={0} onCommit={(v) => onChange({ targetDurationSec: v })} label={tr('Target time')} /></label>
        ) : (
          <>
            <label className="form-row"><span className="label">{tr('Reps from')}</span>
              <NumberInput value={item.targetRepsMin} decimals={0} onCommit={(v) => onChange({ targetRepsMin: v, targetRepsMax: Math.max(v || 0, item.targetRepsMax || 0) || v })} label={tr('Minimum reps')} /></label>
            <label className="form-row"><span className="label">{tr('to@reps')}</span>
              <NumberInput value={item.targetRepsMax} decimals={0} onCommit={(v) => onChange({ targetRepsMax: v, targetRepsMin: Math.min(v || 0, item.targetRepsMin || v || 0) || v })} label={tr('Maximum reps')} /></label>
          </>
        )}
      </div>
      <div className="grid2">
        {WEIGHTED.includes(t) && (
          <label className="form-row"><span className="label">{t === 'weighted_bodyweight' ? tr('Added weight') : tr('Weight@load')}, {fmt.weightLabel}</span>
            <NumberInput value={fmt.wNum(item.targetWeightKg)} decimals={2} placeholder={tr('Last time')} onCommit={(v) => onChange({ targetWeightKg: fmt.toKg(v) })} label={tr('Target weight')} /></label>
        )}
        <label className="form-row"><span className="label">{tr('Rest')}</span>
          <select className="input" value={item.restSec ?? ''} onChange={(e) => onChange({ restSec: e.target.value === '' ? null : Number(e.target.value) })}>
            <option value="">{tr('Default ({n} min)', { n: Math.round(defaultRest / 6) / 10 })}</option>
            {REST_OPTIONS.map((s) => <option key={s} value={s}>{s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : tr('No rest')}</option>)}
          </select></label>
      </div>
      {WEIGHTED.includes(t) && (
        <div className="row-between">
          <span className="small">{tr('Add {w} when all reps are hit', { w: fmt.w(item.incrementKg) })}</span>
          <Switch checked={item.autoProgress} onChange={(v) => onChange({ autoProgress: v })} label={tr('Auto progression')} />
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
  // A moved exercise leaves its superset; groups stay consecutive.
  const move = (i, d) => { const items = [...r.items]; [items[i], items[i + d]] = [{ ...items[i + d] }, { ...items[i], supersetGroup: null }]; update({ items: normalizeGroups(items) }); };

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
          supersetGroup: it.supersetGroup ?? null,
        })),
      }, AFFECTS.routines);
      haptic.success();
      toast(tr('Routine saved'));
      if (id) setDirty(false); else nav.replace('RoutineEditor', { id: res.routine.id });
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }

  async function archive() {
    if (!(await confirmDialog(tr('Delete routine “{name}”? Past workouts are kept.', { name: r.name })))) return;
    try { await mutate('archiveRoutine', { id }, AFFECTS.routines); nav.pop(); } catch (e) { toastError(e); }
  }

  return (
    <div className="screen sub">
      <h1 className="title" style={{ padding: '0 4px' }}>{id ? tr('Edit routine') : tr('New routine')}</h1>
      <div className="card">
        <label className="form-row"><span className="label">{tr('Name')}</span><input className="input" value={r.name} placeholder={tr('e.g. Push A')} onChange={(e) => update({ name: e.target.value })} /></label>
        <label className="form-row"><span className="label">{tr('Notes')}</span><textarea className="input" value={r.notes} placeholder={tr('Optional')} onChange={(e) => update({ notes: e.target.value })} /></label>
      </div>
      {r.items.map((it, i) => (
        <div key={it.id || `new-${i}-${it.exercise.id}`} className="stack-sm" style={{ gap: 0 }}>
          <ItemCard item={it} index={i} count={r.items.length} fmt={fmt} defaultRest={user.defaultRestSec}
            superset={linked(r.items[i - 1], it) || linked(it, r.items[i + 1])}
            onChange={(p) => setItem(i, p)} onMove={(d) => move(i, d)} onRemove={() => update({ items: normalizeGroups(r.items.filter((_, j) => j !== i)) })} />
          {i < r.items.length - 1 && (
            <button type="button" className={`link-btn${linked(it, r.items[i + 1]) ? ' on' : ''}`} aria-pressed={linked(it, r.items[i + 1])}
              onClick={() => { haptic.select(); update({ items: toggleLink(r.items, i) }); }}>
              <Icon name="link" size={14} stroke={2.4} />{linked(it, r.items[i + 1]) ? tr('Superset · tap to unlink') : tr('Link as superset')}
            </button>
          )}
        </div>
      ))}
      <button type="button" className="btn plain lg block" onClick={() => setPicker(true)}><Icon name="plus" size={18} stroke={2.4} />{tr('Add exercise')}</button>
      {id && !dirty && r.items.length > 0 && <button type="button" className="btn soft lg block" onClick={() => startOrResume(nav, id)}>{tr('Start this routine')}</button>}
      {id && <button type="button" className="btn danger block" onClick={archive}>{tr('Delete routine')}</button>}
      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(ex) => { setPicker(false); update({ items: [...r.items, newItem(ex, fmt)] }); }} />
      <MainButton text={dirty ? tr('Save routine') : tr('Saved')} disabled={!dirty || !r.name.trim()} busy={busy} onClick={save} />
    </div>
  );
}
