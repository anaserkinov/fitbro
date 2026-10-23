import { useState } from 'react';
import { useApi, mutate, AFFECTS } from '../lib/api.js';
import { useNav } from '../lib/app-state.jsx';
import { Loader, Section, List, Row, Sheet, Empty, toastError } from '../ui/kit.jsx';
import { haptic } from '../lib/tg.js';
import { t } from '../lib/i18n.js';

// Friends: your groups, and creating a new one. A group's screen has the invite link.

function CreateSheet({ open, onClose }) {
  const nav = useNav();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const { group } = await mutate('createGroup', { name: name.trim() }, AFFECTS.groups);
      haptic.success();
      setName('');
      onClose();
      nav.push('Group', { groupId: group.id, created: true });
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('New group')}>
      <div className="stack" style={{ padding: '0 16px 16px' }}>
        <label className="form-row">
          <span className="label">{t('Group name')}</span>
          <input className="input" value={name} maxLength={40} autoFocus placeholder={t('e.g. Morning crew')}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
        </label>
        <button type="button" className="btn lg block" disabled={!name.trim() || busy} onClick={create}>{t('Create group')}</button>
      </div>
    </Sheet>
  );
}

export default function Friends() {
  const nav = useNav();
  const q = useApi('listGroups');
  const [creating, setCreating] = useState(false);
  return (
    <div className="screen sub">
      <h1 className="title" style={{ padding: '0 4px' }}>{t('Friends')}</h1>
      <Loader q={q}>
        {({ groups }) => (groups.length ? (
          <Section title={t('Your groups')} action={<button type="button" className="btn ghost" onClick={() => setCreating(true)}>{t('New group')}</button>}
            footer={t('Each group has its own privacy settings — you choose what every group sees.')}>
            <List>
              {groups.map((g) => (
                <Row key={g.id} icon="users" iconColor="#1E73BE" title={g.name} chevron
                  sub={[t.n(g.memberCount, '{n} member', '{n} members'), g.role === 'owner' ? t('Owner') : null].filter(Boolean).join(' · ')}
                  onClick={() => nav.push('Group', { groupId: g.id })} />
              ))}
            </List>
          </Section>
        ) : (
          <div className="card">
            <Empty action={<button type="button" className="btn" onClick={() => setCreating(true)}>{t('Create group')}</button>}>
              <b>{t('Train together')}</b><br />
              {t('Create a group, invite friends and compare your weeks — workouts, volume and strength.')}
            </Empty>
          </div>
        ))}
      </Loader>
      <CreateSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
