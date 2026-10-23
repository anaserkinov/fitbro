import { useEffect, useState } from 'react';
import { useApi, call, invalidate } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { MEAL_LABEL } from '../lib/format.js';
import { Section, Spinner, Empty, ErrorBox, toastError } from '../ui/kit.jsx';
import { FoodLogSheet, QuickAddSheet, BarcodeSheet, foodSubtitle, SOURCE_NOTE } from '../ui/food.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic } from '../lib/tg.js';
import { t, cname } from '../lib/i18n.js';

// Browse groups (server: BROWSE in lib/food.js). Labels are translation keys.
const GROUPS = [
  { id: 'mine', emoji: '✏️', label: 'My foods' },
  { id: 'recipes', emoji: '🍲', label: 'Recipes' },
  { id: 'meat_fish', emoji: '🍗', label: 'Meat & fish' },
  { id: 'dairy', emoji: '🥚', label: 'Eggs & dairy' },
  { id: 'grains', emoji: '🍞', label: 'Grains & starches' },
  { id: 'legumes', emoji: '🫘', label: 'Legumes & tofu' },
  { id: 'fruit', emoji: '🍎', label: 'Fruit' },
  { id: 'vegetables', emoji: '🥦', label: 'Vegetables' },
  { id: 'fats_sweets', emoji: '🥜', label: 'Nuts, oils & sweets' },
  { id: 'drinks', emoji: '🥤', label: 'Drinks' },
  { id: 'fast_food', emoji: '🍔', label: 'Fast food' },
  { id: 'uzbek', emoji: '🫓', label: 'Uzbek dishes' },
];

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const h = setTimeout(() => setV(value), ms); return () => clearTimeout(h); }, [value, ms]);
  return v;
}

export default function FoodSearch({ date, meal, scan = false }) {
  const { fmt } = useUser();
  const nav = useNav();
  const [text, setText] = useState('');
  const term = useDebounced(text.trim(), 250);
  const [group, setGroup] = useState(null);
  // Typing searches (within the picked group, if any); no text + a group browses it.
  const browsing = !term && !!group;
  const q = useApi(browsing ? 'browseFoods' : 'searchFoods', browsing ? { category: group } : term ? { q: term, ...(group ? { category: group } : {}) } : {});
  const [picked, setPicked] = useState(null);
  const [quick, setQuick] = useState(false);
  const [barcode, setBarcode] = useState(scan);
  const [favs, setFavs] = useState({});

  async function toggleFav(food) {
    haptic.select();
    const next = !(favs[food.id] ?? food.favorite);
    setFavs({ ...favs, [food.id]: next });
    try { await call('setFavoriteFood', { foodId: food.id, favorite: next }); invalidate('searchFoods', 'browseFoods'); } catch (e) { toastError(e); }
  }

  const FoodRow = ({ f }) => {
    const fav = favs[f.id] ?? f.favorite;
    return (
      <div className="row" style={{ minHeight: 56, paddingRight: 8 }}>
        <button type="button" className="grow" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => { haptic.tap(); setPicked(f); }}>
          <span className="row-title ellipsis">{cname(f.name)}{f.source === 'recipe' && <span className="badge gray" style={{ marginLeft: 6 }}>{t('Recipe')}</span>}{f.custom && f.source !== 'recipe' && <span className="badge gray" style={{ marginLeft: 6 }}>{t('Mine')}</span>}</span>
          <span className="sub ellipsis">{foodSubtitle(f, fmt)}</span>
        </button>
        <button type="button" className="icon-btn" style={{ background: 'transparent' }} aria-label={fav ? t('Remove {name} from favourites', { name: cname(f.name) }) : t('Add {name} to favourites', { name: cname(f.name) })} aria-pressed={fav} onClick={() => toggleFav(f)}>
          <Icon name="star" size={20} color={fav ? '#E8A400' : 'var(--hint)'} fill={fav ? '#E8A400' : 'none'} stroke={1.8} />
        </button>
      </div>
    );
  };

  const results = q.data;
  return (
    <div className="screen sub">
      <div className="stack-sm" style={{ gap: 2, padding: '0 4px' }}>
        <span className="eyebrow">{t('Add to {meal}@eyebrow', { meal: t(MEAL_LABEL[meal]).toLowerCase() })}</span>
        <h1 className="title">{t('Search food')}</h1>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <label className="field" style={{ flex: 1 }}>
          <Icon name="search" size={18} color="var(--hint)" />
          <span className="sr-only">{t('Search food')}</span>
          <input type="search" placeholder={t('Chicken, oats, banana…')} value={text} autoFocus={!scan} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="button" className="icon-btn" style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-text)' }} aria-label={t('Scan barcode')} onClick={() => setBarcode(true)}>
          <Icon name="barcode" size={20} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn plain sm" onClick={() => setQuick(true)}>{t('Quick add')}</button>
        <button type="button" className="btn plain sm" onClick={() => nav.push('FoodEditor', {})}>{t('New food')}</button>
        <button type="button" className="btn plain sm" onClick={() => nav.push('RecipeEditor', {})}>{t('New recipe')}</button>
      </div>
      <div className="chips scroll" role="group" aria-label={t('Categories')}>
        {GROUPS.map((g) => (
          <button key={g.id} type="button" className="chip" aria-pressed={group === g.id}
            onClick={() => { haptic.select(); setGroup(group === g.id ? null : g.id); }}>
            <span aria-hidden="true">{g.emoji}</span> {t(g.label)}
          </button>
        ))}
      </div>

      {q.error ? <ErrorBox error={q.error} onRetry={q.reload} /> : !results ? <Spinner /> : browsing ? (
        results.foods?.length ? (
          <Section title={t(GROUPS.find((g) => g.id === group).label)} footer={SOURCE_NOTE[group] ? t(SOURCE_NOTE[group]) : null}><div className="list">{results.foods.map((f) => <FoodRow key={f.id} f={f} />)}</div></Section>
        ) : group === 'mine' ? (
          <Empty action={<button type="button" className="btn soft" onClick={() => nav.push('FoodEditor', {})}>{t('New food')}</button>}>{t('You haven’t created any foods yet.')}</Empty>
        ) : group === 'recipes' ? (
          <Empty action={<button type="button" className="btn soft" onClick={() => nav.push('RecipeEditor', {})}>{t('New recipe')}</button>}>{t('No recipes yet. Combine foods into a recipe to log it in one tap.')}</Empty>
        ) : <Empty>{t('Nothing here yet.')}</Empty>
      ) : term ? (
        results.results?.length ? (
          <div className="list">{results.results.map((f) => <FoodRow key={f.id} f={f} />)}</div>
        ) : (
          <Empty action={<button type="button" className="btn soft" onClick={() => nav.push('FoodEditor', { name: term })}>{t('Create “{term}”', { term })}</button>}>{t('No foods match “{term}”.', { term })}</Empty>
        )
      ) : (
        <>
          {results.favorites?.length > 0 && <Section title={t('Favourites')}><div className="list">{results.favorites.map((f) => <FoodRow key={f.id} f={f} />)}</div></Section>}
          {results.recent?.length > 0 ? (
            <Section title={t('Recent')}><div className="list">{results.recent.map((f) => <FoodRow key={f.id} f={f} />)}</div></Section>
          ) : !results.favorites?.length && <Empty>{t('Search the food database, scan a barcode, or quick-add calories.')}</Empty>}
        </>
      )}

      <FoodLogSheet open={!!picked} food={picked} date={date} meal={meal} onClose={() => setPicked(null)}
        onSaved={() => nav.pop()} onEditFood={(f) => { setPicked(null); invalidate('searchFoods', 'browseFoods'); nav.push(f.source === 'recipe' ? 'RecipeEditor' : 'FoodEditor', { id: f.id }); }} />
      <QuickAddSheet open={quick} date={date} meal={meal} onClose={() => setQuick(false)} onSaved={() => nav.pop()} />
      <BarcodeSheet open={barcode} onClose={() => setBarcode(false)}
        onFound={(f) => { setBarcode(false); setPicked(f); }}
        onMissing={(code) => { setBarcode(false); nav.push('FoodEditor', { barcode: code }); }} />
    </div>
  );
}
