import { useApi, mutate, AFFECTS } from '../lib/api.js';
import { useNav } from '../lib/app-state.jsx';
import { Loader, Section, List, Row, Empty, ErrorBox, toast, toastError } from '../ui/kit.jsx';
import { haptic, confirmDialog } from '../lib/tg.js';
import { t, cname } from '../lib/i18n.js';

// A groupmate's routines, to copy into your own library.

export default function MemberRoutines({ userId, name }) {
  const nav = useNav();
  const q = useApi('listMemberRoutines', { userId });
  async function copy(r) {
    if (!(await confirmDialog(t('Copy “{name}” to your routines? Target weights start empty — set your own.', { name: r.name })))) return;
    try {
      const { routine } = await mutate('copyRoutine', { routineId: r.id }, AFFECTS.routines);
      haptic.success();
      toast(t('Copied to your routines'));
      nav.push('RoutineEditor', { id: routine.id });
    } catch (e) { toastError(e); }
  }
  if (q.error) {
    return (
      <div className="screen sub">
        <h1 className="title" style={{ padding: '0 4px' }}>{name || t('Member')}</h1>
        {q.error.code === 'NOT_FOUND'
          ? <div className="card"><Empty>{t('{name} doesn’t share routines.', { name: name || t('This member') })}</Empty></div>
          : <ErrorBox error={q.error} onRetry={q.reload} />}
      </div>
    );
  }
  return (
    <div className="screen sub">
      <Loader q={q}>
        {(d) => (
          <>
            <h1 className="title" style={{ padding: '0 4px' }}>{t('{name}’s routines', { name: d.member.name || t('Member') })}</h1>
            {d.routines.length ? (
              <Section footer={t('Tap a routine to copy it.')}>
                <List>
                  {d.routines.map((r) => (
                    <Row key={r.id} icon="copy" iconColor="#1E73BE" title={r.name} chevron onClick={() => copy(r)}
                      sub={[t.n(r.exerciseCount, '{n} exercise', '{n} exercises'), r.items.slice(0, 3).map((i) => cname(i.exercise.name)).join(', ')].join(' · ')} />
                  ))}
                </List>
              </Section>
            ) : <div className="card"><Empty>{t('No routines yet.')}</Empty></div>}
          </>
        )}
      </Loader>
    </div>
  );
}
