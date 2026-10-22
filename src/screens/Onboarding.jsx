import { useEffect, useMemo, useState } from 'react';
import { call, invalidate, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { makeFmt } from '../lib/format.js';
import { computeTargets } from '../../tgcloud/lib/nutrition.js';
import { localDate, isValidTimezone } from '../../tgcloud/lib/dates.js';
import { Segmented, MainButton, NumberInput, toast, toastError } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic } from '../lib/tg.js';
import { t } from '../lib/i18n.js';
import { LANGUAGES, LANGUAGE_NAMES } from '../../tgcloud/lib/i18n/core.js';

const GOALS = [
  { id: 'cut', title: 'Lose fat', desc: 'Small deficit, keep strength', color: '#E8890C', icon: 'arrowDown' },
  { id: 'maintain', title: 'Maintain', desc: 'Recomp at maintenance', color: '#1E9BD7', icon: 'equal' },
  { id: 'bulk', title: 'Build muscle', desc: 'Lean surplus', color: '#23843F', icon: 'arrowUp' },
];
const LEVELS = [
  { id: 'light', title: 'Light', desc: '1–2 workouts / wk' },
  { id: 'moderate', title: 'Moderate', desc: '3 workouts / wk' },
  { id: 'active', title: 'Active', desc: '4–5 workouts / wk' },
];

const deviceTz = () => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimezone(tz) ? tz : 'UTC';
};

function Progress({ step, total, onBack }) {
  return (
    <div className="row-between" style={{ height: 32 }}>
      <button type="button" className="icon-btn" style={{ background: 'transparent', visibility: onBack ? 'visible' : 'hidden' }} aria-label={t('Go back')} onClick={onBack}>
        <Icon name="chevronLeft" size={22} stroke={2.4} />
      </button>
      <div style={{ display: 'flex', gap: 6 }} aria-label={t('Step {n} of {total}', { n: step + 1, total })}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} style={{ width: 22, height: 4, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'var(--track)' }} />
        ))}
      </div>
      <span className="small hint" style={{ width: 36, textAlign: 'right' }}>{step + 1}/{total}</span>
    </div>
  );
}

function Heading({ title, sub }) {
  return (
    <div className="stack-sm" style={{ padding: '0 4px', gap: 4 }}>
      <h1 className="title" style={{ fontSize: 28 }}>{title}</h1>
      {sub && <p className="hint" style={{ fontSize: 15 }}>{sub}</p>}
    </div>
  );
}

function Radio({ selected }) {
  return (
    <span style={{ width: 22, height: 22, borderRadius: 11, boxSizing: 'border-box', border: selected ? 0 : '1.5px solid var(--hint)', background: selected ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
      {selected && <Icon name="check" size={13} stroke={3.4} />}
    </span>
  );
}

// Compact language switcher for the first step; saves right away so the rest of
// the wizard is already in the chosen language.
function LanguagePicker() {
  const { user, setUser } = useUser();
  async function pick(language) {
    if (language === user.language) return;
    setUser({ ...user, language });
    try {
      const out = await call('updateSettings', { language });
      setUser(out.user);
    } catch (e) { setUser(user); toastError(e); }
  }
  return (
    <Segmented label={t('Language')} value={user.language || 'en'} onChange={pick}
      options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))} />
  );
}

// First-run setup, and "Edit profile" from Settings (`edit` = true).
export default function Onboarding({ edit = false }) {
  const { user, setUser } = useUser();
  const nav = useNav();
  const [step, setStep] = useState(edit ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(() => ({
    weightUnit: user.weightUnit || 'kg',
    energyUnit: user.energyUnit || 'kcal',
    sex: user.sex || null,
    birthDate: user.birthDate || '',
    heightCm: user.heightCm || null,
    weightKg: null,
    goal: user.goal || 'cut',
    activityLevel: user.activityLevel || 'moderate',
    goalWeightKg: user.goalWeightKg || null,
    workoutsPerWeek: user.workoutsPerWeek || 4,
  }));
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  // Editing: start from the latest weigh-in.
  useEffect(() => {
    if (!edit) return;
    call('getBody', { days: 7 }).then((b) => {
      if (b.weight.latest) setF((x) => (x.weightKg ? x : { ...x, weightKg: b.weight.latest.weightKg }));
    }, () => {});
  }, [edit]);
  const fmt = makeFmt({ weightUnit: f.weightUnit, energyUnit: f.energyUnit, language: user.language });
  const tz = edit ? user.timezone : deviceTz();
  const today = localDate(tz);

  const targets = useMemo(() => computeTargets({ ...f }, today), [f, today]);

  const steps = edit ? 3 : 4;
  const idx = edit ? step - 1 : step;
  const valid = [
    true,
    f.sex && /^\d{4}-\d{2}-\d{2}$/.test(f.birthDate) && f.heightCm >= 100 && f.heightCm <= 250 && f.weightKg >= 20 && f.weightKg <= 400,
    f.goal && f.activityLevel,
    true,
  ][step];

  async function finish() {
    // Never send an incomplete profile: go back to the step that is missing data.
    if (!f.sex || !f.birthDate || !f.heightCm || !f.weightKg) { setStep(1); toast(t('Please fill in all fields')); return; }
    setBusy(true);
    try {
      const me = await call('completeOnboarding', {
        sex: f.sex, birthDate: f.birthDate, heightCm: f.heightCm, weightKg: f.weightKg,
        activityLevel: f.activityLevel, goal: f.goal, workoutsPerWeek: f.workoutsPerWeek,
        goalWeightKg: f.goalWeightKg || null, weightUnit: f.weightUnit, energyUnit: f.energyUnit,
        ...(edit ? {} : { timezone: tz }),
      });
      haptic.success();
      invalidate(...AFFECTS.settings, ...AFFECTS.body);
      setUser(me.user);
      if (edit) { toast(t('Profile updated')); nav.pop(); }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  const next = () => { haptic.tap(); if (step === 3) finish(); else setStep(step + 1); };
  const back = step > (edit ? 1 : 0) ? () => setStep(step - 1) : null;

  return (
    <div className="screen sub" style={{ gap: 16 }}>
      <Progress step={idx} total={steps} onBack={back} />

      {step === 0 && (
        <>
          <Heading title={user.firstName ? t('Hi, {name}!', { name: user.firstName }) : t('Hi!')} sub={t('FitPro tracks your workouts, food and body in one place. A few questions to set your daily targets.')} />
          <section className="section">
            <div className="section-title">{t('Language')}</div>
            <LanguagePicker />
          </section>
          <section className="section">
            <div className="section-title">{t('Units')}</div>
            <div className="card">
              <div className="row-between"><span>{t('Weight')}</span><div style={{ width: 140 }}><Segmented label={t('Weight unit')} value={f.weightUnit} onChange={(v) => set({ weightUnit: v })} options={[{ value: 'kg', label: makeFmt({ weightUnit: 'kg', language: user.language }).weightLabel }, { value: 'lb', label: makeFmt({ weightUnit: 'lb', language: user.language }).weightLabel }]} /></div></div>
              <div className="row-between"><span>{t('Energy')}</span><div style={{ width: 140 }}><Segmented label={t('Energy unit')} value={f.energyUnit} onChange={(v) => set({ energyUnit: v })} options={[{ value: 'kcal', label: makeFmt({ energyUnit: 'kcal', language: user.language }).energyUnit }, { value: 'kj', label: makeFmt({ energyUnit: 'kj', language: user.language }).energyUnit }]} /></div></div>
            </div>
            <div className="section-footer">{t('Timezone: {tz}. You can change all of this later in Settings.', { tz })}</div>
          </section>
        </>
      )}

      {step === 1 && (
        <>
          <Heading title={t('About you')} sub={t('Used only to estimate how much you burn per day.')} />
          <div className="card">
            <div className="form-row">
              <span className="label">{t('Sex')}</span>
              <Segmented label={t('Sex')} value={f.sex} onChange={(v) => set({ sex: v })} options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]} />
            </div>
            <label className="form-row">
              <span className="label">{t('Date of birth')}</span>
              <input className="input" type="date" value={f.birthDate} max={today} onChange={(e) => set({ birthDate: e.target.value })} />
            </label>
            <div className="grid2">
              <label className="form-row">
                <span className="label">{t('Height, cm')}</span>
                <NumberInput live value={f.heightCm} decimals={0} placeholder="180" onCommit={(v) => set({ heightCm: v })} label={t('Height in centimetres')} />
              </label>
              <label className="form-row">
                <span className="label">{t('Weight now, {unit}', { unit: fmt.weightLabel })}</span>
                <NumberInput live value={fmt.wNum(f.weightKg)} decimals={1} placeholder={f.weightUnit === 'lb' ? '180' : '82.4'} onCommit={(v) => set({ weightKg: fmt.toKg(v) })} label={t('Weight in {unit}', { unit: fmt.weightLabel })} />
              </label>
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <Heading title={t('What’s your goal?')} sub={t('We’ll set your daily targets from this.')} />
          <div className="list" role="radiogroup" aria-label={t('Goal')}>
            {GOALS.map((g) => (
              <button key={g.id} type="button" role="radio" aria-checked={f.goal === g.id} className="row with-icon" style={{ minHeight: 62 }} onClick={() => { haptic.select(); set({ goal: g.id }); }}>
                <span className="icon-sq lg" style={{ background: g.color }}><Icon name={g.icon} size={19} stroke={2.2} color="#fff" /></span>
                <span className="grow"><span className="row-title bold">{t(g.title)}</span><span className="sub">{t(g.desc)}</span></span>
                <Radio selected={f.goal === g.id} />
              </button>
            ))}
          </div>
          <section className="section">
            <div className="section-title">{t('Activity')}</div>
            <div className="grid3" role="radiogroup" aria-label={t('Activity')}>
              {LEVELS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={f.activityLevel === l.id} onClick={() => { haptic.select(); set({ activityLevel: l.id }); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 12px', border: `2px solid ${f.activityLevel === l.id ? 'var(--accent)' : 'transparent'}`, borderRadius: 12, background: 'var(--card)', textAlign: 'left' }}>
                  <span className="bold" style={{ color: f.activityLevel === l.id ? 'var(--link)' : 'inherit' }}>{t(l.title)}</span>
                  <span className="tiny hint">{t(l.desc)}</span>
                </button>
              ))}
            </div>
          </section>
          {targets && (
            <div className="card">
              <div className="row-between" style={{ alignItems: 'baseline' }}>
                <span className="eyebrow">{t('Daily target')}</span>
                <span className="big-num">{fmt.e(targets.kcalTarget, { suffix: false })}<span className="unit"> {fmt.energyUnit}</span></span>
              </div>
              <div className="grid3">
                <div style={{ padding: 10, borderRadius: 10, background: 'color-mix(in srgb, var(--protein) 12%, transparent)' }}><div className="tiny hint">{t('Protein')}</div><div className="bold" style={{ fontSize: 17 }}>{targets.proteinTargetG} {t('g')}</div></div>
                <div style={{ padding: 10, borderRadius: 10, background: 'color-mix(in srgb, var(--carbs) 14%, transparent)' }}><div className="tiny hint">{t('Carbs')}</div><div className="bold" style={{ fontSize: 17 }}>{targets.carbsTargetG} {t('g')}</div></div>
                <div style={{ padding: 10, borderRadius: 10, background: 'color-mix(in srgb, var(--fat) 12%, transparent)' }}><div className="tiny hint">{t('Fat')}</div><div className="bold" style={{ fontSize: 17 }}>{targets.fatTargetG} {t('g')}</div></div>
              </div>
              <p className="small hint">{t('Mifflin-St Jeor estimate. You can set your own numbers in Settings.')}</p>
            </div>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <Heading title={t('Your plan')} sub={t('Optional — helps the app show your pace and weekly progress.')} />
          <div className="card">
            <label className="form-row">
              <span className="label">{t('Goal weight, {unit}', { unit: fmt.weightLabel })}</span>
              <NumberInput live value={fmt.wNum(f.goalWeightKg)} decimals={1} placeholder={t('Optional')} onCommit={(v) => set({ goalWeightKg: fmt.toKg(v) })} label={t('Goal weight')} />
            </label>
            <div className="form-row">
              <span className="label">{t('Workouts per week')}</span>
              <div className="segmented" role="radiogroup" aria-label={t('Workouts per week')}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <button key={n} type="button" role="radio" aria-selected={f.workoutsPerWeek === n} aria-checked={f.workoutsPerWeek === n} onClick={() => { haptic.select(); set({ workoutsPerWeek: n }); }}>{n}</button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <MainButton text={step === 3 ? (edit ? t('Save') : t('Start using FitPro')) : t('Continue')} disabled={!valid} busy={busy} onClick={next} />
    </div>
  );
}
