import { useMemo, useState } from 'react';
import { useApi, mutate, AFFECTS } from '../lib/api.js';
import { MUSCLE_LABEL, MUSCLE_TINT } from '../lib/format.js';
import { MUSCLES, EQUIPMENT, TRACK } from '../screens/ExerciseEditor.jsx';
import { EQUIPMENT_LABEL } from '../screens/ExerciseDetail.jsx';
import { Sheet, Chips, Spinner, Empty, toastError } from './kit.jsx';
import { Icon } from './icons.jsx';
import { haptic } from '../lib/tg.js';
import { t, cname } from '../lib/i18n.js';

const FILTER_MUSCLES = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio'];
const filters = (muscles) => [{ value: 'all', label: t('All') }, ...muscles.map((m) => ({ value: m, label: t(MUSCLE_LABEL[m]) }))];

// Equipment / category values are lower-case keys: t('barbell') → 'штанга'.
export const exerciseMeta = (e, extra = []) => [t(MUSCLE_LABEL[e.muscle]), e.equipment && t(e.equipment), ...extra].filter(Boolean).join(' · ');

export function MuscleBadge({ muscle }) {
  const [bg, ink] = MUSCLE_TINT[muscle] || MUSCLE_TINT.full_body;
  return (
    <span style={{ width: 36, height: 36, borderRadius: 9, background: bg, color: ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flex: 'none' }} aria-hidden="true">
      {t(MUSCLE_LABEL[muscle]).slice(0, 2)}
    </span>
  );
}

// Matches the English name, the translated name and the aliases.
export function filterExercises(list, q, muscle) {
  const needle = q.trim().toLowerCase();
  return list.filter((e) => (muscle === 'all' || e.muscle === muscle)
    && (!needle || e.name.toLowerCase().includes(needle) || cname(e.name).toLowerCase().includes(needle)
      || (e.aliases || []).some((a) => a.includes(needle))));
}

export { filters as muscleFilters };

// Quick-create inside the sheet: navigating to ExerciseEditor would unmount the
// caller (and lose an unsaved routine). The rest of the fields are in the editor.
function QuickCreate({ initial, onCancel, onCreated }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  async function save() {
    setBusy(true);
    try {
      const r = await mutate('saveExercise', { ...f, name: f.name.trim() }, AFFECTS.exercises);
      haptic.success();
      onCreated(r.exercise);
    } catch (e) { toastError(e); setBusy(false); }
  }

  const select = (key, options) => (
    <select className="input" value={f[key]} onChange={(e) => set({ [key]: e.target.value })}>
      {options.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
    </select>
  );

  return (
    <>
      <div className="card">
        <label className="form-row"><span className="label">{t('Name')}</span><input className="input" value={f.name} autoFocus onChange={(e) => set({ name: e.target.value })} /></label>
        <div className="grid2">
          <label className="form-row"><span className="label">{t('Muscle group')}</span>{select('muscle', MUSCLES.map((m) => ({ value: m, label: MUSCLE_LABEL[m] })))}</label>
          <label className="form-row"><span className="label">{t('Equipment')}</span>{select('equipment', EQUIPMENT.map((e) => ({ value: e, label: EQUIPMENT_LABEL[e] })))}</label>
          <label className="form-row"><span className="label">{t('Type')}</span>{select('category', [{ value: 'compound', label: 'Compound' }, { value: 'isolation', label: 'Isolation' }])}</label>
          <label className="form-row"><span className="label">{t('Track as')}</span>{select('trackType', TRACK)}</label>
        </div>
      </div>
      <button type="button" className="btn lg block" disabled={busy || !f.name.trim()} onClick={save}>{t('Create and add')}</button>
      <button type="button" className="btn plain lg block" style={{ marginTop: 8 }} onClick={onCancel}>{t('Cancel')}</button>
    </>
  );
}

// Bottom sheet listing the library; recently used first when not searching.
export default function ExercisePicker({ open, onClose, onPick, title }) {
  const q = useApi('listExercises', {}, { skip: !open });
  const [text, setText] = useState('');
  const [muscle, setMuscle] = useState('all');
  const [draft, setDraft] = useState(null);
  const name = text.trim();
  const exact = q.data && q.data.exercises.some((e) => e.name.toLowerCase() === name.toLowerCase() || cname(e.name).toLowerCase() === name.toLowerCase());
  const startCreate = () => {
    haptic.tap();
    setDraft({ name, muscle: muscle === 'all' ? 'chest' : muscle, equipment: 'barbell', category: 'compound', trackType: 'weight_reps' });
  };
  const close = () => { setDraft(null); onClose(); };
  const rows = useMemo(() => {
    if (!q.data) return [];
    const list = filterExercises(q.data.exercises, text, muscle);
    if (!text) list.sort((a, b) => (b.lastUsedAt ? new Date(b.lastUsedAt) : 0) - (a.lastUsedAt ? new Date(a.lastUsedAt) : 0));
    return list.slice(0, 60);
  }, [q.data, text, muscle]);

  if (draft) {
    return (
      <Sheet open={open} onClose={close} title={t('New exercise')} gray>
        <QuickCreate initial={draft} onCancel={() => setDraft(null)}
          onCreated={(e) => { setDraft(null); setText(''); onPick(e); }} />
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={close} title={title || t('Add exercise')} gray>
      <label className="field" style={{ background: 'var(--card)' }}>
        <Icon name="search" size={18} color="var(--hint)" />
        <span className="sr-only">{t('Search exercises')}</span>
        <input type="search" placeholder={t('Search exercises')} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <Chips options={filters(FILTER_MUSCLES)} value={muscle} onChange={setMuscle} />
      {!q.data ? <Spinner /> : (
        <>
          {!rows.length && <Empty>{t('No exercises match.')}</Empty>}
          {!exact && (
            <div className="list" style={{ marginBottom: rows.length ? 12 : 0 }}>
              <button type="button" className="row" style={{ minHeight: 56 }} onClick={startCreate}>
                <Icon name="plus" size={20} color="var(--link)" stroke={2.4} />
                <span className="grow row-title" style={{ color: 'var(--link)' }}>{name ? t('Create “{name}”', { name }) : t('New exercise')}</span>
              </button>
            </div>
          )}
          {rows.length > 0 && (
            <div className="list">
              {rows.map((e) => (
                <button key={e.id} type="button" className="row" style={{ minHeight: 56, '--inset': '64px' }} onClick={() => { haptic.tap(); onPick(e); }}>
                  <MuscleBadge muscle={e.muscle} />
                  <span className="grow">
                    <span className="row-title">{cname(e.name)}</span>
                    <span className="sub">{exerciseMeta(e, [e.timesUsed && t('used {n}×', { n: e.timesUsed })])}</span>
                  </span>
                  <Icon name="plus" size={18} color="var(--link)" stroke={2.4} />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
