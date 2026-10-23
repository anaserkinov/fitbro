import { useApi, mutate, AFFECTS } from '../lib/api.js';
import { useNav } from '../lib/app-state.jsx';
import { Loader, MainButton, ErrorBox, toastError } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic } from '../lib/tg.js';
import { t } from '../lib/i18n.js';

// Where an invite link lands: the group's name and size, and an explicit Join.

export default function GroupInvite({ code }) {
  const nav = useNav();
  const q = useApi('previewGroup', { code });
  async function join() {
    try {
      const { group } = await mutate('joinGroup', { code }, AFFECTS.groups);
      haptic.success();
      nav.replace('Group', { groupId: group.id });
    } catch (e) { toastError(e); }
  }
  if (q.error) return <div className="screen sub"><ErrorBox error={q.error} /></div>;
  return (
    <div className="screen sub" style={{ gap: 16 }}>
      <Loader q={q}>
        {({ group, isMember }) => (
          <>
            <div className="stack-sm center" style={{ alignItems: 'center', gap: 10, paddingTop: 24 }}>
              <span style={{ width: 64, height: 64, borderRadius: 32, background: 'var(--accent)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="users" size={32} stroke={2.2} />
              </span>
              <h1 className="title">{group.name}</h1>
              <p className="hint">{t.n(group.memberCount, '{n} member', '{n} members')}{group.ownerName ? ` · ${t('created by {name}', { name: group.ownerName })}` : ''}</p>
            </div>
            <div className="card">
              <span>{t('Compare your training with this group: weekly workouts against everyone’s own goal, volume, and strength for your size.')}</span>
              <span className="small hint">{t('You choose what the group sees — workouts and records by default, never your food or photos. You can change it any time.')}</span>
            </div>
            {isMember
              ? <MainButton text={t('Open group')} onClick={() => nav.replace('Group', { groupId: group.id })} />
              : <MainButton text={t('Join group')} onClick={join} />}
          </>
        )}
      </Loader>
    </div>
  );
}
