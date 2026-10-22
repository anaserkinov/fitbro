import { useApi } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { describePr } from '../../tgcloud/lib/strength.js';
import { MainButton, Section, List, Row } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';

const PR_ORDER = ['max_weight', 'e1rm', 'reps_at_weight', 'max_reps', 'session_volume', 'max_duration', 'max_distance'];

export default function WorkoutSummary({ result }) {
  const { fmt } = useUser();
  const nav = useNav();
  const ex = useApi('listExercises', {});
  const names = new Map((ex.data?.exercises || []).map((e) => [e.id, e.name]));
  const { workout, totals, prs, progression } = result;
  const sortedPrs = [...prs].sort((a, b) => a.exerciseId - b.exerciseId || PR_ORDER.indexOf(a.type) - PR_ORDER.indexOf(b.type));

  return (
    <div className="screen sub" style={{ gap: 16 }}>
      <div className="stack-sm center" style={{ alignItems: 'center', gap: 10, paddingTop: 24 }}>
        <span style={{ width: 64, height: 64, borderRadius: 32, background: 'var(--good)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={34} stroke={3} />
        </span>
        <h1 className="title">Workout done</h1>
        <p className="hint">{workout.name}</p>
      </div>

      <div className="grid3">
        <div className="card tight center"><div className="mid-num">{fmt.dur(workout.durationSec)}</div><div className="tiny hint">Duration</div></div>
        <div className="card tight center"><div className="mid-num">{totals.totalSets}</div><div className="tiny hint">{totals.totalSets === 1 ? 'Set' : 'Sets'}</div></div>
        <div className="card tight center"><div className="mid-num">{fmt.n(fmt.wNum(totals.totalVolumeKg))}</div><div className="tiny hint">{fmt.weightUnit} volume</div></div>
      </div>

      {sortedPrs.length > 0 && (
        <Section title={`New records · ${sortedPrs.length}`}>
          <List>
            {sortedPrs.map((p, i) => (
              <Row key={i} icon="trophy" iconColor="#E8A400" title={p.exerciseName} sub={describePr(p, (kg) => fmt.w(kg))} />
            ))}
          </List>
        </Section>
      )}

      {progression.length > 0 && (
        <Section title="Next time" footer="You hit every target rep, so these targets went up.">
          <List>
            {progression.map((p) => (
              <Row key={p.routineExerciseId} icon="arrowUp" iconColor="var(--good)" title={names.get(p.exerciseId) || 'Exercise'}
                value={`${fmt.w(p.fromKg)} → ${fmt.w(p.toKg)}`} />
            ))}
          </List>
        </Section>
      )}

      {!sortedPrs.length && !progression.length && (
        <p className="center hint">Consistency is the PR. See you next session.</p>
      )}

      <MainButton text="Done" onClick={() => nav.pop()} />
    </div>
  );
}
