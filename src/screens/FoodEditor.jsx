import { useEffect, useState } from 'react';
import { call, mutate, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { toKcal } from '../../tgcloud/lib/units.js';
import { MainButton, NumberInput, Segmented, Spinner, toast, toastError } from '../ui/kit.jsx';
import { haptic, confirmDialog } from '../lib/tg.js';

const EMPTY = { name: '', brand: '', barcode: '', baseUnit: 'g', kcalPer100: null, proteinPer100: null, carbsPer100: null, fatPer100: null, servingLabel: '', servingGrams: null };

// Create (no id) or edit a custom food. Values are per 100 g / 100 ml, as on labels.
export default function FoodEditor({ id, name = '', barcode = '' }) {
  const { fmt } = useUser();
  const nav = useNav();
  const [f, setF] = useState(id ? null : { ...EMPTY, name, barcode });
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const eu = fmt.energyUnit === 'kJ' ? 'kj' : 'kcal';

  useEffect(() => {
    if (!id) return;
    call('getFood', { id }).then((r) => setF({ ...EMPTY, ...Object.fromEntries(Object.entries(r.food).map(([k, v]) => [k, v ?? EMPTY[k] ?? null])) }), toastError);
  }, [id]);

  if (!f) return <div className="screen sub"><Spinner /></div>;
  const valid = f.name.trim() && f.kcalPer100 !== null;

  async function save() {
    setBusy(true);
    try {
      await mutate('saveFood', {
        ...(id ? { id } : {}),
        name: f.name.trim(), brand: f.brand.trim() || null, barcode: f.barcode.trim() || null, baseUnit: f.baseUnit,
        kcalPer100: f.kcalPer100, proteinPer100: f.proteinPer100 ?? 0, carbsPer100: f.carbsPer100 ?? 0, fatPer100: f.fatPer100 ?? 0,
        servingLabel: f.servingLabel.trim() || null, servingGrams: f.servingGrams || null,
      }, AFFECTS.food);
      haptic.success();
      toast(id ? 'Food saved' : 'Food created — find it in search');
      nav.pop();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }

  async function archive() {
    if (!(await confirmDialog(`Delete ${f.name}? Past entries keep their numbers.`))) return;
    try { await mutate('archiveFood', { id }, AFFECTS.food); nav.pop(); } catch (e) { toastError(e); }
  }

  const per = `per 100 ${f.baseUnit}`;
  return (
    <div className="screen sub">
      <h1 className="title" style={{ padding: '0 4px' }}>{id ? 'Edit food' : 'New food'}</h1>
      <div className="card">
        <label className="form-row"><span className="label">Name</span><input className="input" value={f.name} placeholder="e.g. Protein pudding" onChange={(e) => set({ name: e.target.value })} /></label>
        <div className="grid2">
          <label className="form-row"><span className="label">Brand</span><input className="input" value={f.brand} placeholder="Optional" onChange={(e) => set({ brand: e.target.value })} /></label>
          <label className="form-row"><span className="label">Barcode</span><input className="input" inputMode="numeric" value={f.barcode} placeholder="Optional" onChange={(e) => set({ barcode: e.target.value })} /></label>
        </div>
        <div className="form-row"><span className="label">Measured in</span>
          <Segmented label="Base unit" value={f.baseUnit} onChange={(v) => set({ baseUnit: v })} options={[{ value: 'g', label: 'grams' }, { value: 'ml', label: 'millilitres' }]} /></div>
      </div>
      <section className="section">
        <div className="section-title">Nutrition {per}</div>
        <div className="card">
          <label className="form-row"><span className="label">Energy, {fmt.energyUnit}</span>
            <NumberInput value={fmt.eNum(f.kcalPer100)} decimals={0} placeholder="0" onCommit={(v) => set({ kcalPer100: v === null ? null : toKcal(v, eu) })} label="Energy" /></label>
          <div className="grid3">
            <label className="form-row"><span className="label">Protein, g</span><NumberInput value={f.proteinPer100} onCommit={(v) => set({ proteinPer100: v })} label="Protein" placeholder="0" /></label>
            <label className="form-row"><span className="label">Carbs, g</span><NumberInput value={f.carbsPer100} onCommit={(v) => set({ carbsPer100: v })} label="Carbs" placeholder="0" /></label>
            <label className="form-row"><span className="label">Fat, g</span><NumberInput value={f.fatPer100} onCommit={(v) => set({ fatPer100: v })} label="Fat" placeholder="0" /></label>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="section-title">Serving</div>
        <div className="card">
          <div className="grid2">
            <label className="form-row"><span className="label">Name</span><input className="input" value={f.servingLabel} placeholder="1 bar" onChange={(e) => set({ servingLabel: e.target.value })} /></label>
            <label className="form-row"><span className="label">Size, {f.baseUnit}</span><NumberInput value={f.servingGrams} placeholder="60" onCommit={(v) => set({ servingGrams: v })} label="Serving size" /></label>
          </div>
        </div>
        <div className="section-footer">Optional — lets you log “1 bar” instead of grams.</div>
      </section>
      {id && <button type="button" className="btn danger block" onClick={archive}>Delete food</button>}
      <MainButton text="Save" disabled={!valid} busy={busy} onClick={save} />
    </div>
  );
}
