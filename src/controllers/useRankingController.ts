/** Controlador de la vista Ranking: estado y lógica, sin interfaz. */
import { useMemo, useState } from 'react';
import { META_INFOS, metaFor, metaWeight, type Format, type MetaEntry, type Tier } from '../models/data/meta';
import { getSpecies } from '../models/domain/dex';
import { normalize, speciesSearch } from '../models/domain/es';
import { effectiveSpecies } from '../models/domain/sets';

export /** Tiers que se muestran desplegados al entrar (los demás con un botón, para no cargar 262 tarjetas). */
const OPEN_BY_DEFAULT: Tier[] = ['S', 'A', 'B'];

export function useRankingController(format: Format) {
  const META = metaFor(format);
  const META_INFO = META_INFOS[format];
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [insight, setInsight] = useState<MetaEntry | null>(null);
  const [expanded, setExpanded] = useState<Tier[]>(OPEN_BY_DEFAULT);

  const list = useMemo(() => META.filter((e) => {
    const sp = getSpecies(e.set ? effectiveSpecies(e.set, true) : e.species);
    if (q && !speciesSearch(e.species).includes(normalize(q.trim()))) return false;
    if (type && !sp?.types.includes(type as never) && !getSpecies(e.species)?.types.includes(type as never)) return false;
    return true;
  }), [q, type, META]);

  const maxUsage = Math.max(...META.map(metaWeight));
  const filtering = !!q || !!type;

  return { META, META_INFO, q, setQ, type, setType, open, setOpen, insight, setInsight, expanded, setExpanded, list, maxUsage, filtering };
}
