import { useState } from 'react';
import { call } from '../lib/api.js';
import { useUser } from '../lib/app-state.jsx';
import { canShareMessage, shareMessage, requestWriteAccess, haptic } from '../lib/tg.js';
import { drawWorkoutCard } from '../lib/share-card.js';
import { toastError } from './kit.jsx';
import { Icon } from './icons.jsx';
import { t } from '../lib/i18n.js';

// "Share" for a finished workout: draws the card, has the bot prepare it, then opens
// Telegram's chat picker. Hidden on clients older than Bot API 8.0.
export default function ShareButton({ workout, prs, className = 'btn soft block' }) {
  const { fmt } = useUser();
  const [busy, setBusy] = useState(false);
  if (!canShareMessage || !workout?.endedAt) return null;

  async function share() {
    setBusy(true);
    try {
      const input = { workoutId: workout.id, imageBase64: drawWorkoutCard({ workout, prs, fmt }) };
      let r;
      try {
        r = await call('prepareShare', input);
      } catch (e) {
        if (e.code !== 'BOT_CHAT_REQUIRED' || !(await requestWriteAccess())) throw e;
        r = await call('prepareShare', input);
      }
      if (await shareMessage(r.id)) haptic.success();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }
  return (
    <button type="button" className={className} disabled={busy} onClick={share}>
      <Icon name="share" size={18} />&nbsp;{t('Share workout')}
    </button>
  );
}
