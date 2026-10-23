import { useEffect, useState } from 'react';
import { exerciseGuide } from '../lib/exercise-guides.js';
import { Sheet } from './kit.jsx';
import { haptic } from '../lib/tg.js';
import { t, cname } from '../lib/i18n.js';

// How-to for a built-in exercise: start/end photos that flip like a slow animation,
// and numbered cues in large type — readable at arm's length between sets.

const FLIP_MS = 1100;
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function GuidePhotos({ photos }) {
  const [still] = useState(reducedMotion);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(!still);
  useEffect(() => {
    if (!playing || photos.length < 2) return undefined;
    const h = setInterval(() => setFrame((f) => 1 - f), FLIP_MS);
    return () => clearInterval(h);
  }, [playing, photos.length]);
  if (!photos.length) return null;
  const two = photos.length > 1;
  const hint = still ? t('Tap the photo to switch') : t('Tap the photo to pause');
  const tap = () => {
    if (!two) return;
    haptic.select();
    if (still) setFrame((f) => 1 - f); else setPlaying((p) => !p);
  };
  return (
    <div className="stack-sm" style={{ gap: 6 }}>
      <button type="button" className="guide-photos" onClick={tap} aria-label={two ? hint : undefined} disabled={!two}>
        {photos.map((src, i) => (
          <img key={src} src={src} alt={i ? t('End position') : t('Start position')} aria-hidden={frame !== i}
            style={{ opacity: frame === i ? 1 : 0 }} />
        ))}
        {two && <span className="guide-pos">{frame ? t('End position') : t('Start position')}</span>}
      </button>
      {two && <span className="tiny hint center">{hint}</span>}
    </div>
  );
}

export function GuideCues({ cues }) {
  return (
    <ol className="guide-cues">
      {cues.map((c) => <li key={c}>{t(c)}</li>)}
    </ol>
  );
}

// Bottom sheet for the live workout: big photos, then the cues.
export function GuideSheet({ name, onClose }) {
  const g = name ? exerciseGuide(name) : null;
  return (
    <Sheet open={!!g} onClose={onClose} title={name && cname(name)}>
      {g && (
        <>
          <GuidePhotos key={name} photos={g.photos} />
          <GuideCues cues={g.cues} />
        </>
      )}
    </Sheet>
  );
}

// Small start-position photo that opens the guide. Nothing for exercises without one.
export function GuideThumb({ name, onOpen }) {
  const g = exerciseGuide(name);
  if (!g?.photos.length) return null;
  return (
    <button type="button" className="guide-thumb" onClick={() => { haptic.tap(); onOpen(); }} aria-label={t('How to do {name}', { name: cname(name) })}>
      <img src={g.photos[0]} alt="" />
    </button>
  );
}
