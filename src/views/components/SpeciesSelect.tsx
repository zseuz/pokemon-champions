import { useEffect, useMemo, useRef, useState } from 'react';
import { metaEntry, type Format } from '../../models/data/meta';
import { ALL_SPECIES, getSpecies } from '../../models/domain/dex';
import { normalize, speciesEs, speciesSearch } from '../../models/domain/es';
import { Sprite, TypeBadge } from './common';
import { tierColor } from '../theme';

const MAX = 40;

/**
 * Selector de Pokémon con buscador: escribes y debajo se filtra la lista con imágenes.
 * Primero los más usados del formato. Flechas ↑↓ + Enter para elegir con el teclado.
 */
export function SpeciesSelect({ value, onChange, format, placeholder = 'Escribe el Pokémon…', exclude = [] }: {
  value: string;
  onChange: (species: string) => void;
  format: Format;
  placeholder?: string;
  exclude?: string[];
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const all = useMemo(() => ALL_SPECIES
    .map((name) => ({ name, meta: metaEntry(name, format) }))
    .sort((a, b) => (a.meta?.rank ?? 999) - (b.meta?.rank ?? 999) || a.name.localeCompare(b.name)), [format]);

  const list = useMemo(() => {
    const needle = normalize(q.trim());
    const filtered = all.filter((x) => !exclude.includes(x.name) && (!needle || speciesSearch(x.name).includes(needle)));
    if (needle) {
      // los que empiezan por lo escrito, primero
      filtered.sort((a, b) => Number(!normalize(speciesEs(a.name)).startsWith(needle)) - Number(!normalize(speciesEs(b.name)).startsWith(needle)));
    }
    return filtered.slice(0, MAX);
  }, [all, q, exclude]);

  useEffect(() => { listRef.current?.children[hi]?.scrollIntoView({ block: 'nearest' }); }, [hi]);

  const pick = (name: string) => { onChange(name); setQ(''); setOpen(false); };

  return (
    <div className="species-select" ref={ref}>
      <div className={`ss-field${open ? ' open' : ''}`} onClick={() => setOpen(true)}>
        {value && !open && <Sprite species={value} size={28} />}
        <input
          value={open ? q : value ? speciesEs(value) : ''}
          placeholder={open && value ? speciesEs(value) : placeholder}
          onFocus={() => { setOpen(true); setHi(0); }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi(Math.min(hi + 1, list.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(hi - 1, 0)); }
            else if (e.key === 'Enter' && list[hi]) { e.preventDefault(); pick(list[hi].name); (e.target as HTMLInputElement).blur(); }
            else if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); }
          }}
        />
        <span className="caret">▾</span>
      </div>
      {open && (
        <div className="ss-pop" ref={listRef}>
          {list.length === 0 && <div className="muted small ss-empty">Ningún Pokémon coincide</div>}
          {list.map((x, i) => {
            const types = getSpecies(x.name)?.types ?? [];
            return (
              <button
                key={x.name} type="button" className={`ss-opt${i === hi ? ' hi' : ''}${x.name === value ? ' sel' : ''}`}
                onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(x.name)}
              >
                <Sprite species={x.name} size={36} />
                <span className="ss-name">{speciesEs(x.name)}</span>
                <span className="types">{types.map((t) => <TypeBadge key={t} type={t} small />)}</span>
                {x.meta && <span className="tier-chip" style={{ background: tierColor[x.meta.tier] }}>{x.meta.tier} #{x.meta.rank}</span>}
              </button>
            );
          })}
          {!q && <div className="muted small ss-empty">Escribe para buscar entre los {ALL_SPECIES.length} Pokémon</div>}
        </div>
      )}
    </div>
  );
}
