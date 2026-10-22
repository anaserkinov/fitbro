import { useState } from 'react';
import { useApi, call, mutate, AFFECTS } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { relativeDay, MEAL_LABEL, MEAL_COLOR } from '../lib/format.js';
import { addDays } from '../../tgcloud/lib/dates.js';
import { Loader, Sheet, List, Row, toast, toastError } from '../ui/kit.jsx';
import { FoodLogSheet, QuickAddSheet, mealForNow } from '../ui/food.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic } from '../lib/tg.js';

export default function Food() {
  const { fmt, today } = useUser();
  const nav = useNav();
  const [date, setDate] = useState(today);
  const q = useApi('getFoodDay', { date });
  const [openMeal, setOpenMeal] = useState(mealForNow());
  const [editing, setEditing] = useState(null);
  const [quick, setQuick] = useState(null);
  const [menu, setMenu] = useState(null);

  const setDay = (day) => q.setData(day);

  async function water(delta) {
    haptic.tap();
    try {
      const w = delta > 0 ? await call('logWater', { date, amountMl: delta }) : await call('undoWater', { date });
      q.setData((d) => ({ ...d, water: { totalMl: w.totalMl, targetMl: w.targetMl } }));
    } catch (e) { toastError(e); }
  }

  async function copyFrom(meal) {
    setMenu(null);
    try {
      const r = await mutate('copyFood', { fromDate: addDays(date, -1), toDate: date, meal }, AFFECTS.food);
      haptic.success();
      toast(r.copied ? `Copied ${r.copied} item${r.copied === 1 ? '' : 's'} from yesterday` : 'Nothing logged yesterday');
      setDay(r.day);
    } catch (e) { toastError(e); }
  }

  return (
    <div className="screen">
      <div className="title-row" style={{ alignItems: 'center' }}>
        <h1 className="large-title">Food</h1>
        <div className="pill" style={{ padding: 0, gap: 0 }}>
          <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}><Icon name="chevronLeft" size={16} stroke={2.4} /></button>
          <span style={{ minWidth: 76, textAlign: 'center', fontSize: 15 }}>{relativeDay(date, today)}</span>
          <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Next day" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}>
            <Icon name="chevronRight" size={16} stroke={2.4} color={date >= today ? 'var(--track)' : 'currentColor'} />
          </button>
        </div>
      </div>

      <Loader q={q}>
        {(d) => {
          const target = d.targets.kcal || 0;
          const share = (g, k) => (target ? `${Math.min(100, (g * k * 100) / target)}%` : '0%');
          return (
            <>
              <div className="card">
                <div className="row-between" style={{ alignItems: 'baseline' }}>
                  <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4 }}>{fmt.e(d.totals.kcal, { suffix: false })}<span className="hint" style={{ fontSize: 15, fontWeight: 500 }}> / {fmt.e(target)}</span></span>
                  <span className="small bold" style={{ color: target - d.totals.kcal < 0 ? 'var(--carbs)' : 'var(--link)' }}>
                    {target - d.totals.kcal < 0 ? `${fmt.e(d.totals.kcal - target, { suffix: false })} over` : `${fmt.e(target - d.totals.kcal, { suffix: false })} left`}
                  </span>
                </div>
                <div className="stacked" aria-hidden="true">
                  <div style={{ width: share(d.totals.proteinG, 4), background: 'var(--protein)' }} />
                  <div style={{ width: share(d.totals.carbsG, 4), background: 'var(--carbs)' }} />
                  <div style={{ width: share(d.totals.fatG, 9), background: 'var(--fat)' }} />
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 13, flexWrap: 'wrap' }}>
                  {[['Protein', d.totals.proteinG, d.targets.proteinG, 'var(--protein)'], ['Carbs', d.totals.carbsG, d.targets.carbsG, 'var(--carbs)'], ['Fat', d.totals.fatG, d.targets.fatG, 'var(--fat)']].map(([l, v, t, c]) => (
                    <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: c }} />{l} {Math.round(v)}{t ? `/${t}` : ''} g</span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="field" style={{ flex: 1, border: 0, background: 'var(--field)', color: 'var(--hint)', fontSize: 16 }} onClick={() => nav.push('FoodSearch', { date, meal: openMeal || mealForNow() })}>
                  <Icon name="search" size={18} />Search food
                </button>
                <button type="button" className="icon-btn" style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-text)' }} aria-label="Scan barcode"
                  onClick={() => nav.push('FoodSearch', { date, meal: openMeal || mealForNow(), scan: true })}>
                  <Icon name="barcode" size={20} />
                </button>
              </div>

              {d.meals.map((m) => {
                const open = openMeal === m.meal;
                return (
                  <div key={m.meal} className="list">
                    <button type="button" className="row" style={{ minHeight: 56 }} aria-expanded={open} onClick={() => { haptic.select(); setOpenMeal(open ? null : m.meal); }}>
                      <span className="icon-sq" style={{ background: MEAL_COLOR[m.meal], width: 30, height: 30, borderRadius: 8 }}><Icon name="food" size={18} color="#fff" /></span>
                      <span className="grow">
                        <span className="row-title bold">{MEAL_LABEL[m.meal]}</span>
                        <span className="sub">{m.items.length ? `${m.items.length} item${m.items.length === 1 ? '' : 's'}` : 'Nothing logged yet'}</span>
                      </span>
                      <span className="bold">{m.items.length ? fmt.e(m.totals.kcal, { suffix: false }) : '—'}</span>
                      <Icon name="chevronRight" size={16} stroke={2.2} color="var(--hint)" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>
                    {open && (
                      <>
                        {m.items.map((it) => (
                          <button key={it.id} type="button" className="row" style={{ '--inset': '58px', paddingLeft: 58 }} onClick={() => setEditing(it)}>
                            <span className="grow">
                              <span className="row-title ellipsis" style={{ fontSize: 15 }}>{it.name}</span>
                              <span className="sub">{it.foodId ? (it.unit === 'serving' ? `${it.quantity} × serving · ${Math.round(it.grams)} g` : `${Math.round(it.quantity)} ${it.unit}`) : 'Quick add'}</span>
                            </span>
                            <span style={{ fontSize: 15 }}>{fmt.e(it.kcal, { suffix: false })}</span>
                          </button>
                        ))}
                        <div className="row" style={{ '--inset': '58px', paddingLeft: 58, gap: 18 }}>
                          <button type="button" className="btn ghost" style={{ padding: 0 }} onClick={() => nav.push('FoodSearch', { date, meal: m.meal })}><Icon name="plus" size={16} stroke={2.4} />Add food</button>
                          <button type="button" className="btn ghost" style={{ padding: 0, fontWeight: 400 }} onClick={() => setQuick(m.meal)}>Quick add</button>
                          <button type="button" className="btn ghost" style={{ padding: 0, fontWeight: 400, marginLeft: 'auto' }} aria-label={`${MEAL_LABEL[m.meal]} options`} onClick={() => setMenu(m.meal)}><Icon name="more" size={20} stroke={3} /></button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              <div className="card tight" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <span className="icon-sq" style={{ background: 'var(--water)' }}><Icon name="droplet" size={17} color="#fff" /></span>
                <span className="grow" style={{ flex: 1 }}>
                  <span className="bold">Water</span>
                  <span className="small hint" style={{ display: 'block' }}>{(d.water.totalMl / 1000).toFixed(2)} of {(d.water.targetMl / 1000).toFixed(1)} L</span>
                </span>
                <button type="button" className="icon-btn" style={{ background: 'var(--field)' }} aria-label="Remove last water entry" disabled={!d.water.totalMl} onClick={() => water(-1)}><Icon name="minus" size={18} stroke={2.4} /></button>
                <button type="button" className="btn soft sm" onClick={() => water(250)}>+ 250 ml</button>
              </div>
            </>
          );
        }}
      </Loader>

      <FoodLogSheet open={!!editing} log={editing} onClose={() => setEditing(null)} onSaved={setDay}
        onEditFood={(f) => { setEditing(null); nav.push(f.source === 'recipe' ? 'RecipeEditor' : 'FoodEditor', { id: f.id }); }} />
      <QuickAddSheet open={!!quick} meal={quick} date={date} onClose={() => setQuick(null)} onSaved={setDay} />
      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu ? MEAL_LABEL[menu] : ''}>
        <List>
          <Row icon="copy" iconColor="#6D6D72" title={`Copy yesterday's ${menu ? MEAL_LABEL[menu].toLowerCase() : ''}`} onClick={() => copyFrom(menu)} />
          <Row icon="copy" iconColor="#6D6D72" title="Copy all of yesterday" onClick={() => copyFrom(undefined)} />
        </List>
      </Sheet>
    </div>
  );
}
