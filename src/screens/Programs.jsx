import { useState } from 'react';
import { useApi, call, invalidate, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { Loader, Section, List, Row, Sheet, NumberInput, toastError } from '../ui/kit.jsx';
import { haptic, confirmDialog } from '../lib/tg.js';
import { t, cname } from '../lib/i18n.js';
import TrainingFields from '../ui/TrainingFields.jsx';
import { Icon } from '../ui/icons.jsx';

// Built-in multi-week programs: what you're following and the catalogue to enrol in.

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LIFTS = [['squat', 'Back Squat'], ['bench', 'Barbell Bench Press'], ['deadlift', 'Deadlift'], ['ohp', 'Overhead Press']];
const AFFECTS_PROGRAM = ['getMyProgram', 'listPrograms', ...AFFECTS.routines, 'listRoutines'];

const length = (p) => (p.weeks ? t.n(p.weeks, '{n} week', '{n} weeks') : t('{n}-week waves', { n: p.cycleWeeks }));

// Exercises come laid out for the user's equipment and session length; tapping one
// offers the other exercises that can fill its slot.
function EnrollSheet({ program, suggested, onClose }) {
  const { fmt } = useUser();
  const [maxes, setMaxes] = useState(() => Object.fromEntries((program.needsMaxes || []).map((k) => [k, suggested[k] ? fmt.wNum(suggested[k]) : null])));
  const [swaps, setSwaps] = useState({});
  const [picking, setPicking] = useState(null);   // { key, current, alternatives }
  const [busy, setBusy] = useState(false);
  async function enroll() {
    if (!(await confirmDialog(t('Start “{name}”? It replaces your weekly plan with the program’s days.', { name: t(program.name) })))) return;
    setBusy(true);
    try {
      const oneRepMaxes = program.needsMaxes ? Object.fromEntries(Object.entries(maxes).filter(([, x]) => x).map(([k, x]) => [k, fmt.toKg(x)])) : undefined;
      await call('enrollProgram', { code: program.code, ...(oneRepMaxes ? { oneRepMaxes } : {}), ...(Object.keys(swaps).length ? { swaps } : {}) });
      haptic.success();
      invalidate(...AFFECTS_PROGRAM);
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }
  const weekdays = Object.keys(program.schedule).map((d) => t(DAY_NAMES[d - 1])).join(', ');
  return (
    <>
      <Sheet open onClose={onClose} title={t(program.name)}>
        <div className="stack" style={{ padding: '0 16px 16px' }}>
          <span className="small">{t(program.about)}</span>
          <span className="small hint">{weekdays}</span>
          {program.days.map((day) => (
            <div key={day.name} className="stack-sm">
              <span className="label">{day.minutes ? t('{day} · about {n} min', { day: t(day.name), n: Math.ceil(day.minutes / 5) * 5 }) : t(day.name)}</span>
              <List>
                {day.exercises.map((x) => {
                  const name = swaps[x.key] || x.name;
                  const canSwap = x.alternatives && x.alternatives.length > 1;
                  return <Row key={x.key} title={cname(name)} chevron={canSwap} onClick={canSwap ? () => setPicking({ key: x.key, current: name, alternatives: x.alternatives }) : undefined} />;
                })}
              </List>
            </div>
          ))}
          <span className="small hint">{program.doable ? t('Tap an exercise to swap it.') : t('Some exercises need equipment you don’t have. Tap one to swap it.')}</span>
          {program.needsMaxes && (
            <>
              <span className="label">{t('Your one-rep max ({unit})', { unit: fmt.weightLabel })}</span>
              <span className="small hint">{t('Filled in from your recent sets. Training weights use 90% of it.')}</span>
              {LIFTS.map(([k, name]) => (
                <label key={k} className="form-row">
                  <span className="label">{cname(name)}</span>
                  <NumberInput value={maxes[k]} onCommit={(x) => setMaxes((m) => ({ ...m, [k]: x }))} live decimals={1} placeholder="—" label={cname(name)} />
                </label>
              ))}
            </>
          )}
          <button type="button" className="btn lg block" disabled={busy} onClick={enroll}>{t('Start program')}</button>
        </div>
      </Sheet>
      <Sheet open={!!picking} onClose={() => setPicking(null)} title={t('Swap exercise')}>
        {picking && (
          <List>
            {picking.alternatives.map((n) => (
              <Row key={n} title={cname(n)} onClick={() => { haptic.select(); setSwaps((sw) => ({ ...sw, [picking.key]: n })); setPicking(null); }}>
                {n === picking.current && <Icon name="check" size={18} color="var(--link)" stroke={2.6} />}
              </Row>
            ))}
          </List>
        )}
      </Sheet>
    </>
  );
}

// The three questions recommendations need, asked right here for users who skipped them.
function ProfileSheet({ onClose }) {
  const { user, setUser } = useUser();
  const [f, setF] = useState({ experience: user.experience, equipment: user.equipment, sessionMinutes: user.sessionMinutes });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const r = await call('updateSettings', f);
      setUser(r.user);
      haptic.success();
      invalidate(...AFFECTS.settings);
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }
  return (
    <Sheet open onClose={onClose} title={t('Find a program')}>
      <div className="stack" style={{ padding: '0 16px 16px' }}>
        <TrainingFields value={f} onChange={(patch) => setF((x) => ({ ...x, ...patch }))} />
        <button type="button" className="btn lg block" disabled={busy || !f.experience || !f.equipment} onClick={save}>{t('Show programs for me')}</button>
      </div>
    </Sheet>
  );
}

function Recommended({ list, onPick, onProfile }) {
  if (list.needsProfile) {
    return (
      <Section title={t('Recommended for you')}>
        <List>
          <Row icon="target" iconColor="#8E5BD8" title={t('Find the right program')} sub={t('Answer 3 quick questions')} chevron onClick={onProfile} />
        </List>
      </Section>
    );
  }
  const byCode = Object.fromEntries(list.programs.map((p) => [p.code, p]));
  return (
    <Section title={t('Recommended for you')}
      footer={list.recommended.length ? t('Picked from your answers and your workout log.') : t('Nothing fits your answers. Try a different number of days a week, or pick from all programs below.')}>
      <List>
        {list.recommended.map((r, i) => (
          <Row key={r.code} icon={i === 0 ? 'trophy' : 'dumbbell'} iconColor={i === 0 ? '#E8A400' : '#E8890C'} title={t(byCode[r.code].name)}
            sub={r.reasons.map((x) => t(x.key, x.params)).join(' · ')} chevron onClick={() => onPick(byCode[r.code])} />
        ))}
        <Row title={t('Change my answers')} chevron onClick={onProfile} />
      </List>
    </Section>
  );
}

function Current({ my }) {
  const nav = useNav();
  async function leave() {
    if (!(await confirmDialog(t('Leave “{name}”? Its routines are archived; your workouts stay.', { name: t(my.program.name) })))) return;
    try {
      await call('leaveProgram');
      invalidate(...AFFECTS_PROGRAM);
    } catch (e) { toastError(e); }
  }
  const progress = [
    my.cycle ? t('Wave {cycle} · week {week} of {of}', { cycle: my.cycle, week: my.week, of: my.of }) : t('Week {week} of {of}', { week: my.week, of: my.of }),
    t.n(my.daysPerWeek, '{done} of {n} session done', '{done} of {n} sessions done', { done: my.sessionsThisWeek }),
  ].join(' · ');
  return (
    <Section title={t('Your program')} footer={my.deload ? t('A lighter week — let your body catch up.') : null}>
      <List>
        <Row icon="calendar" iconColor="#1E73BE" title={t(my.program.name)} sub={progress} value={my.deload ? t('Deload') : null} />
        {my.routines.map((r) => (
          <Row key={r.id} title={r.name} chevron onClick={() => nav.push('RoutineEditor', { id: r.id })} />
        ))}
      </List>
      <button type="button" className="btn danger block" style={{ marginTop: 12 }} onClick={leave}>{t('Leave program')}</button>
    </Section>
  );
}

export default function Programs() {
  const my = useApi('getMyProgram');
  const list = useApi('listPrograms');
  const [enrolling, setEnrolling] = useState(null);
  const [profile, setProfile] = useState(false);
  return (
    <div className="screen sub">
      <h1 className="title" style={{ padding: '0 4px' }}>{t('Programs')}</h1>
      <Loader q={my}>{(m) => (m.program ? <Current my={m} /> : null)}</Loader>
      <Loader q={list}>
        {(l) => (
          <>
          {!l.activeCode && <Recommended list={l} onPick={setEnrolling} onProfile={() => setProfile(true)} />}
          <Section title={t('All programs')} footer={t('Each workout is pre-filled with that week’s sets and weights. A week moves on once its sessions are done, and weights follow how your sets go.')}>
            <List>
              {l.programs.map((p) => (
                <Row key={p.code} icon="dumbbell" iconColor="#E8890C" title={t(p.name)}
                  sub={[t.n(p.daysPerWeek, '{n} day a week', '{n} days a week'), length(p)].join(' · ')}
                  value={l.activeCode === p.code ? t('Active') : null}
                  chevron={!l.activeCode} onClick={l.activeCode ? undefined : () => setEnrolling(p)} />
              ))}
            </List>
          </Section>
          </>
        )}
      </Loader>
      {profile && <ProfileSheet onClose={() => setProfile(false)} />}
      {enrolling && <EnrollSheet program={enrolling} suggested={list.data.suggestedMaxes} onClose={() => setEnrolling(null)} />}
    </div>
  );
}
