import { useEffect, useRef, useState } from 'react';
import { useApi, call, mutate, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { shortDay, signed } from '../lib/format.js';
import { Loader, Section, Sheet, Stepper, Segmented, NumberInput, Empty, toast, toastError } from '../ui/kit.jsx';
import { LineChart } from '../ui/charts.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic, confirmDialog } from '../lib/tg.js';
import { t } from '../lib/i18n.js';

const MEASURES = [
  ['waistCm', 'Waist', 'cm', true], ['chestCm', 'Chest', 'cm'], ['armsCm', 'Arms', 'cm'], ['thighsCm', 'Thighs', 'cm'],
  ['hipsCm', 'Hips', 'cm', true], ['neckCm', 'Neck', 'cm'], ['bodyFatPct', 'Body fat', '%', true],
];
// Labels are translation keys; '@pose' keeps 'Back' apart from the muscle group.
const POSE_LABEL = { front: 'Front@pose', side: 'Side@pose', back: 'Back@pose' };
const poseOptions = () => Object.entries(POSE_LABEL).map(([value, label]) => ({ value, label: t(label) }));
const poseName = (pose) => t(POSE_LABEL[pose] || pose);

// Downscale to ≤1600 px JPEG before upload: phone photos are often 5–10 MB.
async function toJpegBase64(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

const photoCache = new Map();
function usePhoto(id) {
  const [src, setSrc] = useState(photoCache.get(id) || null);
  useEffect(() => {
    if (photoCache.has(id)) { setSrc(photoCache.get(id)); return; }
    let alive = true;
    call('getPhoto', { id }).then((r) => {
      const url = `data:${r.mime};base64,${r.imageBase64}`;
      photoCache.set(id, url);
      if (alive) setSrc(url);
    }, () => {});
    return () => { alive = false; };
  }, [id]);
  return src;
}

function PhotoTile({ photo, onOpen }) {
  const src = usePhoto(photo.id);
  return (
    <button type="button" className="photo-tile" onClick={() => onOpen(photo)} aria-label={t('{pose} photo, {date}', { pose: poseName(photo.pose), date: shortDay(photo.localDate) })}>
      {src && <img src={src} alt="" />}
      <span className="cap">{poseName(photo.pose)} · {shortDay(photo.localDate)}</span>
    </button>
  );
}

function PhotoImg({ photo }) {
  const src = usePhoto(photo.id);
  return src ? <img src={src} alt={`${poseName(photo.pose)} ${photo.localDate}`} style={{ width: '100%', borderRadius: 12, display: 'block' }} /> : <div className="photo-tile" />;
}

function WeightSheet({ open, onClose, latestKg, onSaved }) {
  const { fmt, today } = useUser();
  const [v, setV] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setV(fmt.wNum(latestKg ?? (fmt.weightUnit === 'lb' ? fmt.toKg(170) : 75)) ?? 75); }, [open]);
  async function save() {
    setBusy(true);
    try {
      const r = await mutate('logWeight', { weightKg: fmt.toKg(v) }, AFFECTS.body);
      haptic.success();
      onSaved(r.weight);
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('Log weight')} right={<span className="hint">{shortDay(today)}</span>}>
      <Stepper value={v} step={0.1} unit={fmt.weightLabel} label={t('weight')} onChange={setV} />
      <NumberInput value={v} decimals={1} label={t('Weight')} onCommit={(x) => x && setV(x)} className="input center" />
      <button type="button" className="btn lg block" disabled={busy} onClick={save}>{t('Save')}</button>
      <p className="small hint center">{t("Logging again today replaces today's weigh-in.")}</p>
    </Sheet>
  );
}

function MeasureSheet({ open, onClose, latest, onSaved }) {
  const [v, setV] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setV({}); }, [open]);
  async function save() {
    const fields = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== undefined));
    if (!Object.keys(fields).length) { onClose(); return; }
    setBusy(true);
    try {
      const r = await mutate('logMeasurements', fields, AFFECTS.body);
      haptic.success();
      onSaved(r.measurements);
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('Measurements')}>
      <div className="grid2">
        {MEASURES.map(([key, label, unit]) => (
          <label key={key} className="form-row"><span className="label">{t(label)}, {t(unit)}</span>
            <NumberInput value={v[key] ?? null} placeholder={latest?.[key] ? String(latest[key].value) : '—'} onCommit={(x) => setV({ ...v, [key]: x })} label={t(label)} /></label>
        ))}
      </div>
      <button type="button" className="btn lg block" disabled={busy} onClick={save}>{t('Save')}</button>
      <p className="small hint center">{t('Fill in only what you measured today.')}</p>
    </Sheet>
  );
}

export default function Body() {
  const { user, fmt } = useUser();
  const nav = useNav();
  const q = useApi('getBody', { days: 30 });
  const [weightOpen, setWeightOpen] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  const [upload, setUpload] = useState(null);     // { dataUrl, pose }
  const [viewer, setViewer] = useState(null);
  const [compare, setCompare] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  async function pickFile(file) {
    try { setUpload({ dataUrl: await toJpegBase64(file), pose: 'front' }); } catch { toast(t('Could not read that image')); }
  }

  async function sendPhoto() {
    setBusy(true);
    try {
      await mutate('uploadPhoto', { imageBase64: upload.dataUrl, pose: upload.pose }, AFFECTS.body);
      haptic.success();
      setUpload(null);
      toast(t('Photo saved'));
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }

  async function deletePhoto(p) {
    if (!(await confirmDialog(t('Delete this photo?')))) return;
    try { await mutate('deletePhoto', { id: p.id }, AFFECTS.body); setViewer(null); } catch (e) { toastError(e); }
  }

  return (
    <div className="screen">
      <div className="title-row" style={{ alignItems: 'center' }}>
        <h1 className="large-title">{t('Body')}</h1>
        <button type="button" className="icon-btn" aria-label={t('Settings')} onClick={() => nav.push('Settings')}><Icon name="sliders" size={20} /></button>
      </div>
      <Loader q={q}>
        {(b) => {
          const w = b.weight;
          const m = b.measurements;
          return (
            <>
              <div className="card">
                <div className="row-between" style={{ alignItems: 'flex-end' }}>
                  <div>
                    <div className="small hint">{t('Weight')}{w.latest ? ` · ${shortDay(w.latest.date)}` : ''}</div>
                    <div className="big-num">{w.latest ? fmt.wNum(w.latest.weightKg) : '—'}<span className="unit"> {fmt.weightLabel}</span></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="small hint">{t('7-day average')}</div>
                    <div className="bold" style={{ fontSize: 17 }}>{w.avg7Kg ? fmt.w(w.avg7Kg) : '—'}</div>
                    {w.weekChangeKg !== null && <div className="small bold" style={{ color: (user.goal === 'bulk' ? w.weekChangeKg > 0 : w.weekChangeKg < 0) ? 'var(--good)' : 'var(--hint)' }}>{t('{change} {unit} / week', { change: signed(fmt.wNum(w.weekChangeKg)), unit: fmt.weightLabel })}</div>}
                  </div>
                </div>
                <LineChart series={w.series.map((p) => ({ y: fmt.wNum(p.weightKg) }))} line={w.series.map((p) => fmt.wNum(p.avg7Kg))} dots color="var(--fat)"
                  goal={w.goalWeightKg ? fmt.wNum(w.goalWeightKg) : null} height={96} label={t('Weight over the last 30 days')} />
                <div className="row-between small hint">
                  <span>{w.goalWeightKg ? t('Goal {w}', { w: fmt.w(w.goalWeightKg) }) : t('No goal set')}</span>
                  {w.projectedGoalDate && <span>{t('On pace for')} <span className="bold" style={{ color: 'var(--text)' }}>{shortDay(w.projectedGoalDate)}</span></span>}
                </div>
                <button type="button" className="btn block" onClick={() => setWeightOpen(true)}>{t('Log weight')}</button>
              </div>

              <Section title={t('Measurements')} action={<button type="button" onClick={() => setMeasureOpen(true)}>{t('Log')}</button>}>
                {m.latest && Object.keys(m.latest).length ? (
                  <div className="list">
                    {MEASURES.filter(([k]) => m.latest[k]).map(([k, label, unit, lowerIsBetter]) => {
                      const d = m.deltas[k];
                      const good = d !== undefined && d !== 0 && (lowerIsBetter ? d < 0 : d > 0);
                      return (
                        <div key={k} className="row">
                          <span className="grow"><span className="row-title">{t(label)}</span></span>
                          <span className="bold">{fmt.n(m.latest[k].value, 1).replace(/[.,]0$/, '')} {t(unit)}</span>
                          <span className="small bold" style={{ width: 52, textAlign: 'right', color: good ? 'var(--good)' : 'var(--hint)' }}>{d !== undefined ? signed(d) : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="card"><Empty action={<button type="button" className="btn soft" onClick={() => setMeasureOpen(true)}>{t('Add measurements')}</button>}>{t('Waist, arms, body fat… track what matters to you.')}</Empty></div>}
                {m.previous && <div className="section-footer">{t('Changes vs {date}', { date: shortDay(m.previous.date) })}</div>}
              </Section>

              <Section title={t('Progress photos')} action={b.photos.length > 1 ? <button type="button" onClick={() => setCompare('front')}>{t('Compare')}</button> : null}>
                <div className="photo-grid">
                  {b.photos.slice(0, 8).map((p) => <PhotoTile key={p.id} photo={p} onOpen={setViewer} />)}
                  <button type="button" className="photo-add" onClick={() => fileRef.current.click()}><Icon name="camera" size={22} />{t('Add photo')}</button>
                </div>
                <div className="section-footer">{t('Stored privately in your Telegram chat with the bot.')}</div>
              </Section>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files[0]) pickFile(e.target.files[0]); e.target.value = ''; }} />

              <WeightSheet open={weightOpen} onClose={() => setWeightOpen(false)} latestKg={w.latest?.weightKg} onSaved={(weight) => q.setData((cur) => ({ ...cur, weight }))} />
              <MeasureSheet open={measureOpen} onClose={() => setMeasureOpen(false)} latest={m.latest} onSaved={(measurements) => q.setData((cur) => ({ ...cur, measurements }))} />

              <Sheet open={!!upload} onClose={() => setUpload(null)} title={t('New progress photo')}>
                {upload && <img src={upload.dataUrl} alt={t('Preview')} style={{ width: '100%', maxHeight: '50vh', objectFit: 'contain', borderRadius: 12 }} />}
                <Segmented label={t('Pose')} value={upload?.pose} onChange={(pose) => setUpload({ ...upload, pose })} options={poseOptions()} />
                <button type="button" className="btn lg block" disabled={busy} onClick={sendPhoto}>{busy ? t('Uploading…') : t('Save photo')}</button>
              </Sheet>

              <Sheet open={!!viewer} onClose={() => setViewer(null)} title={viewer ? `${poseName(viewer.pose)} · ${shortDay(viewer.localDate)}` : ''}>
                {viewer && <PhotoImg photo={viewer} />}
                {viewer && <button type="button" className="btn danger block" style={{ background: 'var(--field)' }} onClick={() => deletePhoto(viewer)}>{t('Delete photo')}</button>}
              </Sheet>

              <Sheet open={!!compare} onClose={() => setCompare(null)} title={t('Compare')}>
                <Segmented label={t('Pose')} value={compare} onChange={setCompare} options={poseOptions()} />
                {(() => {
                  const list = b.photos.filter((p) => p.pose === compare);
                  if (list.length < 2) return <Empty>{t('Add at least two photos of this pose to compare.')}</Empty>;
                  const [newest, oldest] = [list[0], list[list.length - 1]];
                  return (
                    <div className="grid2" style={{ gap: 8 }}>
                      <div className="stack-sm"><PhotoImg photo={oldest} /><span className="small hint center">{shortDay(oldest.localDate)}</span></div>
                      <div className="stack-sm"><PhotoImg photo={newest} /><span className="small hint center">{shortDay(newest.localDate)}</span></div>
                    </div>
                  );
                })()}
              </Sheet>
            </>
          );
        }}
      </Loader>
    </div>
  );
}
