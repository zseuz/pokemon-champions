import { useMemo, useState } from 'react';
import { metaEntry, metaWeight, type Format } from '../data/meta';
import { ALL_SPECIES, getSpecies, TYPE_ES, TYPES } from '../lib/dex';
import { normalize, speciesEs, speciesSearch } from '../lib/es';
import { Sprite, TypeBadge, tierColor } from './common';

const PAGE = 60;

/**
 * Buscador visual de Pokémon: cuadrícula con imágenes que se filtra mientras escribes
 * y con filtro por tipo (hasta 2). Al pulsar un Pokémon se llama a `onPick`.
 */
export function SpeciesGrid({ onPick, format, marked = [], markLabel = 'Añadido', placeholder = 'Escribe el nombre del Pokémon…' }: {
  onPick: (species: string) => void;
  format?: Format;
  /** especies a resaltar (p. ej. ya añadidas) */
  marked?: string[];
  markLabel?: string;
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [limit, setLimit] = useState(PAGE);

  const list = useMemo(() => {
    const needle = normalize(q.trim());
    return ALL_SPECIES
      .map((name) => ({ name, sp: getSpecies(name)!, meta: format ? metaEntry(name, format) : undefined }))
      .filter(({ name, sp }) => (!needle || speciesSearch(name).includes(needle)) && types.every((t) => sp.types.includes(t as never)))
      .sort((a, b) => {
        // los que empiezan por lo escrito primero, luego los del meta, luego alfabético
        if (needle) {
          const sa = normalize(speciesEs(a.name)).startsWith(needle) || normalize(a.name).startsWith(needle) ? 0 : 1;
          const sb = normalize(speciesEs(b.name)).startsWith(needle) || normalize(b.name).startsWith(needle) ? 0 : 1;
          if (sa !== sb) return sa - sb;
        }
        return (b.meta ? metaWeight(b.meta) : -1) - (a.meta ? metaWeight(a.meta) : -1) || a.name.localeCompare(b.name);
      });
  }, [q, types, format]);

  const toggleType = (t: string) => {
    setLimit(PAGE);
    setTypes(types.includes(t) ? types.filter((x) => x !== t) : types.length >= 2 ? [types[1], t] : [...types, t]);
  };

  return (
    <div className="species-grid-box">
      <div className="row wrap">
        <input
          className="catalog-search" placeholder={`🔍 ${placeholder}`} value={q} autoFocus
          onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && list.length) { onPick(list[0].name); setQ(''); } }}
        />
        <span className="muted small">{list.length} Pokémon{list.length && q ? ' · Enter añade el primero' : ''}</span>
      </div>
      <div className="type-filter">
        <span className="muted small">Tipo:</span>
        {TYPES.map((t) => (
          <button key={t} className={`type-toggle${types.includes(t) ? ' on' : ''}`} onClick={() => toggleType(t)} title={TYPE_ES[t]}>
            <TypeBadge type={t} small />
          </button>
        ))}
        {types.length > 0 && <button className="link" onClick={() => setTypes([])}>quitar filtro</button>}
      </div>
      <div className="species-grid">
        {list.slice(0, limit).map(({ name, sp, meta }) => {
          const isMarked = marked.includes(name);
          return (
            <button key={name} className={`species-cell${isMarked ? ' marked' : ''}`} onClick={() => { onPick(name); setQ(''); }} title={`Añadir ${name}`}>
              {meta && <span className="tier-chip corner" style={{ background: tierColor[meta.tier] }}>{meta.tier}</span>}
              {isMarked && <span className="marked-tag">{markLabel}</span>}
              <Sprite species={name} size={56} />
              <span className="species-name">{speciesEs(name)}</span>
              <span className="types">{sp.types.map((t) => <TypeBadge key={t} type={t} small />)}</span>
            </button>
          );
        })}
        {list.length === 0 && <div className="muted small" style={{ padding: 12 }}>Ningún Pokémon coincide.</div>}
      </div>
      {list.length > limit && <button className="more" onClick={() => setLimit(limit + PAGE)}>Ver más ({list.length - limit})</button>}
    </div>
  );
}
