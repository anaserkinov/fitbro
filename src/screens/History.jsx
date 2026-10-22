import { useState } from 'react';
import { useApi } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { monthName, relativeDay, weekdayShort } from '../lib/format.js';
import { prText } from './ExerciseDetail.jsx';
import { weekday, addDays, monthEnd } from '../../tgcloud/lib/dates.js';
import { Loader, Empty } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic } from '../lib/tg.js';
import { t, cname } from '../lib/i18n.js';

// 2024-01-01 was a Monday: DOW_DATES[i] is weekday i + 1, for localized short names.
const DOW_DATES = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07'];

function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Calendar of trained days + the selected day's workouts. Used on its own screen
// (from Today › This week) and inside Progress › Consistency.
export function HistoryContent() {
  const { user, fmt, today } = useUser();
  const nav = useNav();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const q = useApi('getConsistency', { month });

  const startsOn = user.weekStartsOn || 1;
  const dows = [...DOW_DATES.slice(startsOn - 1), ...DOW_DATES.slice(0, startsOn - 1)].map(weekdayShort);
  const first = `${month}-01`;
  const lead = (weekday(first) - startsOn + 7) % 7;
  const last = monthEnd(first);

  return (
    <Loader q={q}>
      {(c) => {
        const byDate = new Map(c.days.map((d) => [d.date, d.workouts]));
        const cells = [];
        for (let i = 0; i < lead; i++) cells.push(null);
        for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);
        const dayWorkouts = byDate.get(selected) || [];
        return (
          <>
            <div className="grid3">
              <div className="card tight"><div className="mid-num" style={{ fontSize: 20 }}>{c.workoutCount}</div><div className="tiny hint">{t('Workouts this month')}</div></div>
              <div className="card tight"><div className="mid-num" style={{ fontSize: 20 }}>{c.streakDays}<span className="unit" style={{ fontSize: 14 }}> {t.n(c.streakDays, 'day', 'days')}</span></div><div className="tiny hint">{t('Current streak')}</div></div>
              <div className="card tight"><div className="mid-num" style={{ fontSize: 20 }}>{c.avgDurationSec ? Math.round(c.avgDurationSec / 60) : '—'}<span className="unit" style={{ fontSize: 14 }}> {t('min')}</span></div><div className="tiny hint">{t('Avg duration')}</div></div>
            </div>

            <div className="card" style={{ padding: '14px 12px 12px', gap: 10 }}>
              <div className="row-between" style={{ padding: '0 4px' }}>
                <button type="button" className="icon-btn" style={{ width: 32, height: 32, background: 'transparent' }} aria-label={t('Previous month')} onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="chevronLeft" size={16} stroke={2.4} /></button>
                <span className="bold" style={{ fontSize: 17 }}>{monthName(month)}</span>
                <button type="button" className="icon-btn" style={{ width: 32, height: 32, background: 'transparent' }} aria-label={t('Next month')} disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}>
                  <Icon name="chevronRight" size={16} stroke={2.4} color={month >= today.slice(0, 7) ? 'var(--track)' : 'currentColor'} />
                </button>
              </div>
              <div className="cal">
                {dows.map((d) => <span key={d} className="dow">{d}</span>)}
                {cells.map((d, i) => (
                  <div key={d || `x${i}`} className="cell">
                    {d && (
                      <button type="button" aria-pressed={d === selected} aria-label={byDate.has(d) ? t('{date}, workout logged', { date: d }) : d}
                        className={[byDate.has(d) && 'trained', d === today && 'today', d === selected && 'selected', d > today && 'future'].filter(Boolean).join(' ')}
                        onClick={() => { haptic.select(); setSelected(d); }}>
                        {Number(d.slice(8))}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {selected.slice(0, 7) === month && (
              dayWorkouts.length ? dayWorkouts.map((w) => (
                <button key={w.id} type="button" className="card clickable" onClick={() => nav.push('Workout', { id: w.id })}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="icon-sq lg" style={{ background: 'var(--accent)' }}><Icon name="dumbbell" size={20} color="#fff" /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="bold" style={{ display: 'block' }}>{cname(w.name)}</span>
                      <span className="small hint">{relativeDay(selected, today)} · {Math.round((w.durationSec || 0) / 60)} {t('min')} · {fmt.w(w.totalVolumeKg, { digits: 0 })} · {t.n(w.totalSets, '{n} set', '{n} sets')}</span>
                    </span>
                    <Icon name="chevronRight" size={16} stroke={2.2} color="var(--hint)" />
                  </div>
                  {w.prs.length > 0 && (
                    <div className="stack-sm" style={{ gap: 4 }}>
                      {w.prs.filter((p) => p.type !== 'reps_at_weight').slice(0, 3).map((p, i) => (
                        <span key={i} className="badge gold" style={{ height: 'auto', padding: '6px 10px', fontSize: 13, alignSelf: 'flex-start' }}>
                          <Icon name="trophy" size={14} stroke={2.4} />{cname(p.exerciseName)} · {prText(p, fmt).join(': ')}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              )) : <div className="card"><Empty>{selected > today ? t('Not yet.') : t('Rest day — nothing logged.')}</Empty></div>
            )}
          </>
        );
      }}
    </Loader>
  );
}

export default function History() {
  return (
    <div className="screen sub">
      <h1 className="title" style={{ padding: '0 4px' }}>{t('History')}</h1>
      <HistoryContent />
    </div>
  );
}
