import { useEffect, useState } from 'react';
import { useApi } from '../lib/api.js';
import { useNav } from '../lib/app-state.jsx';
import { MUSCLE_LABEL } from '../lib/format.js';
import { Segmented, Section, Sheet, Bar, Spinner, Empty, List, Row } from '../ui/kit.jsx';
import { ACHIEVEMENT_BY_CODE } from '../../tgcloud/lib/data/achievements.js';
import { MuscleBadge } from '../ui/ExercisePicker.jsx';
import { StrengthChart, RecordsList } from './ExerciseDetail.jsx';
import { HistoryContent } from './History.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic } from '../lib/tg.js';
import { t, cname } from '../lib/i18n.js';

function MuscleVolume() {
  const q = useApi('getMuscleVolume');
  if (!q.data) return null;
  const max = Math.max(20, ...q.data.muscles.map((m) => m.sets));
  return (
    <Section title={t('Sets per muscle · this week')} footer={t('Completed working sets. 10–20 per week is a common target.')}>
      <div className="card" style={{ gap: 9 }}>
        {q.data.muscles.filter((m) => m.muscle !== 'cardio').map((m) => (
          <div key={m.muscle} style={{ display: 'grid', gridTemplateColumns: '82px minmax(0, 1fr) 24px', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 14 }}>{t(MUSCLE_LABEL[m.muscle])}</span>
            <Bar thick pct={(m.sets / max) * 100} color="var(--accent)" />
            <span className="bold" style={{ fontSize: 14, textAlign: 'right' }}>{m.sets}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Strength() {
  const ex = useApi('listExercises');
  const [exerciseId, setExerciseId] = useState(null);
  const [weeks, setWeeks] = useState(12);
  const [picking, setPicking] = useState(false);
  const used = (ex.data?.exercises || []).filter((e) => e.timesUsed > 0)
    .sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt));
  useEffect(() => { if (!exerciseId && used.length) setExerciseId(used[0].id); }, [used.length]);

  if (!ex.data) return <Spinner />;
  if (!used.length) return <div className="card"><Empty>{t('Finish a workout and your strength charts will appear here.')}</Empty></div>;
  const current = used.find((e) => e.id === exerciseId) || used[0];
  return (
    <>
      <button type="button" className="btn ghost" style={{ alignSelf: 'flex-start', fontWeight: 600, fontSize: 17, padding: '0 4px' }} onClick={() => setPicking(true)}>
        {cname(current.name)}<Icon name="chevronDown" size={16} stroke={2.6} />
      </button>
      <StrengthChart exerciseId={current.id} weeks={weeks} onWeeks={setWeeks} />
      <RecordsList exerciseId={current.id} weeks={weeks} />
      <MuscleVolume />
      <Sheet open={picking} onClose={() => setPicking(false)} title={t('Exercise')} gray>
        <div className="list">
          {used.map((e) => (
            <button key={e.id} type="button" className="row" style={{ minHeight: 56, '--inset': '64px' }} onClick={() => { haptic.select(); setExerciseId(e.id); setPicking(false); }}>
              <MuscleBadge muscle={e.muscle} name={e.name} />
              <span className="grow"><span className="row-title">{cname(e.name)}</span><span className="sub">{t.n(e.timesUsed, '{n} session', '{n} sessions')}</span></span>
              {e.id === current.id && <Icon name="check" size={18} color="var(--link)" stroke={2.6} />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

function Achievements() {
  const q = useApi('getAchievements');
  if (!q.data) return null;
  const { achievements, earnedCount } = q.data;
  return (
    <Section title={t('Achievements · {n} of {total}', { n: earnedCount, total: achievements.length })}>
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 12 }}>
        {achievements.map((a) => {
          const def = ACHIEVEMENT_BY_CODE[a.code];
          const earned = !!a.earnedAt;
          return (
            <div key={a.code} className="center" style={{ opacity: earned ? 1 : 0.4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
              title={t(def.hint)} aria-label={`${t(def.title)}${earned ? '' : ` — ${t(def.hint)}`}`}>
              <span style={{ fontSize: 32, filter: earned ? 'none' : 'grayscale(1)' }} aria-hidden="true">{def.icon}</span>
              <span className="tiny" style={{ fontWeight: 600 }}>{t(def.title)}</span>
              {!earned && <span className="tiny hint">{t(def.hint)}</span>}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export default function Progress() {
  const nav = useNav();
  const [tab, setTab] = useState('strength');
  return (
    <div className="screen">
      <h1 className="large-title" style={{ padding: '0 4px' }}>{t('Progress')}</h1>
      <Segmented label={t('Progress area')} value={tab} onChange={(v) => (v === 'body' ? nav.setTab('body') : setTab(v))}
        options={[{ value: 'strength', label: t('Strength') }, { value: 'body', label: t('Body') }, { value: 'consistency', label: t('Consistency') }]} />
      {tab === 'strength' ? <Strength /> : <HistoryContent />}
      <Achievements />
      <Section>
        <List>
          <Row icon="users" iconColor="#1E73BE" title={t('Friends')} sub={t('Leaderboards and challenges with your groups')} chevron onClick={() => nav.push('Friends')} />
        </List>
      </Section>
    </div>
  );
}
