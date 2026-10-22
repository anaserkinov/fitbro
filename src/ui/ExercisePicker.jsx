import { useMemo, useState } from 'react';
import { useApi } from '../lib/api.js';
import { MUSCLE_LABEL, MUSCLE_TINT } from '../lib/format.js';
import { Sheet, Chips, Spinner, Empty } from './kit.jsx';
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

// Bottom sheet listing the library; recently used first when not searching.
export default function ExercisePicker({ open, onClose, onPick, title }) {
  const q = useApi('listExercises', {}, { skip: !open });
  const [text, setText] = useState('');
  const [muscle, setMuscle] = useState('all');
  const rows = useMemo(() => {
    if (!q.data) return [];
    const list = filterExercises(q.data.exercises, text, muscle);
    if (!text) list.sort((a, b) => (b.lastUsedAt ? new Date(b.lastUsedAt) : 0) - (a.lastUsedAt ? new Date(a.lastUsedAt) : 0));
    return list.slice(0, 60);
  }, [q.data, text, muscle]);

  return (
    <Sheet open={open} onClose={onClose} title={title || t('Add exercise')} gray>
      <label className="field" style={{ background: 'var(--card)' }}>
        <Icon name="search" size={18} color="var(--hint)" />
        <span className="sr-only">{t('Search exercises')}</span>
        <input type="search" placeholder={t('Search exercises')} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <Chips options={filters(FILTER_MUSCLES)} value={muscle} onChange={setMuscle} />
      {!q.data ? <Spinner /> : !rows.length ? <Empty>{t('No exercises match. You can create one in Train › Exercises.')}</Empty> : (
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
    </Sheet>
  );
}
