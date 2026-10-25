import { useEffect, useState } from 'react';
import { useApi, call } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { Loader, Section, List, Row, Segmented, Bar, Empty, toastError } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic, shareLink } from '../lib/tg.js';
import { relativeDay } from '../lib/format.js';
import { describePrT } from './WorkoutSummary.jsx';
import { workoutName } from '../lib/workout-start.js';
import { ACHIEVEMENT_BY_CODE } from '../../tgcloud/lib/data/achievements.js';
import { t, cname } from '../lib/i18n.js';
import Challenges from '../ui/Challenges.jsx';

// A friends group: the weekly leaderboard, the feed with reactions, and the members.

const REACTIONS = ['👏', '🔥', '💪'];
const LIFT_LABEL = { 'Barbell Bench Press': 'Bench', 'Back Squat': 'Squat', 'Deadlift': 'Deadlift' };

export function invite(group) {
  if (group.inviteLink) shareLink(group.inviteLink, t('Join my group “{name}” on FitBro — let’s compare our training.', { name: group.name }));
}

const nameOf = (row, userId) => (row.userId === userId ? t('You') : row.name || t('Member'));

function Board({ board, me }) {
  const { fmt } = useUser();
  const [kind, setKind] = useState('consistency');
  const rows = board[kind];
  return (
    <Section title={t('This week')}>
      <Segmented label={t('Leaderboard')} value={kind} onChange={setKind}
        options={[{ value: 'consistency', label: t('Consistency') }, { value: 'volume', label: t('Volume') }, { value: 'strength', label: t('Strength') }]} />
      {!rows.length ? (
        <div className="card"><Empty>{kind === 'strength'
          ? t('Members who share their body weight show up here, ranked by strength for their size.')
          : t('Nobody has trained yet this week.')}</Empty></div>
      ) : (
        <List>
          {rows.map((r) => {
            const title = `${r.rank}. ${nameOf(r, me)}`;
            if (kind === 'consistency') {
              return (
                <Row key={r.userId} title={title} value={`${r.done} / ${r.goal}`}
                  sub={r.streakWeeks ? t.n(r.streakWeeks, '🔥 {n}-week streak', '🔥 {n}-week streak') : t('Weekly goal: {n}', { n: r.goal })}>
                  <span style={{ width: 64 }}><Bar pct={r.pct} color={r.pct >= 100 ? 'var(--good)' : 'var(--link)'} /></span>
                </Row>
              );
            }
            if (kind === 'volume') {
              return <Row key={r.userId} title={title} value={fmt.w(r.volumeKg, { digits: 0 })} sub={t.n(r.sets, '{n} set', '{n} sets')} />;
            }
            return (
              <Row key={r.userId} title={title} value={r.total !== null ? t('{x}× BW', { x: fmt.n(r.total, 2) }) : '—'}
                sub={r.lifts.map((l) => `${t(LIFT_LABEL[l.exercise])} ${l.ratio !== null ? `${fmt.n(l.ratio, 2)}×` : '—'}`).join(' · ')} />
            );
          })}
        </List>
      )}
    </Section>
  );
}

function FeedItem({ item, me, onReact }) {
  const { fmt, today } = useUser();
  const who = item.userId === me ? t('You') : item.name || t('Member');
  let title, lines = [];
  if (item.type === 'achievement') {
    const list = (item.payload.codes || []).map((c) => ACHIEVEMENT_BY_CODE[c]).filter(Boolean);
    title = t('{name} earned an achievement', { name: who });
    lines = list.map((a) => `${a.icon} ${t(a.title)}`);
  } else {
    const p = item.payload;
    title = `${who} · ${workoutName(p.name)}`;
    lines = [[fmt.dur(p.durationSec), t.n(p.totalSets || 0, '{n} set', '{n} sets'), p.totalVolumeKg ? fmt.w(p.totalVolumeKg, { digits: 0 }) : null].filter(Boolean).join(' · ')];
    for (const pr of (p.prs || []).slice(0, 3)) lines.push(`🏆 ${cname(pr.exerciseName)} — ${describePrT(pr, (kg) => fmt.w(kg))}`);
  }
  return (
    <div className="card tight">
      <div className="row-between">
        <span className="bold">{title}</span>
        <span className="tiny hint">{relativeDay(item.localDate, today)}</span>
      </div>
      {lines.map((l, i) => <div key={i} className="small">{l}</div>)}
      <div style={{ display: 'flex', gap: 6 }}>
        {REACTIONS.map((e) => (
          <button key={e} type="button" className={`btn sm ${item.myReaction === e ? 'soft' : 'plain'}`} aria-pressed={item.myReaction === e}
            onClick={() => onReact(item, e)}>
            {e}{item.reactions[e] ? ` ${item.reactions[e]}` : ''}
          </button>
        ))}
      </div>
    </div>
  );
}

function Feed({ groupId, me }) {
  const q = useApi('getGroupFeed', { groupId });
  const [more, setMore] = useState([]);
  const [next, setNext] = useState(null);
  useEffect(() => { setMore([]); setNext(q.data ? q.data.nextBefore : null); }, [q.data]);

  async function react(item, emoji) {
    haptic.tap();
    try {
      const r = await call('react', { activityId: item.id, emoji });
      const patch = (x) => (x.id === item.id ? { ...x, reactions: r.reactions, myReaction: r.myReaction } : x);
      q.setData((d) => ({ ...d, items: d.items.map(patch) }));
      setMore((m) => m.map(patch));
    } catch (e) { toastError(e); }
  }
  async function loadMore() {
    try {
      const r = await call('getGroupFeed', { groupId, before: next });
      setMore((m) => [...m, ...r.items]);
      setNext(r.nextBefore);
    } catch (e) { toastError(e); }
  }
  return (
    <Section title={t('Activity@feed')}>
      <Loader q={q}>
        {(d) => (d.items.length ? (
          <div className="stack">
            {[...d.items, ...more].map((it) => <FeedItem key={it.id} item={it} me={me} onReact={react} />)}
            {next && <button type="button" className="btn plain" onClick={loadMore}>{t('Show more')}</button>}
          </div>
        ) : <div className="card"><Empty>{t('Finished workouts from the last 30 days show up here.')}</Empty></div>)}
      </Loader>
    </Section>
  );
}

export default function Group({ groupId, created }) {
  const { user } = useUser();
  const nav = useNav();
  const q = useApi('getGroup', { groupId });
  return (
    <div className="screen sub">
      <Loader q={q}>
        {(g) => (
          <>
            <div className="row-between" style={{ padding: '0 4px' }}>
              <h1 className="title">{g.group.name}</h1>
              <button type="button" className="btn ghost" aria-label={t('Group settings')} onClick={() => nav.push('GroupSettings', { groupId })}>
                <Icon name="sliders" size={22} />
              </button>
            </div>
            {(created || g.members.length === 1) && (
              <div className="card">
                <span className="bold">{t('Invite your friends')}</span>
                <span className="small hint">{t('Send them the link. They’ll see the group and decide whether to join.')}</span>
              </div>
            )}
            <button type="button" className={`btn ${created || g.members.length === 1 ? 'lg block' : 'soft block'}`} onClick={() => invite(g.group)}>
              <Icon name="share" size={18} />&nbsp;{t('Invite friends')}
            </button>
            <Board board={g.leaderboard} me={user.id} />
            <Challenges groupId={groupId} me={user.id} isOwner={g.me.role === 'owner'} />
            <Feed groupId={groupId} me={user.id} />
            <Section title={t.n(g.members.length, '{n} member', '{n} members')}>
              <List>
                {g.members.map((m) => (
                  <Row key={m.userId} icon="user" iconColor={m.userId === user.id ? '#23843F' : '#6D6D72'}
                    title={m.userId === user.id ? t('You') : m.name || t('Member')} value={m.role === 'owner' ? t('Owner') : null}
                    chevron={m.userId !== user.id} onClick={m.userId !== user.id ? () => nav.push('MemberRoutines', { groupId, userId: m.userId, name: m.name }) : undefined} />
                ))}
              </List>
            </Section>
          </>
        )}
      </Loader>
    </div>
  );
}
