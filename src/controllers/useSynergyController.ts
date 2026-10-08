import { addToBox } from '../models/repository/store';
/** Controlador de la vista function SynergyView: estado y lógica, sin interfaz. */
import { useMemo, useState } from 'react';
import { metaFor, type Format } from '../models/data/meta';
import { ALL_SPECIES } from '../models/domain/dex';
import { defaultSet, type PokemonSet } from '../models/domain/sets';
import { setFor, type BoxEntry } from '../models/repository/store';
import { rankBySynergy } from '../models/analysis/synergy';

export function useSynergyController({ format, team, setTeam, box, setBox }: { format: Format; team: PokemonSet[]; setTeam: (t: PokemonSet[]) => void; setBox: (b: BoxEntry[]) => void; box: BoxEntry[] }) {
  const [source, setSource] = useState<'meta' | 'all' | 'box'>('meta');
  const [limit, setLimit] = useState(12);

  const candidates = useMemo(() => {
    if (source === 'box') return box.map((b) => setFor(b, format));
    if (source === 'all') return ALL_SPECIES.map((s) => metaFor(format).find((m) => m.species === s)?.set ?? defaultSet(s));
    return metaFor(format).filter((m) => m.set).map((m) => m.set!);
  }, [source, box, format]);

  const ranked = useMemo(() => (team.length ? rankBySynergy(team, candidates, format) : []), [team, candidates, format]);

  /** Recluta (y opcionalmente añade al equipo) un candidato de la lista de sinergias. */
  const recruit = (set: PokemonSet, toTeam: boolean) => {
    setBox(addToBox(box, set));
    if (toTeam && team.length < 6) setTeam([...team, structuredClone(set)]);
  };

  return { recruit, source, setSource, limit, setLimit, candidates, ranked };
}
