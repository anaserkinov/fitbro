import { Segmented } from './kit.jsx';
import { t } from '../lib/i18n.js';

// Experience, equipment and session length — what program recommendations go by.
// Used in onboarding, Settings and the Programs prompt. Labels are translation keys.

export const EXPERIENCE = [
  { value: 'new', label: 'Beginner', hint: 'Under 6 months of regular training' },
  { value: 'some', label: 'Intermediate', hint: 'Training regularly for 6 months or more' },
  { value: 'experienced', label: 'Advanced', hint: 'Years of training, comfortable with heavy barbell lifts' },
];
export const EQUIPMENT = [
  { value: 'gym', label: 'Gym' },
  { value: 'dumbbells', label: 'Dumbbells' },
  { value: 'home', label: 'No equipment' },
];
export const SESSION_MINUTES = [30, 45, 60, 90];

export const trainingSummary = (user) => [
  EXPERIENCE.find((o) => o.value === user.experience)?.label,
  EQUIPMENT.find((o) => o.value === user.equipment)?.label,
].filter(Boolean).map((k) => t(k)).concat(user.sessionMinutes ? [t('{n} min', { n: user.sessionMinutes })] : []).join(' · ');

export default function TrainingFields({ value, onChange }) {
  const level = EXPERIENCE.find((o) => o.value === value.experience);
  return (
    <>
      <div className="form-row">
        <span className="label">{t('Training experience')}</span>
        <Segmented label={t('Training experience')} value={value.experience} onChange={(v) => onChange({ experience: v })} options={EXPERIENCE.map((o) => ({ value: o.value, label: t(o.label) }))} />
        {level && <span className="tiny hint" style={{ marginTop: 4 }}>{t(level.hint)}</span>}
      </div>
      <div className="form-row">
        <span className="label">{t('Where you train')}</span>
        <Segmented label={t('Where you train')} value={value.equipment} onChange={(v) => onChange({ equipment: v })} options={EQUIPMENT.map((o) => ({ value: o.value, label: t(o.label) }))} />
      </div>
      <div className="form-row">
        <span className="label">{t('Time per workout')}</span>
        <Segmented label={t('Time per workout')} value={value.sessionMinutes} onChange={(v) => onChange({ sessionMinutes: v })} options={SESSION_MINUTES.map((n) => ({ value: n, label: t('{n} min', { n }) }))} />
      </div>
    </>
  );
}
