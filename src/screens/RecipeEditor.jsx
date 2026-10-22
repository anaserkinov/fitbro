import { useEffect, useState } from 'react';
import { call, mutate, useApi, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { recipePer100 } from '../../tgcloud/lib/nutrition.js';
import { MainButton, NumberInput, Sheet, Spinner, Section, Empty, toast, toastError } from '../ui/kit.jsx';
import { foodSubtitle } from '../ui/food.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic, confirmDialog } from '../lib/tg.js';

function IngredientSearch({ open, onClose, onPick }) {
  const { fmt } = useUser();
  const [text, setText] = useState('');
  const q = useApi('searchFoods', text.trim() ? { q: text.trim() } : {}, { skip: !open });
  const list = text.trim() ? q.data?.results : [...(q.data?.favorites || []), ...(q.data?.recent || [])];
  return (
    <Sheet open={open} onClose={onClose} title="Add ingredient" gray>
      <label className="field" style={{ background: 'var(--card)' }}>
        <Icon name="search" size={18} color="var(--hint)" /><span className="sr-only">Search food</span>
        <input type="search" placeholder="Search food" value={text} autoFocus onChange={(e) => setText(e.target.value)} />
      </label>
      {!q.data ? <Spinner /> : !list?.length ? <Empty>Type to search foods.</Empty> : (
        <div className="list">
          {list.filter((f) => f.source !== 'recipe').map((f) => (
            <button key={f.id} type="button" className="row" onClick={() => { haptic.tap(); onPick(f); }}>
              <span className="grow"><span className="row-title ellipsis">{f.name}</span><span className="sub ellipsis">{foodSubtitle(f, fmt)}</span></span>
              <Icon name="plus" size={18} color="var(--link)" stroke={2.4} />
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

export default function RecipeEditor({ id }) {
  const { fmt } = useUser();
  const nav = useNav();
  const [r, setR] = useState(id ? null : { name: '', servingLabel: '', servingGrams: null, items: [] });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    call('getFood', { id }).then((x) => setR({
      name: x.food.name, servingLabel: x.food.servingLabel || '', servingGrams: x.food.servingGrams,
      items: (x.items || []).filter((i) => i.food).map((i) => ({ food: i.food, grams: i.grams })),
    }), toastError);
  }, [id]);

  if (!r) return <div className="screen sub"><Spinner /></div>;
  const total = r.items.reduce((a, i) => a + (i.grams || 0), 0);
  const per100 = recipePer100(r.items.filter((i) => i.grams > 0));
  const setItem = (idx, patch) => setR({ ...r, items: r.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });

  async function save() {
    setBusy(true);
    try {
      await mutate('saveRecipe', {
        ...(id ? { id } : {}), name: r.name.trim(),
        servingLabel: r.servingLabel.trim() || null, servingGrams: r.servingGrams || null,
        items: r.items.filter((i) => i.grams > 0).map((i) => ({ foodId: i.food.id, grams: i.grams })),
      }, AFFECTS.food);
      haptic.success();
      toast('Recipe saved');
      nav.pop();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }

  async function archive() {
    if (!(await confirmDialog(`Delete ${r.name}?`))) return;
    try { await mutate('archiveFood', { id }, AFFECTS.food); nav.pop(); } catch (e) { toastError(e); }
  }

  return (
    <div className="screen sub">
      <h1 className="title" style={{ padding: '0 4px' }}>{id ? 'Edit recipe' : 'New recipe'}</h1>
      <div className="card">
        <label className="form-row"><span className="label">Name</span><input className="input" value={r.name} placeholder="e.g. Overnight oats" onChange={(e) => setR({ ...r, name: e.target.value })} /></label>
      </div>
      <Section title={`Ingredients · ${Math.round(total)} g`}>
        <div className="list">
          {r.items.map((it, i) => (
            <div key={i} className="row">
              <span className="grow"><span className="row-title ellipsis">{it.food.name}</span><span className="sub">{fmt.e((it.food.kcalPer100 * (it.grams || 0)) / 100)}</span></span>
              <div style={{ width: 84 }}><NumberInput className="inline-input" value={it.grams} decimals={0} label={`${it.food.name} grams`} onCommit={(v) => setItem(i, { grams: v || 0 })} /></div>
              <span className="small hint">g</span>
              <button type="button" className="icon-btn" style={{ background: 'transparent', color: 'var(--destructive)' }} aria-label={`Remove ${it.food.name}`} onClick={() => setR({ ...r, items: r.items.filter((_, j) => j !== i) })}><Icon name="trash" size={18} /></button>
            </div>
          ))}
          <button type="button" className="row" style={{ color: 'var(--link)', fontWeight: 600 }} onClick={() => setAdding(true)}><Icon name="plus" size={18} stroke={2.4} />Add ingredient</button>
        </div>
      </Section>
      {r.items.length > 0 && (
        <div className="card">
          <div className="row-between"><span className="eyebrow">Per 100 g</span><span className="mid-num">{fmt.e(per100.kcalPer100)}</span></div>
          <p className="small hint">Protein {per100.proteinPer100} g · Carbs {per100.carbsPer100} g · Fat {per100.fatPer100} g</p>
        </div>
      )}
      <Section title="Serving" footer="Optional — e.g. 1 jar = the whole recipe.">
        <div className="card">
          <div className="grid2">
            <label className="form-row"><span className="label">Name</span><input className="input" value={r.servingLabel} placeholder="1 portion" onChange={(e) => setR({ ...r, servingLabel: e.target.value })} /></label>
            <label className="form-row"><span className="label">Size, g</span><NumberInput value={r.servingGrams} decimals={0} placeholder={String(Math.round(total) || '')} onCommit={(v) => setR({ ...r, servingGrams: v })} label="Serving size" /></label>
          </div>
        </div>
      </Section>
      {id && <button type="button" className="btn danger block" onClick={archive}>Delete recipe</button>}
      <IngredientSearch open={adding} onClose={() => setAdding(false)} onPick={(f) => { setAdding(false); setR({ ...r, items: [...r.items, { food: f, grams: f.servingGrams || 100 }] }); }} />
      <MainButton text="Save recipe" disabled={!r.name.trim() || !r.items.some((i) => i.grams > 0)} busy={busy} onClick={save} />
    </div>
  );
}
