import { useEffect, useState } from 'react';
import { call, mutate, AFFECTS } from '../lib/api.js';
import { useNav } from '../lib/app-state.jsx';
import { MUSCLE_LABEL } from '../lib/format.js';
import { MainButton, Spinner, toast, toastError } from '../ui/kit.jsx';
import { haptic, confirmDialog } from '../lib/tg.js';

const MUSCLES = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio', 'full_body'];
const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other'];
const TRACK = [
  { value: 'weight_reps', label: 'Weight × reps' },
  { value: 'bodyweight_reps', label: 'Bodyweight reps' },
  { value: 'weighted_bodyweight', label: 'Bodyweight + added weight' },
  { value: 'duration', label: 'Time' },
  { value: 'distance_duration', label: 'Distance + time' },
];

// Create (no id) or edit a custom exercise.
export default function ExerciseEditor({ id }) {
  const nav = useNav();
  const [f, setF] = useState(id ? null : { name: '', muscle: 'chest', equipment: 'barbell', category: 'compound', trackType: 'weight_reps', notes: '', link: '', aliases: '', defaultRestSec: '' });
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    if (!id) return;
    call('listExercises', {}).then((r) => {
      const e = r.exercises.find((x) => x.id === id);
      if (e) setF({ name: e.name, muscle: e.muscle, equipment: e.equipment || 'other', category: e.category || 'compound', trackType: e.trackType, notes: e.notes || '', link: e.link || '', aliases: (e.aliases || []).join(', '), defaultRestSec: e.defaultRestSec ?? '' });
    }, toastError);
  }, [id]);

  if (!f) return <div className="screen sub"><Spinner /></div>;

  async function save() {
    setBusy(true);
    try {
      await mutate('saveExercise', {
        ...(id ? { id } : {}),
        name: f.name.trim(), muscle: f.muscle, equipment: f.equipment, category: f.category, trackType: f.trackType,
        notes: f.notes.trim() || null, link: f.link.trim() || null,
        aliases: f.aliases.split(',').map((a) => a.trim()).filter(Boolean),
        defaultRestSec: f.defaultRestSec === '' ? null : Number(f.defaultRestSec),
      }, AFFECTS.exercises);
      haptic.success();
      toast(id ? 'Exercise saved' : 'Exercise created');
      nav.pop();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }

  async function archive() {
    if (!(await confirmDialog(`Delete ${f.name}? Your history with it is kept.`))) return;
    try { await mutate('archiveExercise', { id }, AFFECTS.exercises); nav.pop(); nav.pop(); } catch (e) { toastError(e); }
  }

  const select = (key, options) => (
    <select className="input" value={f[key]} onChange={(e) => set({ [key]: e.target.value })}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <div className="screen sub">
      <h1 className="title" style={{ padding: '0 4px' }}>{id ? 'Edit exercise' : 'New exercise'}</h1>
      <div className="card">
        <label className="form-row"><span className="label">Name</span><input className="input" value={f.name} placeholder="e.g. Landmine Press" onChange={(e) => set({ name: e.target.value })} /></label>
        <div className="grid2">
          <label className="form-row"><span className="label">Muscle group</span>{select('muscle', MUSCLES.map((m) => ({ value: m, label: MUSCLE_LABEL[m] })))}</label>
          <label className="form-row"><span className="label">Equipment</span>{select('equipment', EQUIPMENT.map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) })))}</label>
          <label className="form-row"><span className="label">Type</span>{select('category', [{ value: 'compound', label: 'Compound' }, { value: 'isolation', label: 'Isolation' }])}</label>
          <label className="form-row"><span className="label">Default rest</span>
            <select className="input" value={f.defaultRestSec} onChange={(e) => set({ defaultRestSec: e.target.value })}>
              <option value="">My default</option>
              {[30, 60, 90, 120, 180, 240, 300].map((s) => <option key={s} value={s}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</option>)}
            </select></label>
        </div>
        <label className="form-row"><span className="label">Track as</span>{select('trackType', TRACK)}</label>
      </div>
      <div className="card">
        <label className="form-row"><span className="label">Also known as (comma separated)</span><input className="input" value={f.aliases} placeholder="landmine, lm press" onChange={(e) => set({ aliases: e.target.value })} /></label>
        <label className="form-row"><span className="label">Form notes</span><textarea className="input" value={f.notes} placeholder="Cues, setup, grip…" onChange={(e) => set({ notes: e.target.value })} /></label>
        <label className="form-row"><span className="label">Video or article link</span><input className="input" type="url" value={f.link} placeholder="https://" onChange={(e) => set({ link: e.target.value })} /></label>
      </div>
      {id && <button type="button" className="btn danger block" onClick={archive}>Delete exercise</button>}
      <MainButton text="Save" disabled={!f.name.trim()} busy={busy} onClick={save} />
    </div>
  );
}
