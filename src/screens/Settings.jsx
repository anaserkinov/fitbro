import { useEffect, useState } from 'react';
import { useApi, call, invalidate, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { Loader, Section, List, Row, Sheet, Switch, Segmented, NumberInput, toast, toastError } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic, confirmDialog } from '../lib/tg.js';
import { t } from '../lib/i18n.js';
import { LANGUAGES, LANGUAGE_NAMES } from '../../tgcloud/lib/i18n/core.js';
import { unitLabel } from '../../tgcloud/lib/units.js';

const GOAL_LABEL = { cut: 'Losing fat', maintain: 'Maintaining', bulk: 'Building muscle' };
const REMINDERS = {
  meal: { label: 'Log meals', icon: 'food', color: '#E8890C' },
  weigh_in: { label: 'Morning weigh-in', icon: 'scale', color: '#8E5BD8' },
  workout_day: { label: 'Workout day', icon: 'dumbbell', color: '#1E73BE' },
  missed_muscle: { label: 'Missed muscle group', icon: 'bell', color: '#D12F2F' },
  weekly_summary: { label: 'Weekly summary', icon: 'bars', color: '#23843F' },
};
// English names are the translation keys; wrap at display: t(WEEKDAYS[i]).
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
  const [tg, setTg] = useState({});
  useEffect(() => { if (open) setTg({ kcalTarget: user.kcalTarget, proteinTargetG: user.proteinTargetG, carbsTargetG: user.carbsTargetG, fatTargetG: user.fatTargetG }); }, [open]);
  const macroKcal = (tg.proteinTargetG || 0) * 4 + (tg.carbsTargetG || 0) * 4 + (tg.fatTargetG || 0) * 9;
  const off = tg.kcalTarget && Math.abs(macroKcal - tg.kcalTarget) > 50;
  return (
    <Sheet open={open} onClose={onClose} title={t('Calories & macros')}>
      <div className="grid2">
        <label className="form-row" style={{ gridColumn: '1 / -1' }}><span className="label">{t('Calories, kcal')}</span><NumberInput value={tg.kcalTarget} decimals={0} onCommit={(v) => setTg({ ...tg, kcalTarget: v })} label={t('Calories')} /></label>
        <label className="form-row"><span className="label">{t('Protein, g')}</span><NumberInput value={tg.proteinTargetG} decimals={0} onCommit={(v) => setTg({ ...tg, proteinTargetG: v })} label={t('Protein')} /></label>
        <label className="form-row"><span className="label">{t('Carbs, g')}</span><NumberInput value={tg.carbsTargetG} decimals={0} onCommit={(v) => setTg({ ...tg, carbsTargetG: v })} label={t('Carbs')} /></label>
        <label className="form-row"><span className="label">{t('Fat, g')}</span><NumberInput value={tg.fatTargetG} decimals={0} onCommit={(v) => setTg({ ...tg, fatTargetG: v })} label={t('Fat')} /></label>
      </div>
      <p className="small hint">{!off ? t('Macros add up to {n} kcal.', { n: macroKcal }) : macroKcal > tg.kcalTarget ? t('Macros add up to {n} kcal — above your calorie target.', { n: macroKcal }) : t('Macros add up to {n} kcal — below your calorie target.', { n: macroKcal })}</p>
      <button type="button" className="btn lg block" onClick={() => save(tg).then(onClose)}>{t('Save my numbers')}</button>
      {user.targetsManual && <button type="button" className="btn ghost" onClick={() => save({ targetsManual: false }).then(onClose)}>{t('Use the automatic calculation again')}</button>}
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
    <Sheet open onClose={onClose} title={t(meta.label)}>
      <div className="stack-sm">
        <span className="label">{r.times.length > 1 ? t('Times') : t('Time')}</span>
        {r.times.map((tm, i) => (
          <div key={i} style={{ display: 'flex', gap: 8 }}>
            <input className="input" type="time" value={tm} onChange={(e) => setR({ ...r, times: r.times.map((x, j) => (j === i ? e.target.value : x)) })} />
            {r.times.length > 1 && <button type="button" className="icon-btn" style={{ background: 'var(--field)', color: 'var(--destructive)', width: 44, height: 44, borderRadius: 10 }} aria-label={t('Remove time')} onClick={() => setR({ ...r, times: r.times.filter((_, j) => j !== i) })}><Icon name="trash" size={18} /></button>}
          </div>
        ))}
        {reminder.type === 'meal' && r.times.length < 6 && <button type="button" className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setR({ ...r, times: [...r.times, '19:00'] })}><Icon name="plus" size={16} stroke={2.4} />{t('Add time')}</button>}
      </div>
      {reminder.type === 'weekly_summary' && (
        <div className="stack-sm"><span className="label">{t('Day')}</span>
          <Segmented label={t('Day')} value={(r.weekdays || [7])[0]} onChange={(d) => setR({ ...r, weekdays: [d] })} options={WEEKDAYS.map((w, i) => ({ value: i + 1, label: t(w) }))} /></div>
      )}
      {reminder.type === 'missed_muscle' && (
        <label className="form-row"><span className="label">{t('Remind when a muscle group wasn’t trained for (days)')}</span>
          <NumberInput value={r.days} decimals={0} min={2} max={30} onCommit={(v) => setR({ ...r, days: v || 7 })} label={t('Days')} /></label>
      )}
      <button type="button" className="btn lg block" onClick={save}>{t('Save')}</button>
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
    if (!(await confirmDialog(t('Delete ALL your data — workouts, food, weight, photos, settings? This cannot be undone.')))) return;
    if (!(await confirmDialog(t('Are you sure? Everything will be permanently deleted.')))) return;
    try {
      await call('deleteMyData', { confirm: 'DELETE' });
      toast(t('All data deleted'));
      setTimeout(() => window.location.reload(), 800);
    } catch (e) { toastError(e); }
  }

  const close = () => setSheet(null);
  return (
    <div className="screen sub">
      <h1 className="title" style={{ padding: '0 4px' }}>{t('Settings')}</h1>
      <Loader q={q}>
        {(s) => (
          <>
            <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <span style={{ width: 48, height: 48, borderRadius: 24, background: 'var(--accent)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600 }}>
                {(user.firstName || '?')[0].toUpperCase()}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="bold" style={{ fontSize: 18, display: 'block' }}>{user.firstName || t('You')}</span>
                <span className="small hint">{[GOAL_LABEL[user.goal] && t(GOAL_LABEL[user.goal]), age(user.birthDate, today) && t.n(age(user.birthDate, today), '{n} year old', '{n} years old'), user.heightCm && `${Math.round(user.heightCm)} ${t('cm')}`].filter(Boolean).join(' · ')}</span>
              </span>
              <button type="button" className="btn ghost" onClick={() => nav.push('ProfileEdit', { edit: true })}>{t('Edit')}</button>
            </div>

            <Section title={t('Goals')} footer={user.targetsManual ? t('Using your own numbers.') : t('Calculated from your profile and latest weight.')}>
              <List>
                <Row icon="flame" iconColor="#E8890C" title={t('Calories & macros')} value={fmt.e(user.kcalTarget)} chevron onClick={() => setSheet('targets')} />
                <Row icon="target" iconColor="#8E5BD8" title={t('Goal weight')} value={user.goalWeightKg ? fmt.w(user.goalWeightKg) : t('Not set')} chevron onClick={() => setSheet('goalWeight')} />
                <Row icon="dumbbell" iconColor="#1E73BE" title={t('Workouts per week')} value={user.workoutsPerWeek} chevron onClick={() => setSheet('perWeek')} />
                <Row icon="droplet" iconColor="#1E9BD7" title={t('Water per day')} value={`${fmt.n(user.waterTargetMl / 1000, 1)} ${t('L')}`} chevron onClick={() => setSheet('water')} />
              </List>
            </Section>

            <Section title={t('Preferences')}>
              <List>
                <Row icon="globe" iconColor="#5B36A0" title={t('Language')} value={LANGUAGE_NAMES[user.language] || LANGUAGE_NAMES.en} chevron onClick={() => setSheet('language')} />
                <Row icon="ruler" iconColor="#6D6D72" title={t('Units')} value={`${fmt.weightLabel} · ${fmt.energyUnit}`} chevron onClick={() => setSheet('units')} />
                <Row icon="clock" iconColor="#23843F" title={t('Default rest')} value={mmss(user.defaultRestSec)} chevron onClick={() => setSheet('rest')} />
                <Row icon="calendar" iconColor="#E8890C" title={t('Week starts on')} value={user.weekStartsOn === 7 ? t('Sunday') : t('Monday')} chevron onClick={() => setSheet('week')} />
                <Row icon="globe" iconColor="#1E9BD7" title={t('Timezone')} value={user.timezone} chevron onClick={() => setSheet('tz')} />
              </List>
            </Section>

            <Section title={t('Reminders')} footer={t('The bot sends reminders in chat. Quiet hours {from}–{to}.', { from: user.quietStart, to: user.quietEnd })}>
              <List>
                {[...s.reminders].sort((a, b) => Object.keys(REMINDERS).indexOf(a.type) - Object.keys(REMINDERS).indexOf(b.type)).map((r) => {
                  const meta = REMINDERS[r.type];
                  const when = r.type === 'missed_muscle' ? t.n(r.params?.days || 7, '{n} day', '{n} days') : r.type === 'weekly_summary' ? `${t(WEEKDAYS[((r.weekdays || [7])[0]) - 1])} ${r.times[0]}` : (r.times || []).join(', ');
                  return (
                    <div key={r.id} className="row with-icon">
                      <span className="icon-sq" style={{ background: meta.color }}><Icon name={meta.icon} size={17} color="#fff" stroke={2.2} /></span>
                      <button type="button" className="grow" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setEditReminder(r)}>
                        <span className="row-title">{t(meta.label)}</span>
                        <span className="sub">{when}</span>
                      </button>
                      <Switch checked={r.enabled} label={t(meta.label)} onChange={(v) => toggleReminder(r, v)} />
                    </div>
                  );
                })}
                <Row title={t('Quiet hours')} value={`${user.quietStart}–${user.quietEnd}`} chevron onClick={() => setSheet('quiet')} />
              </List>
            </Section>

            <button type="button" className="btn danger block" onClick={deleteAll}>{t('Delete all my data')}</button>
            <p className="center tiny hint">{t('FitPro · your data stays in this bot.')}</p>
          </>
        )}
      </Loader>

      <TargetsSheet open={sheet === 'targets'} onClose={close} user={user} save={save} />
      <ReminderSheet reminder={editReminder} onClose={() => setEditReminder(null)} onSaved={(r) => q.setData((d) => ({ ...d, reminders: d.reminders.map((x) => (x.type === r.type ? r : x)) }))} />

      <Sheet open={sheet === 'language'} onClose={close} title={t('Language')}>
        <List>
          {LANGUAGES.map((l) => (
            <Row key={l} title={LANGUAGE_NAMES[l]} onClick={() => (l === user.language ? close() : saveQuiet({ language: l }).then(close))}>
              {(user.language || 'en') === l && <Icon name="check" size={18} color="var(--link)" stroke={2.6} />}
            </Row>
          ))}
        </List>
        <p className="small hint">{t('The app and the bot will talk to you in this language.')}</p>
      </Sheet>
      <Sheet open={sheet === 'goalWeight'} onClose={close} title={t('Goal weight')}>
        <NumberInput value={fmt.wNum(user.goalWeightKg)} decimals={1} placeholder={t('e.g. {n}', { n: fmt.weightUnit === 'lb' ? 170 : 78 })} label={t('Goal weight')} autoFocus
          onCommit={(v) => saveQuiet({ goalWeightKg: fmt.toKg(v) }).then(close)} />
        <p className="small hint">{t('In {unit}. Leave empty to clear.', { unit: fmt.weightLabel })}</p>
      </Sheet>
      <Sheet open={sheet === 'perWeek'} onClose={close} title={t('Workouts per week')}>
        <Segmented label={t('Workouts per week')} value={user.workoutsPerWeek} onChange={(v) => saveQuiet({ workoutsPerWeek: v }).then(close)} options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))} />
      </Sheet>
      <Sheet open={sheet === 'water'} onClose={close} title={t('Water per day')}>
        <Segmented label={t('Water target')} value={user.waterTargetMl} onChange={(v) => saveQuiet({ waterTargetMl: v }).then(close)} options={[1500, 2000, 2500, 3000, 3500, 4000].map((ml) => ({ value: ml, label: fmt.n(ml / 1000, ml % 1000 ? 1 : 0) }))} />
        <p className="small hint">{t('Litres.')}</p>
      </Sheet>
      <Sheet open={sheet === 'units'} onClose={close} title={t('Units')}>
        <div className="row-between"><span>{t('Weight')}</span><div style={{ width: 160 }}><Segmented label={t('Weight unit')} value={user.weightUnit} onChange={(v) => saveQuiet({ weightUnit: v })} options={[{ value: 'kg', label: unitLabel('kg', user.language) }, { value: 'lb', label: unitLabel('lb', user.language) }]} /></div></div>
        <div className="row-between"><span>{t('Energy')}</span><div style={{ width: 160 }}><Segmented label={t('Energy unit')} value={user.energyUnit} onChange={(v) => saveQuiet({ energyUnit: v })} options={[{ value: 'kcal', label: unitLabel('kcal', user.language) }, { value: 'kj', label: unitLabel('kj', user.language) }]} /></div></div>
      </Sheet>
      <Sheet open={sheet === 'rest'} onClose={close} title={t('Default rest')}>
        <List>
          {REST.map((sec) => (
            <Row key={sec} title={mmss(sec)} onClick={() => saveQuiet({ defaultRestSec: sec }).then(close)}>
              {user.defaultRestSec === sec && <Icon name="check" size={18} color="var(--link)" stroke={2.6} />}
            </Row>
          ))}
        </List>
      </Sheet>
      <Sheet open={sheet === 'week'} onClose={close} title={t('Week starts on')}>
        <Segmented label={t('Week starts on')} value={user.weekStartsOn} onChange={(v) => saveQuiet({ weekStartsOn: v }).then(close)} options={[{ value: 1, label: t('Monday') }, { value: 7, label: t('Sunday') }]} />
      </Sheet>
      <Sheet open={sheet === 'tz'} onClose={close} title={t('Timezone')}>
        {device && device !== user.timezone && <button type="button" className="btn soft block" onClick={() => saveQuiet({ timezone: device }).then(close)}>{t('Use this device: {tz}', { tz: device })}</button>}
        {tzList ? (
          <select className="input" value={user.timezone} onChange={(e) => saveQuiet({ timezone: e.target.value }).then(close)}>
            {tzList.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        ) : (
          <input className="input" defaultValue={user.timezone} onBlur={(e) => e.target.value !== user.timezone && saveQuiet({ timezone: e.target.value })} />
        )}
        <p className="small hint">{t('Decides when your day starts and when reminders arrive.')}</p>
      </Sheet>
      <Sheet open={sheet === 'quiet'} onClose={close} title={t('Quiet hours')}>
        <div className="grid2">
          <label className="form-row"><span className="label">{t('From')}</span><input className="input" type="time" defaultValue={user.quietStart} onBlur={(e) => e.target.value && saveQuiet({ quietStart: e.target.value })} /></label>
          <label className="form-row"><span className="label">{t('To')}</span><input className="input" type="time" defaultValue={user.quietEnd} onBlur={(e) => e.target.value && saveQuiet({ quietEnd: e.target.value })} /></label>
        </div>
        <p className="small hint">{t('No automatic nudges (like missed muscle groups) during these hours.')}</p>
      </Sheet>
    </div>
  );
}
