import { useState } from 'react';
import { useApi, call, invalidate, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { Loader, Section, List, Row, Sheet, Switch, toast, toastError } from '../ui/kit.jsx';
import { haptic, confirmDialog } from '../lib/tg.js';
import { t } from '../lib/i18n.js';

// What this group sees of you, pings, and the owner's tools. Settings are per group.

const SHARES = [
  { key: 'shareWorkouts', label: 'Workouts@share', sub: 'Your finished workouts, leaderboard and challenges' },
  { key: 'sharePrs', label: 'Personal records', sub: 'Records in your workouts' },
  { key: 'shareRoutines', label: 'Routines@share', sub: 'Members can view and copy your routines' },
  { key: 'shareWeight', label: 'Body weight', sub: 'Used for the strength-for-your-size board' },
];

function RenameSheet({ open, onClose, group, onSaved }) {
  const [name, setName] = useState(group.name);
  async function save() {
    try {
      await call('updateGroup', { groupId: group.id, name });
      invalidate(...AFFECTS.groups);
      onSaved();
      onClose();
    } catch (e) { toastError(e); }
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('Rename group')}>
      <div className="stack" style={{ padding: '0 16px 16px' }}>
        <input className="input" value={name} maxLength={40} autoFocus onChange={(e) => setName(e.target.value)} />
        <button type="button" className="btn lg block" disabled={!name.trim()} onClick={save}>{t('Save')}</button>
      </div>
    </Sheet>
  );
}

export default function GroupSettings({ groupId }) {
  const { user } = useUser();
  const nav = useNav();
  const q = useApi('getGroup', { groupId });
  const [renaming, setRenaming] = useState(false);

  async function setShare(key, value) {
    q.setData((d) => ({ ...d, me: { ...d.me, [key]: value } }));
    try {
      await call('updateMembership', { groupId, [key]: value });
      invalidate(...AFFECTS.groups);
    } catch (e) { toastError(e); q.reload(); }
  }

  async function act(confirmText, name, input, done) {
    if (confirmText && !(await confirmDialog(confirmText))) return;
    try {
      await call(name, { groupId, ...input });
      haptic.success();
      invalidate(...AFFECTS.groups);
      done();
    } catch (e) { toastError(e); }
  }

  return (
    <div className="screen sub">
      <h1 className="title" style={{ padding: '0 4px' }}>{t('Group settings')}</h1>
      <Loader q={q}>
        {(g) => {
          const owner = g.me.role === 'owner';
          return (
            <>
              <Section title={t('What this group sees')} footer={t('Your food diary and photos are never shared.')}>
                <List>
                  {SHARES.map((s) => (
                    <Row key={s.key} title={t(s.label)} sub={t(s.sub)}>
                      <Switch checked={g.me[s.key]} label={t(s.label)} onChange={(v) => setShare(s.key, v)} />
                    </Row>
                  ))}
                </List>
              </Section>
              {g.group.chatLinked && (
                <Section footer={t('This group is linked to a Telegram chat. Its weekly leaderboard lists only members who turn this on.')}>
                  <List>
                    <Row icon="users" iconColor="#1E9BD7" title={t('Show me in chat posts')}>
                      <Switch checked={g.me.showInChat} label={t('Show me in chat posts')} onChange={(v) => setShare('showInChat', v)} />
                    </Row>
                  </List>
                </Section>
              )}
              <Section footer={t('The bot messages you when a member finishes a workout. Quiet hours apply.')}>
                <List>
                  <Row icon="bell" iconColor="#D12F2F" title={t('Workout pings')}>
                    <Switch checked={!g.me.mutePings} label={t('Workout pings')} onChange={(v) => setShare('mutePings', !v)} />
                  </Row>
                </List>
              </Section>

              {owner && (
                <Section title={t('Owner')}>
                  <List>
                    <Row icon="edit" iconColor="#1E73BE" title={t('Rename group')} value={g.group.name} chevron onClick={() => setRenaming(true)} />
                    <Row icon="link" iconColor="#8E5BD8" title={t('Reset invite link')} sub={t('The old link stops working. Removed members can join again.')}
                      onClick={() => act(t('Reset the invite link? The old link will stop working.'), 'resetInvite', {}, () => { toast(t('New invite link ready')); q.reload(); })} />
                  </List>
                </Section>
              )}
              {owner && g.members.length > 1 && (
                <Section title={t('Remove a member')} footer={t('Removed members can’t rejoin with the current link.')}>
                  <List>
                    {g.members.filter((m) => m.userId !== user.id).map((m) => (
                      <Row key={m.userId} title={m.name || t('Member')} danger
                        onClick={() => act(t('Remove {name} from the group?', { name: m.name || t('Member') }), 'removeMember', { userId: m.userId }, () => q.reload())} />
                    ))}
                  </List>
                </Section>
              )}

              <button type="button" className="btn danger block"
                onClick={() => act(owner && g.members.length > 1
                  ? t('Leave the group? The longest-standing member becomes the owner.')
                  : t('Leave the group?'), 'leaveGroup', {}, () => { nav.pop(); nav.pop(); })}>
                {t('Leave group')}
              </button>
              {renaming && <RenameSheet open onClose={() => setRenaming(false)} group={g.group} onSaved={() => q.reload()} />}
            </>
          );
        }}
      </Loader>
    </div>
  );
}
