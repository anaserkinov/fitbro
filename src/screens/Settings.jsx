import { useEffect, useState } from 'react';
import { useApi, call, invalidate, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { Loader, Section, List, Row, Sheet, Switch, Segmented, NumberInput, toast, toastError } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic, confirmDialog } from '../lib/tg.js';

const GOAL_LABEL = { cut: 'Losing fat', maintain: 'Maintaining', bulk: 'Building muscle' };
const REMINDERS = {
  meal: { label: 'Log meals', icon: 'food', color: '#E8890C' },
  weigh_in: { label: 'Morning weigh-in', icon: 'scale', color: '#8E5BD8' },
  workout_day: { label: 'Workout day', icon: 'dumbbell', color: '#1E73BE' },
  missed_muscle: { label: 'Missed muscle group', icon: 'bell', color: '#D12F2F' },
  weekly_summary: { label: 'Weekly summary', icon: 'bars', color: '#23843F' },
};
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const REST = [30, 45, 60, 90, 120, 150, 180, 240, 300];
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function age(birthDate, today) {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

const timezones = () => {
  try { return Intl.supportedValuesOf('timeZone'); } catch { return null; }
};

function TargetsSheet({ open, onClose, user, save }) {
  const [t, setT] = useState({});
  useEffect(() => { if (open) setT({ kcalTarget: user.kcalTarget, proteinTargetG: user.proteinTargetG, carbsTargetG: user.carbsTargetG, fatTargetG: user.fatTargetG }); }, [open]);
  const macroKcal = (t.proteinTargetG || 0) * 4 + (t.carbsTargetG || 0) * 4 + (t.fatTargetG || 0) * 9;
  return (
    <Sheet open={open} onClose={onClose} title="Calories & macros">
      <div className="grid2">
        <label className="form-row" style={{ gridColumn: '1 / -1' }}><span className="label">Calories, kcal</span><NumberInput value={t.kcalTarget} decimals={0} onCommit={(v) => setT({ ...t, kcalTarget: v })} label="Calories" /></label>
        <label className="form-row"><span className="label">Protein, g</span><NumberInput value={t.proteinTargetG} decimals={0} onCommit={(v) => setT({ ...t, proteinTargetG: v })} label="Protein" /></label>
        <label className="form-row"><span className="label">Carbs, g</span><NumberInput value={t.carbsTargetG} decimals={0} onCommit={(v) => setT({ ...t, carbsTargetG: v })} label="Carbs" /></label>
        <label className="form-row"><span className="label">Fat, g</span><NumberInput value={t.fatTargetG} decimals={0} onCommit={(v) => setT({ ...t, fatTargetG: v })} label="Fat" /></label>
      </div>
      <p className="small hint">Macros add up to {macroKcal} kcal{t.kcalTarget && Math.abs(macroKcal - t.kcalTarget) > 50 ? ` — ${macroKcal > t.kcalTarget ? 'above' : 'below'} your calorie target` : ''}.</p>
      <button type="button" className="btn lg block" onClick={() => save(t).then(onClose)}>Save my numbers</button>
      {user.targetsManual && <button type="button" className="btn ghost" onClick={() => save({ targetsManual: false }).then(onClose)}>Use the automatic calculation again</button>}
    </Sheet>
  );
}

function ReminderSheet({ reminder, onClose, onSaved }) {
  const [r, setR] = useState(null);
  useEffect(() => { setR(reminder ? { times: reminder.times || [], weekdays: reminder.weekdays, days: reminder.params?.days || 7 } : null); }, [reminder]);
  if (!reminder || !r) return null;
  const meta = REMINDERS[reminder.type];
  async function save() {
    try {
      const out = await call('updateReminder', {
        type: reminder.type, enabled: true, times: [...new Set(r.times.filter(Boolean))].sort(),
        ...(reminder.type === 'weekly_summary' ? { weekdays: r.weekdays?.length ? r.weekdays : [7] } : {}),
        ...(reminder.type === 'missed_muscle' ? { params: { days: r.days } } : {}),
      });
      haptic.success();
      onSaved(out.reminder);
      onClose();
    } catch (e) { toastError(e); }
  }
  return (
    <Sheet open onClose={onClose} title={meta.label}>
      <div className="stack-sm">
        <span className="label">Time{r.times.length > 1 ? 's' : ''}</span>
        {r.times.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 8 }}>
            <input className="input" type="time" value={t} onChange={(e) => setR({ ...r, times: r.times.map((x, j) => (j === i ? e.target.value : x)) })} />
            {r.times.length > 1 && <button type="button" className="icon-btn" style={{ background: 'var(--field)', color: 'var(--destructive)', width: 44, height: 44, borderRadius: 10 }} aria-label="Remove time" onClick={() => setR({ ...r, times: r.times.filter((_, j) => j !== i) })}><Icon name="trash" size={18} /></button>}
          </div>
        ))}
        {reminder.type === 'meal' && r.times.length < 6 && <button type="button" className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setR({ ...r, times: [...r.times, '19:00'] })}><Icon name="plus" size={16} stroke={2.4} />Add time</button>}
      </div>
      {reminder.type === 'weekly_summary' && (
        <div className="stack-sm"><span className="label">Day</span>
          <Segmented label="Day" value={(r.weekdays || [7])[0]} onChange={(d) => setR({ ...r, weekdays: [d] })} options={WEEKDAYS.map((w, i) => ({ value: i + 1, label: w[0] }))} /></div>
      )}
      {reminder.type === 'missed_muscle' && (
        <label className="form-row"><span className="label">Remind when a muscle group wasn't trained for (days)</span>
          <NumberInput value={r.days} decimals={0} min={2} max={30} onCommit={(v) => setR({ ...r, days: v || 7 })} label="Days" /></label>
      )}
      <button type="button" className="btn lg block" onClick={save}>Save</button>
    </Sheet>
  );
}

export default function Settings() {
  const { user, setUser, today, fmt } = useUser();
  const nav = useNav();
  const q = useApi('getSettings');
  const [sheet, setSheet] = useState(null);
  const [editReminder, setEditReminder] = useState(null);
  const tzList = timezones();
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function save(patch) {
    try {
      const r = await call('updateSettings', patch);
      setUser(r.user);
      q.setData(r);
      invalidate(...AFFECTS.settings);
      haptic.success();
      return r;
    } catch (e) { toastError(e); throw e; }
  }
  const saveQuiet = (patch) => save(patch).catch(() => {});

  async function toggleReminder(r, enabled) {
    q.setData((d) => ({ ...d, reminders: d.reminders.map((x) => (x.id === r.id ? { ...x, enabled } : x)) }));
    try { await call('updateReminder', { type: r.type, enabled }); } catch (e) { toastError(e); q.reload(); }
  }

  async function deleteAll() {
    if (!(await confirmDialog('Delete ALL your data — workouts, food, weight, photos, settings? This cannot be undone.'))) return;
    if (!(await confirmDialog('Are you sure? Everything will be permanently deleted.'))) return;
    try {
      await call('deleteMyData', { confirm: 'DELETE' });
      toast('All data deleted');
      setTimeout(() => window.location.reload(), 800);
    } catch (e) { toastError(e); }
  }

  const close = () => setSheet(null);
  return (
    <div className="screen sub">
      <h1 className="title" style={{ padding: '0 4px' }}>Settings</h1>
      <Loader q={q}>
        {(s) => (
          <>
            <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <span style={{ width: 48, height: 48, borderRadius: 24, background: 'var(--accent)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600 }}>
                {(user.firstName || '?')[0].toUpperCase()}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="bold" style={{ fontSize: 18, display: 'block' }}>{user.firstName || 'You'}</span>
                <span className="small hint">{[GOAL_LABEL[user.goal], age(user.birthDate, today) && `${age(user.birthDate, today)} y`, user.heightCm && `${Math.round(user.heightCm)} cm`].filter(Boolean).join(' · ')}</span>
              </span>
              <button type="button" className="btn ghost" onClick={() => nav.push('ProfileEdit', { edit: true })}>Edit</button>
            </div>

            <Section title="Goals" footer={user.targetsManual ? 'Using your own numbers.' : 'Calculated from your profile and latest weight.'}>
              <List>
                <Row icon="flame" iconColor="#E8890C" title="Calories & macros" value={fmt.e(user.kcalTarget)} chevron onClick={() => setSheet('targets')} />
                <Row icon="target" iconColor="#8E5BD8" title="Goal weight" value={user.goalWeightKg ? fmt.w(user.goalWeightKg) : 'Not set'} chevron onClick={() => setSheet('goalWeight')} />
                <Row icon="dumbbell" iconColor="#1E73BE" title="Workouts per week" value={user.workoutsPerWeek} chevron onClick={() => setSheet('perWeek')} />
                <Row icon="droplet" iconColor="#1E9BD7" title="Water per day" value={`${(user.waterTargetMl / 1000).toFixed(1)} L`} chevron onClick={() => setSheet('water')} />
              </List>
            </Section>

            <Section title="Preferences">
              <List>
                <Row icon="ruler" iconColor="#6D6D72" title="Units" value={`${fmt.weightUnit} · ${fmt.energyUnit}`} chevron onClick={() => setSheet('units')} />
                <Row icon="clock" iconColor="#23843F" title="Default rest" value={mmss(user.defaultRestSec)} chevron onClick={() => setSheet('rest')} />
                <Row icon="calendar" iconColor="#E8890C" title="Week starts on" value={user.weekStartsOn === 7 ? 'Sunday' : 'Monday'} chevron onClick={() => setSheet('week')} />
                <Row icon="globe" iconColor="#1E9BD7" title="Timezone" value={user.timezone} chevron onClick={() => setSheet('tz')} />
              </List>
            </Section>

            <Section title="Reminders" footer={`The bot sends reminders in chat. Quiet hours ${user.quietStart}–${user.quietEnd}.`}>
              <List>
                {[...s.reminders].sort((a, b) => Object.keys(REMINDERS).indexOf(a.type) - Object.keys(REMINDERS).indexOf(b.type)).map((r) => {
                  const meta = REMINDERS[r.type];
                  const when = r.type === 'missed_muscle' ? `${r.params?.days || 7} days` : r.type === 'weekly_summary' ? `${WEEKDAYS[((r.weekdays || [7])[0]) - 1]} ${r.times[0]}` : (r.times || []).join(', ');
                  return (
                    <div key={r.id} className="row with-icon">
                      <span className="icon-sq" style={{ background: meta.color }}><Icon name={meta.icon} size={17} color="#fff" stroke={2.2} /></span>
                      <button type="button" className="grow" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setEditReminder(r)}>
                        <span className="row-title">{meta.label}</span>
                        <span className="sub">{when}</span>
                      </button>
                      <Switch checked={r.enabled} label={meta.label} onChange={(v) => toggleReminder(r, v)} />
                    </div>
                  );
                })}
                <Row title="Quiet hours" value={`${user.quietStart}–${user.quietEnd}`} chevron onClick={() => setSheet('quiet')} />
              </List>
            </Section>

            <button type="button" className="btn danger block" onClick={deleteAll}>Delete all my data</button>
            <p className="center tiny hint">FitPro · your data stays in this bot.</p>
          </>
        )}
      </Loader>

      <TargetsSheet open={sheet === 'targets'} onClose={close} user={user} save={save} />
      <ReminderSheet reminder={editReminder} onClose={() => setEditReminder(null)} onSaved={(r) => q.setData((d) => ({ ...d, reminders: d.reminders.map((x) => (x.type === r.type ? r : x)) }))} />

      <Sheet open={sheet === 'goalWeight'} onClose={close} title="Goal weight">
        <NumberInput value={fmt.wNum(user.goalWeightKg)} decimals={1} placeholder={`e.g. ${fmt.weightUnit === 'lb' ? 170 : 78}`} label="Goal weight" autoFocus
          onCommit={(v) => saveQuiet({ goalWeightKg: fmt.toKg(v) }).then(close)} />
        <p className="small hint">In {fmt.weightUnit}. Leave empty to clear.</p>
      </Sheet>
      <Sheet open={sheet === 'perWeek'} onClose={close} title="Workouts per week">
        <Segmented label="Workouts per week" value={user.workoutsPerWeek} onChange={(v) => saveQuiet({ workoutsPerWeek: v }).then(close)} options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))} />
      </Sheet>
      <Sheet open={sheet === 'water'} onClose={close} title="Water per day">
        <Segmented label="Water target" value={user.waterTargetMl} onChange={(v) => saveQuiet({ waterTargetMl: v }).then(close)} options={[1500, 2000, 2500, 3000, 3500, 4000].map((ml) => ({ value: ml, label: `${ml / 1000}` }))} />
        <p className="small hint">Litres.</p>
      </Sheet>
      <Sheet open={sheet === 'units'} onClose={close} title="Units">
        <div className="row-between"><span>Weight</span><div style={{ width: 160 }}><Segmented label="Weight unit" value={user.weightUnit} onChange={(v) => saveQuiet({ weightUnit: v })} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} /></div></div>
        <div className="row-between"><span>Energy</span><div style={{ width: 160 }}><Segmented label="Energy unit" value={user.energyUnit} onChange={(v) => saveQuiet({ energyUnit: v })} options={[{ value: 'kcal', label: 'kcal' }, { value: 'kj', label: 'kJ' }]} /></div></div>
      </Sheet>
      <Sheet open={sheet === 'rest'} onClose={close} title="Default rest">
        <List>
          {REST.map((sec) => (
            <Row key={sec} title={mmss(sec)} onClick={() => saveQuiet({ defaultRestSec: sec }).then(close)}>
              {user.defaultRestSec === sec && <Icon name="check" size={18} color="var(--link)" stroke={2.6} />}
            </Row>
          ))}
        </List>
      </Sheet>
      <Sheet open={sheet === 'week'} onClose={close} title="Week starts on">
        <Segmented label="Week start" value={user.weekStartsOn} onChange={(v) => saveQuiet({ weekStartsOn: v }).then(close)} options={[{ value: 1, label: 'Monday' }, { value: 7, label: 'Sunday' }]} />
      </Sheet>
      <Sheet open={sheet === 'tz'} onClose={close} title="Timezone">
        {device && device !== user.timezone && <button type="button" className="btn soft block" onClick={() => saveQuiet({ timezone: device }).then(close)}>Use this device: {device}</button>}
        {tzList ? (
          <select className="input" value={user.timezone} onChange={(e) => saveQuiet({ timezone: e.target.value }).then(close)}>
            {tzList.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        ) : (
          <input className="input" defaultValue={user.timezone} onBlur={(e) => e.target.value !== user.timezone && saveQuiet({ timezone: e.target.value })} />
        )}
        <p className="small hint">Decides when your day starts and when reminders arrive.</p>
      </Sheet>
      <Sheet open={sheet === 'quiet'} onClose={close} title="Quiet hours">
        <div className="grid2">
          <label className="form-row"><span className="label">From</span><input className="input" type="time" defaultValue={user.quietStart} onBlur={(e) => e.target.value && saveQuiet({ quietStart: e.target.value })} /></label>
          <label className="form-row"><span className="label">To</span><input className="input" type="time" defaultValue={user.quietEnd} onBlur={(e) => e.target.value && saveQuiet({ quietEnd: e.target.value })} /></label>
        </div>
        <p className="small hint">No automatic nudges (like missed muscle groups) during these hours.</p>
      </Sheet>
    </div>
  );
}
