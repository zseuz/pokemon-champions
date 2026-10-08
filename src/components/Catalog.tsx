import { normalize, speciesEs, speciesSearch } from '../lib/es';
import { useMemo, useState } from 'react';
import { FORMAT_ES, metaEntry, metaWeight, type Format } from '../data/meta';
import { ALL_SPECIES, getSpecies, TYPE_ES, TYPES } from '../lib/dex';
import { Sprite, TypeBadge, tierColor } from './common';
import { InsightModal } from './Insight';
import { defaultSet, type PokemonSet } from '../lib/sets';

type Sort = 'meta' | 'name' | 'bst' | 'spe';
const PAGE = 48;

const norm = (s: string) => normalize(s).replace(/ /g, '');

/** Catálogo de todos los Pokémon de Champions con imagen, buscador por nombre y filtros por tipo. */
export function Catalog({ format, owned, onRecruit, onRecruitSet, team }: {
  format: Format; owned: string[]; onRecruit: (species: string) => void; onRecruitSet?: (s: PokemonSet) => void; team?: PokemonSet[];
}) {
  const [insight, setInsight] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [onlyMeta, setOnlyMeta] = useState(false);
  const [hideOwned, setHideOwned] = useState(false);
  const [sort, setSort] = useState<Sort>('meta');
  const [limit, setLimit] = useState(PAGE);

  const list = useMemo(() => {
    const needle = norm(q);
    return ALL_SPECIES
      .map((name) => ({ name, sp: getSpecies(name)!, meta: metaEntry(name, format) }))
      .filter(({ name, sp, meta }) =>
        (!needle || norm(speciesSearch(name)).includes(needle)) &&
        types.every((t) => sp.types.includes(t as never)) &&
        (!onlyMeta || meta) &&
        (!hideOwned || !owned.includes(name)))
      .sort((a, b) => {
        const bst = (x: typeof a) => Object.values(x.sp.baseStats).reduce((t, v) => t + v, 0);
        if (sort === 'name') return a.name.localeCompare(b.name);
        if (sort === 'bst') return bst(b) - bst(a);
        if (sort === 'spe') return b.sp.baseStats.spe - a.sp.baseStats.spe;
        return (b.meta ? metaWeight(b.meta) : -1) - (a.meta ? metaWeight(a.meta) : -1) || a.name.localeCompare(b.name);
      });
  }, [q, types, onlyMeta, hideOwned, sort, format, owned]);

  const toggleType = (t: string) => {
    setLimit(PAGE);
    setTypes(types.includes(t) ? types.filter((x) => x !== t) : types.length >= 2 ? [types[1], t] : [...types, t]);
  };

  return (
    <div>
      <div className="panel compact catalog-filters">
        <div className="row wrap">
          <input className="catalog-search" placeholder="🔍 Buscar por nombre…" value={q} autoFocus
            onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="meta">Orden: más usados en {FORMAT_ES[format]}</option>
            <option value="name">Orden: nombre</option>
            <option value="bst">Orden: stats totales</option>
            <option value="spe">Orden: velocidad</option>
          </select>
          <label className="row small"><input type="checkbox" checked={onlyMeta} onChange={(e) => setOnlyMeta(e.target.checked)} /> Solo del meta</label>
          <label className="row small"><input type="checkbox" checked={hideOwned} onChange={(e) => setHideOwned(e.target.checked)} /> Ocultar reclutados</label>
        </div>
        <div className="type-filter">
          <span className="muted small">Tipo (hasta 2):</span>
          {TYPES.map((t) => (
            <button key={t} className={`type-toggle${types.includes(t) ? ' on' : ''}`} onClick={() => toggleType(t)} title={TYPE_ES[t]}>
              <TypeBadge type={t} small />
            </button>
          ))}
          {types.length > 0 && <button className="link" onClick={() => setTypes([])}>quitar filtro</button>}
        </div>
        <div className="muted small">{list.length} Pokémon</div>
      </div>

      <div className="catalog-grid">
        {list.slice(0, limit).map(({ name, sp, meta }) => {
          const isOwned = owned.includes(name);
          return (
            <div key={name} className={`catalog-card${isOwned ? ' owned' : ''}`}>
              {meta && <span className="tier-chip corner" style={{ background: tierColor[meta.tier] }}>{meta.tier}</span>}
              <Sprite species={name} size={72} />
              <b className="catalog-name">{speciesEs(name)}</b>
              <span className="types">{sp.types.map((t) => <TypeBadge key={t} type={t} small />)}</span>
              <span className="muted small">PS {sp.baseStats.hp} · Vel {sp.baseStats.spe}</span>
              <div className="row">
                <button className="small-btn" onClick={() => setInsight(name)} title="Build recomendado y contra quién es fuerte o débil">🛠 Build</button>
                <button className={isOwned ? 'small-btn' : 'small-btn primary'} disabled={isOwned} onClick={() => onRecruit(name)}>
                  {isOwned ? '✓' : 'Reclutar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {list.length === 0 && <div className="empty-state">Ningún Pokémon coincide con la búsqueda.</div>}
      {insight && (
        <InsightModal
          set={metaEntry(insight, format)?.set ?? defaultSet(insight)} format={format} team={team}
          onClose={() => setInsight(null)} onRecruit={onRecruitSet}
        />
      )}
      {list.length > limit && <button className="more" onClick={() => setLimit(limit + PAGE)}>Ver más ({list.length - limit} restantes)</button>}
    </div>
  );
}
