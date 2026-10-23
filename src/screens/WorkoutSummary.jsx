import { useApi } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { describePr } from '../../tgcloud/lib/strength.js';
import { workoutName } from '../lib/workout-start.js';
import { t, cname } from '../lib/i18n.js';
import { MainButton, Section, List, Row } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import ShareButton from '../ui/ShareButton.jsx';
import { ACHIEVEMENT_BY_CODE } from '../../tgcloud/lib/data/achievements.js';

// A PR in the user's language, e.g. 'Heaviest set: 85 kg × 3'.
export const describePrT = (pr, w) => describePr(pr, w, t);

const PR_ORDER = ['max_weight', 'e1rm', 'reps_at_weight', 'max_reps', 'session_volume', 'max_duration', 'max_distance'];

export default function WorkoutSummary({ result }) {
  const { fmt } = useUser();
  const nav = useNav();
  const ex = useApi('listExercises', {});
  const names = new Map((ex.data?.exercises || []).map((e) => [e.id, e.name]));
  const { workout, totals, prs, progression } = result;
  const badges = (result.achievements || []).map((a) => ACHIEVEMENT_BY_CODE[a.code]).filter(Boolean);
  const sortedPrs = [...prs].sort((a, b) => a.exerciseId - b.exerciseId || PR_ORDER.indexOf(a.type) - PR_ORDER.indexOf(b.type));

  return (
    <div className="screen sub" style={{ gap: 16 }}>
      <div className="stack-sm center" style={{ alignItems: 'center', gap: 10, paddingTop: 24 }}>
        <span style={{ width: 64, height: 64, borderRadius: 32, background: 'var(--good)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={34} stroke={3} />
        </span>
        <h1 className="title">{t('Workout done')}</h1>
        <p className="hint">{workoutName(workout.name)}</p>
      </div>

      <div className="grid3">
        <div className="card tight center"><div className="mid-num">{fmt.dur(workout.durationSec)}</div><div className="tiny hint">{t('Duration')}</div></div>
        <div className="card tight center"><div className="mid-num">{totals.totalSets}</div><div className="tiny hint">{t.n(totals.totalSets, 'Set@count', 'Sets@count')}</div></div>
        <div className="card tight center"><div className="mid-num">{fmt.n(fmt.wNum(totals.totalVolumeKg))}</div><div className="tiny hint">{t('{unit} volume', { unit: fmt.weightLabel })}</div></div>
      </div>

      {badges.length > 0 && (
        <Section title={t('Achievement unlocked')}>
          <List>
            {badges.map((a) => <Row key={a.code} title={`${a.icon} ${t(a.title)}`} sub={t(a.hint)} />)}
          </List>
        </Section>
      )}

      {sortedPrs.length > 0 && (
        <Section title={t('New records · {n}', { n: sortedPrs.length })}>
          <List>
            {sortedPrs.map((p, i) => (
              <Row key={i} icon="trophy" iconColor="#E8A400" title={cname(p.exerciseName)} sub={describePrT(p, (kg) => fmt.w(kg))} />
            ))}
          </List>
        </Section>
      )}

      {progression.length > 0 && (
        <Section title={t('Next time')} footer={t('You hit every target rep, so these targets went up.')}>
          <List>
            {progression.map((p) => (
              <Row key={p.routineExerciseId} icon="arrowUp" iconColor="var(--good)" title={names.has(p.exerciseId) ? cname(names.get(p.exerciseId)) : t('Exercise')}
                value={`${fmt.w(p.fromKg)} → ${fmt.w(p.toKg)}`} />
            ))}
          </List>
        </Section>
      )}

      <ShareButton workout={workout} prs={prs} />

      {!sortedPrs.length && !progression.length && !badges.length && (
        <p className="center hint">{t('Consistency is the PR. See you next session.')}</p>
      )}

      <MainButton text={t('Done')} onClick={() => nav.pop()} />
    </div>
  );
}
