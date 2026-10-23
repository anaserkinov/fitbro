import { useEffect, useMemo, useRef, useState } from 'react';
import { call, mutate, AFFECTS } from '../lib/api.js';
import { useUser } from '../lib/app-state.jsx';
import { MEAL_LABEL } from '../lib/format.js';
import { nutrientsFor } from '../../tgcloud/lib/nutrition.js';
import { toKcal } from '../../tgcloud/lib/units.js';
import { Sheet, Segmented, NumberInput, toast, toastError } from './kit.jsx';
import { Icon } from './icons.jsx';
import { haptic, confirmDialog } from '../lib/tg.js';
import { t, cname } from '../lib/i18n.js';

// Meals on the top row, each snack under the meal it follows. Short forms
// ('Dinner@short') so three columns fit on a phone in every language.
const MEAL_GRID = ['breakfast', 'lunch', 'dinner', 'snack_am', 'snack_pm', 'snack'];

function MealPicker({ value, onChange }) {
  return (
    <div className="segmented meals" role="tablist" aria-label={t('Meal')}>
      {MEAL_GRID.map((m) => (
        <button key={m} type="button" role="tab" aria-selected={m === value} aria-label={t(MEAL_LABEL[m])}
          onClick={() => { haptic.select(); onChange(m); }}>{t(m.startsWith('snack') ? 'Snack@short' : `${MEAL_LABEL[m]}@short`)}</button>
      ))}
    </div>
  );
}

// Breakfast before 11, lunch until 16, dinner until 21, otherwise the evening snack.
export function mealForNow() {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}

export function foodSubtitle(food, fmt) {
  const parts = [];
  if (food.brand) parts.push(food.brand);
  if (food.servingGrams && food.servingLabel) {
    parts.push(`${t(food.servingLabel)} · ${fmt.e(food.kcalPer100 * food.servingGrams / 100)}`);
  } else {
    parts.push(`100 ${t(food.baseUnit)} · ${fmt.e(food.kcalPer100)}`);
  }
  return parts.join(' · ');
}

function MacroLine({ n, fmt }) {
  return (
    <div className="grid3" style={{ gap: 8 }}>
      {[['Protein', n.proteinG, 'var(--protein)'], ['Carbs', n.carbsG, 'var(--carbs)'], ['Fat', n.fatG, 'var(--fat)']].map(([label, v, c]) => (
        <div key={label} style={{ padding: 10, borderRadius: 10, background: `color-mix(in srgb, ${c} 12%, transparent)` }}>
          <div className="tiny hint">{t(label)}</div>
          <div className="bold">{fmt.g(v)}</div>
        </div>
      ))}
    </div>
  );
}

// Where a built-in category's numbers come from (translation keys).
export const SOURCE_NOTE = {
  fast_food: 'Chain items: values from USDA FoodData Central (US menus). Shawarma and lavash: estimates from a typical recipe.',
  uzbek: 'An estimate from a typical home recipe. Make your own version to match yours.',
};
const ESTIMATE_NOTE = 'An estimate from a typical home recipe. Make your own version to match yours.';
const CHAIN_NOTE = 'Values from USDA FoodData Central (US menus).';
const noteFor = (food) => (food.dish ? ESTIMATE_NOTE : food.category === 'fast_food' ? CHAIN_NOTE : null);

// Log a food (food given) or edit an existing entry (log given).
export function FoodLogSheet({ open, onClose, food, log, date, meal: initialMeal, onSaved, onEditFood }) {
  const { fmt } = useUser();
  const editing = !!log;
  const isQuick = editing && !log.foodId;
  const [meal, setMeal] = useState(initialMeal);
  const [unit, setUnit] = useState('g');
  const [qty, setQty] = useState(100);
  const [quick, setQuick] = useState({});
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(null);   // the food behind an entry being edited

  useEffect(() => {
    setLoaded(null);
    if (open && log && log.foodId && !food) {
      call('getFood', { id: log.foodId }).then((r) => setLoaded(r.food), () => setLoaded(false));
    }
  }, [open, log, food]);

  useEffect(() => {
    if (!open) return;
    setMeal(log ? log.meal : initialMeal);
    if (log && log.foodId) { setUnit(log.unit); setQty(log.quantity); }
    else if (food) {
      const serving = !!food.servingGrams;
      setUnit(serving ? 'serving' : food.baseUnit);
      setQty(serving ? 1 : 100);
    }
    if (isQuick) setQuick({ name: log.name, kcal: log.kcal, proteinG: log.proteinG, carbsG: log.carbsG, fatG: log.fatG });
  }, [open, food, log]);

  const base = food || loaded || null;
  const grams = base ? (unit === 'serving' ? (qty || 0) * (base.servingGrams || 0) : qty || 0) : 0;
  const n = base ? nutrientsFor(base, grams) : isQuick ? quick : log ? log : null;
  const units = base ? [{ value: base.baseUnit, label: t(base.baseUnit) }, ...(base.servingGrams ? [{ value: 'serving', label: base.servingLabel ? t(base.servingLabel) : t('serving') }] : [])] : [];

  async function save() {
    setBusy(true);
    try {
      let r;
      if (!editing) r = await mutate('logFood', { date, meal, foodId: base.id, quantity: qty, unit }, AFFECTS.food);
      else if (isQuick) r = await mutate('updateFoodLog', { id: log.id, meal, ...quick }, AFFECTS.food);
      else r = await mutate('updateFoodLog', { id: log.id, meal, quantity: qty, unit }, AFFECTS.food);
      haptic.success();
      toast(editing ? t('Saved') : t('Added to {meal}', { meal: t(MEAL_LABEL[meal]).toLowerCase() }));
      onSaved && onSaved(r.day);
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }

  async function remove() {
    if (!(await confirmDialog(t('Remove {name}?', { name: cname(log.name) })))) return;
    try {
      const r = await mutate('deleteFoodLog', { id: log.id }, AFFECTS.food);
      onSaved && onSaved(r.day);
      onClose();
    } catch (e) { toastError(e); }
  }

  // A shared food can't be edited; this gives the user their own copy to change.
  async function makeOwn() {
    setBusy(true);
    try {
      const r = await call('makeOwnFood', { id: base.id });
      haptic.success();
      onEditFood(r.food);
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }

  if (!open) return null;
  const title = cname(base ? base.name : log ? log.name : '');
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {base && <p className="small hint" style={{ marginTop: -10 }}>{foodSubtitle(base, fmt)}</p>}
      {base && noteFor(base) && <p className="tiny hint" style={{ marginTop: -6 }}>{t(noteFor(base))}</p>}
      {isQuick ? (
        <div className="grid2">
          <label className="form-row" style={{ gridColumn: '1 / -1' }}><span className="label">{t('Name')}</span>
            <input className="input" value={quick.name || ''} onChange={(e) => setQuick({ ...quick, name: e.target.value })} /></label>
          <label className="form-row"><span className="label">{t('Energy, {unit}', { unit: fmt.energyUnit })}</span>
            <NumberInput value={fmt.eNum(quick.kcal)} decimals={0} onCommit={(v) => setQuick({ ...quick, kcal: v === null ? 0 : toKcal(v, fmt.energyUnit === 'kJ' ? 'kj' : 'kcal') })} label={t('Energy')} /></label>
          <label className="form-row"><span className="label">{t('Protein, g')}</span><NumberInput value={quick.proteinG} onCommit={(v) => setQuick({ ...quick, proteinG: v ?? 0 })} label={t('Protein')} /></label>
          <label className="form-row"><span className="label">{t('Carbs, g')}</span><NumberInput value={quick.carbsG} onCommit={(v) => setQuick({ ...quick, carbsG: v ?? 0 })} label={t('Carbs')} /></label>
          <label className="form-row"><span className="label">{t('Fat, g')}</span><NumberInput value={quick.fatG} onCommit={(v) => setQuick({ ...quick, fatG: v ?? 0 })} label={t('Fat')} /></label>
        </div>
      ) : base ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: 8, alignItems: 'end' }}>
            <label className="form-row"><span className="label">{t('Amount')}</span>
              <NumberInput value={qty} decimals={unit === 'serving' ? 2 : 0} live onCommit={(v) => setQty(v ?? 0)} label={t('Amount')} autoFocus={!editing} /></label>
            {units.length > 1 ? <Segmented label={t('Unit')} value={unit} onChange={setUnit} options={units} /> : <span className="hint" style={{ paddingBottom: 12 }}>{t(unit)}</span>}
          </div>
          <div className="row-between"><span className="hint">{t('Energy')}</span><span className="mid-num">{fmt.e(n.kcal)}</span></div>
          <MacroLine n={n} fmt={fmt} />
        </>
      ) : loaded === null && log?.foodId ? <p className="hint">{t('Loading…')}</p> : <p className="hint">{t('This food was removed. You can still delete the entry.')}</p>}

      <MealPicker value={meal} onChange={setMeal} />
      <div className="stack-sm" style={{ gap: 8 }}>
        {(base || isQuick) && <button type="button" className="btn lg block" disabled={busy || (base && !(qty > 0))} onClick={save}>{editing ? t('Save') : t('Add')}</button>}
        {editing && <button type="button" className="btn danger block" style={{ background: 'var(--field)' }} onClick={remove}>{t('Remove entry')}</button>}
        {base && base.custom && onEditFood && <button type="button" className="btn ghost" onClick={() => onEditFood(base)}>{t('Edit this food')}</button>}
        {base && !base.custom && onEditFood && <button type="button" className="btn ghost" disabled={busy} onClick={makeOwn}>{t('Make my own version')}</button>}
      </div>
    </Sheet>
  );
}

export function QuickAddSheet({ open, onClose, date, meal: initialMeal, onSaved }) {
  const { fmt } = useUser();
  const [meal, setMeal] = useState(initialMeal);
  const [v, setV] = useState({ name: '', kcal: null, proteinG: null, carbsG: null, fatG: null });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setMeal(initialMeal); setV({ name: '', kcal: null, proteinG: null, carbsG: null, fatG: null }); } }, [open]);
  async function save() {
    setBusy(true);
    try {
      const kcal = toKcal(v.kcal, fmt.energyUnit === 'kJ' ? 'kj' : 'kcal');
      const r = await mutate('logFood', { date, meal, quickAdd: { name: v.name || undefined, kcal, proteinG: v.proteinG ?? undefined, carbsG: v.carbsG ?? undefined, fatG: v.fatG ?? undefined } }, AFFECTS.food);
      haptic.success();
      onSaved && onSaved(r.day);
      onClose();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('Quick add')}>
      <div className="grid2">
        <label className="form-row" style={{ gridColumn: '1 / -1' }}><span className="label">{t('Name (optional)')}</span>
          <input className="input" placeholder={t('e.g. Protein bar')} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        <label className="form-row" style={{ gridColumn: '1 / -1' }}><span className="label">{t('Energy, {unit}', { unit: fmt.energyUnit })}</span>
          <NumberInput value={v.kcal} decimals={0} placeholder="0" autoFocus live onCommit={(x) => setV((cur) => ({ ...cur, kcal: x }))} label={t('Energy')} /></label>
        <label className="form-row"><span className="label">{t('Protein, g')}</span><NumberInput value={v.proteinG} placeholder="—" live onCommit={(x) => setV((cur) => ({ ...cur, proteinG: x }))} label={t('Protein')} /></label>
        <label className="form-row"><span className="label">{t('Carbs, g')}</span><NumberInput value={v.carbsG} placeholder="—" live onCommit={(x) => setV((cur) => ({ ...cur, carbsG: x }))} label={t('Carbs')} /></label>
        <label className="form-row"><span className="label">{t('Fat, g')}</span><NumberInput value={v.fatG} placeholder="—" live onCommit={(x) => setV((cur) => ({ ...cur, fatG: x }))} label={t('Fat')} /></label>
      </div>
      <MealPicker value={meal} onChange={setMeal} />
      <button type="button" className="btn lg block" disabled={busy || !(v.kcal > 0)} onClick={save}>{busy ? t('Saving…') : t('Add')}</button>
    </Sheet>
  );
}

// Barcode entry; on devices with BarcodeDetector a photo of the barcode works too.
export function BarcodeSheet({ open, onClose, onFound, onMissing }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const canDetect = typeof window !== 'undefined' && 'BarcodeDetector' in window;
  useEffect(() => { if (open) setCode(''); }, [open]);

  async function lookup(raw) {
    const c = (raw ?? code).replace(/\s+/g, '');
    if (!/^\d{8,14}$/.test(c)) { toast(t('A barcode is 8–14 digits')); return; }
    setBusy(true);
    try {
      const r = await call('lookupBarcode', { barcode: c });
      if (r.food) { haptic.success(); onFound(r.food); } else { haptic.warn(); onMissing(c); }
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }

  async function fromPhoto(file) {
    try {
      const bmp = await createImageBitmap(file);
      const found = await new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] }).detect(bmp);
      if (!found.length) { toast(t('No barcode found — type the digits instead')); return; }
      setCode(found[0].rawValue);
      lookup(found[0].rawValue);
    } catch { toast(t('Could not read the photo — type the digits instead')); }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('Barcode')}>
      <label className="field">
        <Icon name="barcode" size={18} color="var(--hint)" />
        <span className="sr-only">{t('Barcode digits')}</span>
        <input inputMode="numeric" placeholder={t('e.g. {code}', { code: '4006381333931' })} value={code} autoFocus onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }} />
      </label>
      {canDetect && (
        <>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files[0] && fromPhoto(e.target.files[0])} />
          <button type="button" className="btn soft block" onClick={() => fileRef.current.click()}><Icon name="camera" size={18} />{t('Take a photo of the barcode')}</button>
        </>
      )}
      <button type="button" className="btn lg block" disabled={busy} onClick={() => lookup()}>{busy ? t('Looking up…') : t('Look up')}</button>
      <p className="small hint">{t('Product data from Open Food Facts.')}</p>
    </Sheet>
  );
}
