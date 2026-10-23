import { useState } from 'react';
import { useApi, mutate, call, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { longDay, signed, MUSCLE_LABEL } from '../lib/format.js';
import { Loader, Bar, toastError } from '../ui/kit.jsx';
import { Ring, Sparkline } from '../ui/charts.jsx';
import { Icon, IconSquare } from '../ui/icons.jsx';
import { haptic } from '../lib/tg.js';
import { t, lang } from '../lib/i18n.js';

const pct = (a, b) => (b ? (a / b) * 100 : 0);

function Macro({ label, value, target, color }) {
  return (
    <div className="stack-sm">
      <span className="tiny hint">{label}</span>
      <Bar pct={pct(value, target)} color={color} />
      <span className="small bold">{Math.round(value)}<span className="hint" style={{ fontWeight: 400 }}>{target ? ` / ${target} ${t('g')}` : ` ${t('g')}`}</span></span>
    </div>
  );
}

export default function Home() {
  const { fmt } = useUser();
  const nav = useNav();
  const q = useApi('getToday');
  const [starting, setStarting] = useState(false);

  async function startWorkout(d) {
    haptic.tap();
    if (d.activeWorkout) return nav.push('Workout', { id: d.activeWorkout.id });
    if (!d.plan) return nav.setTab('train');
    setStarting(true);
    try {
      const w = await mutate('startWorkout', { routineId: d.plan.routineId }, AFFECTS.workout);
      nav.push('Workout', { id: w.workout.id });
    } catch (e) {
      toastError(e);
    } finally {
      setStarting(false);
    }
  }

  async function addWater(d) {
    haptic.tap();
    try {
      const water = await call('logWater', { amountMl: 250 });
      q.setData({ ...d, water });
    } catch (e) { toastError(e); }
  }

  return (
    <div className="screen">
      <Loader q={q}>
        {(d) => {
          const cups = Math.round((d.water.totalMl / (d.water.targetMl || 3000)) * 12);
          const kcalTarget = d.targets.kcal;
          return (
            <>
              <div className="title-row">
                <div className="stack-sm" style={{ gap: 2 }}>
                  <span className="eyebrow">{longDay(d.date)}</span>
                  <h1 className="large-title">{t('Today')}</h1>
                </div>
                {d.streakDays > 0 && (
                  <span className="pill" style={{ color: 'var(--warm)' }} aria-label={t('{n}-day logging streak', { n: d.streakDays })}>
                    <Icon name="flame" size={16} color="var(--carbs)" />{t.n(d.streakDays, '{n} day', '{n} days')}
                  </span>
                )}
              </div>

              <button type="button" className="card clickable" onClick={() => nav.setTab('food')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <Ring pct={kcalTarget ? d.eaten.kcal / kcalTarget : 0} label={t('{eaten} eaten of {target}', { eaten: fmt.e(d.eaten.kcal), target: fmt.e(kcalTarget) })}
                    color={d.remainingKcal < 0 ? 'var(--carbs)' : 'var(--accent)'}>
                    <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4 }}>{fmt.e(Math.abs(d.remainingKcal ?? 0), { suffix: false })}</span>
                    <span className="tiny hint">{d.remainingKcal < 0 ? t('{unit} over', { unit: fmt.energyUnit }) : t('{unit} left', { unit: fmt.energyUnit })}</span>
                  </Ring>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 15 }}>
                    <div className="row-between"><span className="hint">{t('Eaten')}</span><span className="bold">{fmt.e(d.eaten.kcal, { suffix: false })}</span></div>
                    <div style={{ height: 0.5, background: 'var(--sep)' }} />
                    <div className="row-between"><span className="hint">{t('Goal')}</span><span className="bold">{fmt.e(kcalTarget, { suffix: false })}</span></div>
                    <div style={{ height: 0.5, background: 'var(--sep)' }} />
                    <div className="row-between"><span className="hint">{t('Burned')}</span><span className="bold">{fmt.e(d.burnedKcal, { suffix: false })}</span></div>
                  </div>
                </div>
                <div className="grid3" style={{ gap: 12 }}>
                  <Macro label={t('Protein')} value={d.eaten.proteinG} target={d.targets.proteinG} color="var(--protein)" />
                  <Macro label={t('Carbs')} value={d.eaten.carbsG} target={d.targets.carbsG} color="var(--carbs)" />
                  <Macro label={t('Fat')} value={d.eaten.fatG} target={d.targets.fatG} color="var(--fat)" />
                </div>
              </button>

              <div className="card">
                <div className="row-between">
                  <span className="eyebrow">{d.activeWorkout ? t('In progress') : t('Today’s plan')}</span>
                  <button type="button" className="btn ghost" onClick={() => nav.setTab('train')}>{d.plan ? t('Change') : t('Routines')}</button>
                </div>
                {d.activeWorkout ? (
                  <div className="stack-sm" style={{ gap: 4 }}>
                    <span style={{ fontSize: 21, fontWeight: 700 }}>{d.activeWorkout.name}</span>
                    <span className="hint">{t('Started {time}', { time: new Date(d.activeWorkout.startedAt).toLocaleTimeString(lang() === 'en' ? [] : lang(), { hour: '2-digit', minute: '2-digit' }) })}</span>
                  </div>
                ) : d.plan ? (
                  <>
                    <div className="stack-sm" style={{ gap: 4 }}>
                      <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.3 }}>{d.plan.name}{d.plan.done && <span className="badge green" style={{ marginLeft: 8, verticalAlign: 3 }}>{t('Done')}</span>}</span>
                      <span className="hint">{d.plan.muscles.map((m) => t(MUSCLE_LABEL[m])).join(' · ') || t('No exercises yet')}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 14 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="dumbbell" size={16} color="var(--hint)" />{t.n(d.plan.exerciseCount, '{n} exercise', '{n} exercises')}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="clock" size={16} color="var(--hint)" />~{d.plan.estMinutes} {t('min')}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="bars" size={16} color="var(--hint)" />{t.n(d.plan.setCount, '{n} set', '{n} sets')}</span>
                    </div>
                  </>
                ) : (
                  <p className="hint">{d.workoutsToday.length ? t('Done today: {names}', { names: d.workoutsToday.map((w) => w.name).join(', ') }) : t('Rest day — or start any routine.')}</p>
                )}
                <button type="button" className="btn lg block" disabled={starting} onClick={() => startWorkout(d)}>
                  {d.activeWorkout ? t('Continue workout') : d.plan ? (d.plan.done ? t('Train again') : t('Start workout')) : t('Choose a workout')}
                </button>
              </div>

              <div className="grid2">
                <button type="button" className="card clickable tight" onClick={() => nav.setTab('body')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconSquare name="scale" color="var(--fat)" /><span className="hint">{t('Weight')}</span></div>
                  <div className="mid-num">{d.weight.latest ? fmt.wNum(d.weight.latest.weightKg) : '—'}<span className="unit"> {fmt.weightLabel}</span></div>
                  <Sparkline values={d.weight.sparkline.map((p) => p.weightKg)} />
                  <span className="small bold" style={{ color: d.weight.weekChangeKg < 0 ? 'var(--good)' : 'var(--hint)' }}>
                    {d.weight.weekChangeKg !== null ? t('{change} {unit} this week', { change: signed(fmt.wNum(d.weight.weekChangeKg)), unit: fmt.weightLabel }) : t('Log daily for a trend')}
                  </span>
                </button>
                <div className="card tight">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconSquare name="droplet" color="var(--water)" /><span className="hint">{t('Water')}</span></div>
                  <div className="mid-num">{fmt.n(d.water.totalMl / 1000, 1)}<span className="unit"> / {fmt.n(d.water.targetMl / 1000, 1)} {t('L')}</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 3, height: 24, alignItems: 'center' }} aria-hidden="true">
                    {Array.from({ length: 12 }, (_, i) => <div key={i} style={{ height: 14, borderRadius: 3, background: i < cups ? 'var(--water)' : 'var(--track)' }} />)}
                  </div>
                  <button type="button" className="btn soft sm" style={{ borderRadius: 8, height: 30 }} onClick={() => addWater(d)}>+ 250 {t('ml')}</button>
                </div>
              </div>

              <button type="button" className="card clickable" onClick={() => nav.push('History')}>
                <div className="row-between">
                  <span className="eyebrow">{t('This week')}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--link)', fontSize: 15 }}>{t('History')}<Icon name="chevronRight" size={16} stroke={2.2} /></span>
                </div>
                <div className="grid3">
                  <div><div style={{ fontSize: 19, fontWeight: 700 }}>{d.week.workouts}<span className="hint" style={{ fontSize: 14, fontWeight: 500 }}> / {d.week.target}</span></div><div className="tiny hint">{t('Workouts')}</div></div>
                  <div><div style={{ fontSize: 19, fontWeight: 700 }}>{fmt.wNum(d.week.volumeKg) >= 10000 ? `${fmt.n(fmt.wNum(d.week.volumeKg) / 1000, 1)}${t('k@thousand')}` : fmt.n(fmt.wNum(d.week.volumeKg))}<span className="hint" style={{ fontSize: 14, fontWeight: 500 }}> {fmt.weightLabel}</span></div><div className="tiny hint">{t('Volume')}</div></div>
                  <div><div style={{ fontSize: 19, fontWeight: 700 }}>{d.week.avgKcal ? fmt.e(d.week.avgKcal, { suffix: false }) : '—'}</div><div className="tiny hint">{t('Avg {unit}', { unit: fmt.energyUnit })}</div></div>
                </div>
              </button>

              <button type="button" className="card clickable" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} onClick={() => nav.push('Friends')}>
                <IconSquare name="users" color="#1E73BE" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="bold" style={{ display: 'block' }}>{t('Friends')}</span>
                  <span className="small hint">{t('Train together — compare your week with friends')}</span>
                </span>
                <Icon name="chevronRight" size={16} stroke={2.2} style={{ color: 'var(--hint)' }} />
              </button>
            </>
          );
        }}
      </Loader>
    </div>
  );
}
