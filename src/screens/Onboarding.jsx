import { useEffect, useMemo, useState } from 'react';
import { call, invalidate, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { makeFmt } from '../lib/format.js';
import { computeTargets } from '../../tgcloud/lib/nutrition.js';
import { localDate, isValidTimezone } from '../../tgcloud/lib/dates.js';
import { Segmented, MainButton, NumberInput, toast, toastError } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic } from '../lib/tg.js';

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
      <button type="button" className="icon-btn" style={{ background: 'transparent', visibility: onBack ? 'visible' : 'hidden' }} aria-label="Back" onClick={onBack}>
        <Icon name="chevronLeft" size={22} stroke={2.4} />
      </button>
      <div style={{ display: 'flex', gap: 6 }} aria-label={`Step ${step + 1} of ${total}`}>
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
  const fmt = makeFmt({ weightUnit: f.weightUnit, energyUnit: f.energyUnit });
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
    if (!f.sex || !f.birthDate || !f.heightCm || !f.weightKg) { setStep(1); toast('Please fill in all fields'); return; }
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
      if (edit) { toast('Profile updated'); nav.pop(); }
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
          <Heading title={`Hi${user.firstName ? `, ${user.firstName}` : ''}!`} sub="FitPro tracks your workouts, food and body in one place. A few questions to set your daily targets." />
          <section className="section">
            <div className="section-title">Units</div>
            <div className="card">
              <div className="row-between"><span>Weight</span><div style={{ width: 140 }}><Segmented label="Weight unit" value={f.weightUnit} onChange={(v) => set({ weightUnit: v })} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} /></div></div>
              <div className="row-between"><span>Energy</span><div style={{ width: 140 }}><Segmented label="Energy unit" value={f.energyUnit} onChange={(v) => set({ energyUnit: v })} options={[{ value: 'kcal', label: 'kcal' }, { value: 'kj', label: 'kJ' }]} /></div></div>
            </div>
            <div className="section-footer">Timezone: {tz}. You can change all of this later in Settings.</div>
          </section>
        </>
      )}

      {step === 1 && (
        <>
          <Heading title="About you" sub="Used only to estimate how much you burn per day." />
          <div className="card">
            <div className="form-row">
              <span className="label">Sex</span>
              <Segmented label="Sex" value={f.sex} onChange={(v) => set({ sex: v })} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
            </div>
            <label className="form-row">
              <span className="label">Date of birth</span>
              <input className="input" type="date" value={f.birthDate} max={today} onChange={(e) => set({ birthDate: e.target.value })} />
            </label>
            <div className="grid2">
              <label className="form-row">
                <span className="label">Height, cm</span>
                <NumberInput live value={f.heightCm} decimals={0} placeholder="180" onCommit={(v) => set({ heightCm: v })} label="Height in centimetres" />
              </label>
              <label className="form-row">
                <span className="label">Weight now, {fmt.weightUnit}</span>
                <NumberInput live value={fmt.wNum(f.weightKg)} decimals={1} placeholder={f.weightUnit === 'lb' ? '180' : '82.4'} onCommit={(v) => set({ weightKg: fmt.toKg(v) })} label={`Weight in ${fmt.weightUnit}`} />
              </label>
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <Heading title="What's your goal?" sub="We'll set your daily targets from this." />
          <div className="list" role="radiogroup" aria-label="Goal">
            {GOALS.map((g) => (
              <button key={g.id} type="button" role="radio" aria-checked={f.goal === g.id} className="row with-icon" style={{ minHeight: 62 }} onClick={() => { haptic.select(); set({ goal: g.id }); }}>
                <span className="icon-sq lg" style={{ background: g.color }}><Icon name={g.icon} size={19} stroke={2.2} color="#fff" /></span>
                <span className="grow"><span className="row-title bold">{g.title}</span><span className="sub">{g.desc}</span></span>
                <Radio selected={f.goal === g.id} />
              </button>
            ))}
          </div>
          <section className="section">
            <div className="section-title">Activity</div>
            <div className="grid3" role="radiogroup" aria-label="Activity">
              {LEVELS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={f.activityLevel === l.id} onClick={() => { haptic.select(); set({ activityLevel: l.id }); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 12px', border: `2px solid ${f.activityLevel === l.id ? 'var(--accent)' : 'transparent'}`, borderRadius: 12, background: 'var(--card)', textAlign: 'left' }}>
                  <span className="bold" style={{ color: f.activityLevel === l.id ? 'var(--link)' : 'inherit' }}>{l.title}</span>
                  <span className="tiny hint">{l.desc}</span>
                </button>
              ))}
            </div>
          </section>
          {targets && (
            <div className="card">
              <div className="row-between" style={{ alignItems: 'baseline' }}>
                <span className="eyebrow">Daily target</span>
                <span className="big-num">{fmt.e(targets.kcalTarget, { suffix: false })}<span className="unit"> {fmt.energyUnit}</span></span>
              </div>
              <div className="grid3">
                <div style={{ padding: 10, borderRadius: 10, background: 'color-mix(in srgb, var(--protein) 12%, transparent)' }}><div className="tiny hint">Protein</div><div className="bold" style={{ fontSize: 17 }}>{targets.proteinTargetG} g</div></div>
                <div style={{ padding: 10, borderRadius: 10, background: 'color-mix(in srgb, var(--carbs) 14%, transparent)' }}><div className="tiny hint">Carbs</div><div className="bold" style={{ fontSize: 17 }}>{targets.carbsTargetG} g</div></div>
                <div style={{ padding: 10, borderRadius: 10, background: 'color-mix(in srgb, var(--fat) 12%, transparent)' }}><div className="tiny hint">Fat</div><div className="bold" style={{ fontSize: 17 }}>{targets.fatTargetG} g</div></div>
              </div>
              <p className="small hint">Mifflin-St Jeor estimate. You can set your own numbers in Settings.</p>
            </div>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <Heading title="Your plan" sub="Optional — helps the app show your pace and weekly progress." />
          <div className="card">
            <label className="form-row">
              <span className="label">Goal weight, {fmt.weightUnit}</span>
              <NumberInput live value={fmt.wNum(f.goalWeightKg)} decimals={1} placeholder="Optional" onCommit={(v) => set({ goalWeightKg: fmt.toKg(v) })} label="Goal weight" />
            </label>
            <div className="form-row">
              <span className="label">Workouts per week</span>
              <div className="segmented" role="radiogroup" aria-label="Workouts per week">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <button key={n} type="button" role="radio" aria-selected={f.workoutsPerWeek === n} aria-checked={f.workoutsPerWeek === n} onClick={() => { haptic.select(); set({ workoutsPerWeek: n }); }}>{n}</button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <MainButton text={step === 3 ? (edit ? 'Save' : 'Start using FitPro') : 'Continue'} disabled={!valid} busy={busy} onClick={next} />
    </div>
  );
}
