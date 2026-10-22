import { useState } from 'react';
import { useApi, mutate, call, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { longDay, signed, MUSCLE_LABEL } from '../lib/format.js';
import { Loader, Bar, toastError } from '../ui/kit.jsx';
import { Ring, Sparkline } from '../ui/charts.jsx';
import { Icon, IconSquare } from '../ui/icons.jsx';
import { haptic } from '../lib/tg.js';

const pct = (a, b) => (b ? (a / b) * 100 : 0);

function Macro({ label, value, target, color }) {
  return (
    <div className="stack-sm">
      <span className="tiny hint">{label}</span>
      <Bar pct={pct(value, target)} color={color} />
      <span className="small bold">{Math.round(value)}<span className="hint" style={{ fontWeight: 400 }}>{target ? ` / ${target} g` : ' g'}</span></span>
    </div>
  );
}

export default function Home() {
  const { fmt } = useUser();
  const nav = useNav();
  const q = useApi('getToday');
  const [starting, setStarting] = useState(false);

  async function startWorkout(t) {
    haptic.tap();
    if (t.activeWorkout) return nav.push('Workout', { id: t.activeWorkout.id });
    if (!t.plan) return nav.setTab('train');
    setStarting(true);
    try {
      const w = await mutate('startWorkout', { routineId: t.plan.routineId }, AFFECTS.workout);
      nav.push('Workout', { id: w.workout.id });
    } catch (e) {
      toastError(e);
    } finally {
      setStarting(false);
    }
  }

  async function addWater(t) {
    haptic.tap();
    try {
      const water = await call('logWater', { amountMl: 250 });
      q.setData({ ...t, water });
    } catch (e) { toastError(e); }
  }

  return (
    <div className="screen">
      <Loader q={q}>
        {(t) => {
          const cups = Math.round((t.water.totalMl / (t.water.targetMl || 3000)) * 12);
          const kcalTarget = t.targets.kcal;
          return (
            <>
              <div className="title-row">
                <div className="stack-sm" style={{ gap: 2 }}>
                  <span className="eyebrow">{longDay(t.date)}</span>
                  <h1 className="large-title">Today</h1>
                </div>
                {t.streakDays > 0 && (
                  <span className="pill" style={{ color: 'var(--warm)' }} aria-label={`${t.streakDays} day logging streak`}>
                    <Icon name="flame" size={16} color="var(--carbs)" />{t.streakDays} {t.streakDays === 1 ? 'day' : 'days'}
                  </span>
                )}
              </div>

              <button type="button" className="card clickable" onClick={() => nav.setTab('food')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <Ring pct={kcalTarget ? t.eaten.kcal / kcalTarget : 0} label={`${fmt.e(t.eaten.kcal)} eaten of ${fmt.e(kcalTarget)}`}
                    color={t.remainingKcal < 0 ? 'var(--carbs)' : 'var(--accent)'}>
                    <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4 }}>{fmt.e(Math.abs(t.remainingKcal ?? 0), { suffix: false })}</span>
                    <span className="tiny hint">{t.remainingKcal < 0 ? `${fmt.energyUnit} over` : `${fmt.energyUnit} left`}</span>
                  </Ring>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 15 }}>
                    <div className="row-between"><span className="hint">Eaten</span><span className="bold">{fmt.e(t.eaten.kcal, { suffix: false })}</span></div>
                    <div style={{ height: 0.5, background: 'var(--sep)' }} />
                    <div className="row-between"><span className="hint">Goal</span><span className="bold">{fmt.e(kcalTarget, { suffix: false })}</span></div>
                    <div style={{ height: 0.5, background: 'var(--sep)' }} />
                    <div className="row-between"><span className="hint">Burned</span><span className="bold">{fmt.e(t.burnedKcal, { suffix: false })}</span></div>
                  </div>
                </div>
                <div className="grid3" style={{ gap: 12 }}>
                  <Macro label="Protein" value={t.eaten.proteinG} target={t.targets.proteinG} color="var(--protein)" />
                  <Macro label="Carbs" value={t.eaten.carbsG} target={t.targets.carbsG} color="var(--carbs)" />
                  <Macro label="Fat" value={t.eaten.fatG} target={t.targets.fatG} color="var(--fat)" />
                </div>
              </button>

              <div className="card">
                <div className="row-between">
                  <span className="eyebrow">{t.activeWorkout ? 'In progress' : "Today's plan"}</span>
                  <button type="button" className="btn ghost" onClick={() => nav.setTab('train')}>{t.plan ? 'Change' : 'Routines'}</button>
                </div>
                {t.activeWorkout ? (
                  <div className="stack-sm" style={{ gap: 4 }}>
                    <span style={{ fontSize: 21, fontWeight: 700 }}>{t.activeWorkout.name}</span>
                    <span className="hint">Started {new Date(t.activeWorkout.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ) : t.plan ? (
                  <>
                    <div className="stack-sm" style={{ gap: 4 }}>
                      <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.3 }}>{t.plan.name}{t.plan.done && <span className="badge green" style={{ marginLeft: 8, verticalAlign: 3 }}>Done</span>}</span>
                      <span className="hint">{t.plan.muscles.map((m) => MUSCLE_LABEL[m]).join(' · ') || 'No exercises yet'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 14 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="dumbbell" size={16} color="var(--hint)" />{t.plan.exerciseCount} exercises</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="clock" size={16} color="var(--hint)" />~{t.plan.estMinutes} min</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="bars" size={16} color="var(--hint)" />{t.plan.setCount} sets</span>
                    </div>
                  </>
                ) : (
                  <p className="hint">{t.workoutsToday.length ? `Done today: ${t.workoutsToday.map((w) => w.name).join(', ')}` : 'Rest day — or start any routine.'}</p>
                )}
                <button type="button" className="btn lg block" disabled={starting} onClick={() => startWorkout(t)}>
                  {t.activeWorkout ? 'Continue workout' : t.plan ? (t.plan.done ? 'Train again' : 'Start workout') : 'Choose a workout'}
                </button>
              </div>

              <div className="grid2">
                <button type="button" className="card clickable tight" onClick={() => nav.setTab('body')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconSquare name="scale" color="var(--fat)" /><span className="hint">Weight</span></div>
                  <div className="mid-num">{t.weight.latest ? fmt.wNum(t.weight.latest.weightKg) : '—'}<span className="unit"> {fmt.weightUnit}</span></div>
                  <Sparkline values={t.weight.sparkline.map((p) => p.weightKg)} />
                  <span className="small bold" style={{ color: t.weight.weekChangeKg < 0 ? 'var(--good)' : 'var(--hint)' }}>
                    {t.weight.weekChangeKg !== null ? `${signed(fmt.wNum(t.weight.weekChangeKg))} ${fmt.weightUnit} this week` : 'Log daily for a trend'}
                  </span>
                </button>
                <div className="card tight">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconSquare name="droplet" color="var(--water)" /><span className="hint">Water</span></div>
                  <div className="mid-num">{(t.water.totalMl / 1000).toFixed(1)}<span className="unit"> / {(t.water.targetMl / 1000).toFixed(1)} L</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 3, height: 24, alignItems: 'center' }} aria-hidden="true">
                    {Array.from({ length: 12 }, (_, i) => <div key={i} style={{ height: 14, borderRadius: 3, background: i < cups ? 'var(--water)' : 'var(--track)' }} />)}
                  </div>
                  <button type="button" className="btn soft sm" style={{ borderRadius: 8, height: 30 }} onClick={() => addWater(t)}>+ 250 ml</button>
                </div>
              </div>

              <button type="button" className="card clickable" onClick={() => nav.push('History')}>
                <div className="row-between">
                  <span className="eyebrow">This week</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--link)', fontSize: 15 }}>History<Icon name="chevronRight" size={16} stroke={2.2} /></span>
                </div>
                <div className="grid3">
                  <div><div style={{ fontSize: 19, fontWeight: 700 }}>{t.week.workouts}<span className="hint" style={{ fontSize: 14, fontWeight: 500 }}> / {t.week.target}</span></div><div className="tiny hint">Workouts</div></div>
                  <div><div style={{ fontSize: 19, fontWeight: 700 }}>{fmt.wNum(t.week.volumeKg) >= 10000 ? `${(fmt.wNum(t.week.volumeKg) / 1000).toFixed(1)}k` : fmt.n(fmt.wNum(t.week.volumeKg))}<span className="hint" style={{ fontSize: 14, fontWeight: 500 }}> {fmt.weightUnit}</span></div><div className="tiny hint">Volume</div></div>
                  <div><div style={{ fontSize: 19, fontWeight: 700 }}>{t.week.avgKcal ? fmt.e(t.week.avgKcal, { suffix: false }) : '—'}</div><div className="tiny hint">Avg {fmt.energyUnit}</div></div>
                </div>
              </button>
            </>
          );
        }}
      </Loader>
    </div>
  );
}
