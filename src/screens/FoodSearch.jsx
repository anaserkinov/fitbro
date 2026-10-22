import { useEffect, useState } from 'react';
import { useApi, call, invalidate } from '../lib/api.js';
import { useUser, useNav } from '../lib/app-state.jsx';
import { MEAL_LABEL } from '../lib/format.js';
import { Section, Spinner, Empty, ErrorBox, toastError } from '../ui/kit.jsx';
import { FoodLogSheet, QuickAddSheet, BarcodeSheet, foodSubtitle } from '../ui/food.jsx';
import { Icon } from '../ui/icons.jsx';
import { haptic } from '../lib/tg.js';
import { t, cname } from '../lib/i18n.js';

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
  const q = useApi('searchFoods', term ? { q: term } : {});
  const [picked, setPicked] = useState(null);
  const [quick, setQuick] = useState(false);
  const [barcode, setBarcode] = useState(scan);
  const [favs, setFavs] = useState({});

  async function toggleFav(food) {
    haptic.select();
    const next = !(favs[food.id] ?? food.favorite);
    setFavs({ ...favs, [food.id]: next });
    try { await call('setFavoriteFood', { foodId: food.id, favorite: next }); invalidate('searchFoods'); } catch (e) { toastError(e); }
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

      {q.error ? <ErrorBox error={q.error} onRetry={q.reload} /> : !results ? <Spinner /> : term ? (
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
        onSaved={() => nav.pop()} onEditFood={(f) => { setPicked(null); nav.push(f.source === 'recipe' ? 'RecipeEditor' : 'FoodEditor', { id: f.id }); }} />
      <QuickAddSheet open={quick} date={date} meal={meal} onClose={() => setQuick(false)} onSaved={() => nav.pop()} />
      <BarcodeSheet open={barcode} onClose={() => setBarcode(false)}
        onFound={(f) => { setBarcode(false); setPicked(f); }}
        onMissing={(code) => { setBarcode(false); nav.push('FoodEditor', { barcode: code }); }} />
    </div>
  );
}
