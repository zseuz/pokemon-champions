/** Controlador de la vista Selection: estado y lógica, sin interfaz. */
import { useEffect, useMemo, useState } from 'react';
import { type Format } from '../models/data/meta';
import { blankCandidate, rankCandidates, type CandidateEval } from '../models/analysis/candidates';
import { getSpecies } from '../models/domain/dex';
import { type PokemonSet } from '../models/domain/sets';
import { load, save, setFor, upsertSet, type BoxEntry } from '../models/repository/store';

export const KEY = 'pkmn-champions-candidates';

export function useSelectionController({ format, team, setTeam, box, setBox }: { format: Format; team: PokemonSet[]; setTeam: (t: PokemonSet[]) => void; box: BoxEntry[]; setBox: (b: BoxEntry[]) => void }) {
  const [cands, setCands] = useState<PokemonSet[]>(() => load<PokemonSet[]>(KEY, []));
  const [showGrid, setShowGrid] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [recruited, setRecruited] = useState<string | null>(null);

  useEffect(() => save(KEY, cands), [cands]);

  const collection = useMemo(() => box.map((b) => setFor(b, format)), [box, format]);
  const ready = useMemo(() => cands.filter((c) => c.moves.length > 0), [cands]);
  // tus ejemplares ya configurados, para comparar con los que te ofrece el juego
  const owned = useMemo(() => Object.fromEntries(box.filter((b) => b.set).map((b) => [b.species, b.set!])), [box]);
  const ranked = useMemo(() => rankCandidates(ready, format, team, collection, owned), [ready, format, team, collection, owned]);

  const add = (species: string) => {
    if (!getSpecies(species)) return;
    setCands([...cands, blankCandidate(species)]);
    setEditing(cands.length);
  };

  const recruit = (c: CandidateEval, toTeam: boolean) => {
    if (c.owned && !c.owned.better && !confirm(`Ya tienes un ${c.set.species} igual o mejor (calidad ${c.owned.quality}% frente a ${c.quality}%). ¿Reemplazar tu set por este?`)) return;
    // el ejemplar reclutado pasa a ser tu set de ese Pokémon (para los dos formatos)
    setBox(upsertSet(box, c.set));
    // si ya estaba en el equipo, se actualiza su set (el equipo lo toma de la colección): no se añade repetido
    if (team.some((t) => t.species === c.set.species)) { setRecruited(c.set.species); return; }
    if (toTeam) {
      if (team.length < 6) setTeam([...team, structuredClone(c.set)]);
      else if (c.replaces && c.teamFit > 0) setTeam(team.map((t) => (t.species === c.replaces ? structuredClone(c.set) : t)));
    }
    setRecruited(c.set.species);
  };

  const indexOf = (s: PokemonSet) => cands.indexOf(s);

  return { cands, setCands, showGrid, setShowGrid, editing, setEditing, open, setOpen, recruited, setRecruited, collection, ready, owned, ranked, add, recruit, indexOf };
}
