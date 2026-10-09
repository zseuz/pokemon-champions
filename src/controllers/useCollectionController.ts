/** Controlador de la vista Collection: estado y lógica, sin interfaz. */
import { useMemo, useState } from 'react';
import { metaEntry, metaWeight, type Format } from '../models/data/meta';
import { getSpecies } from '../models/domain/dex';
import { assignItems } from '../models/analysis/items';
import { effectiveSpecies, type PokemonSet } from '../models/domain/sets';
import { addSpecies, isCustom, setFor, upsertSet, type BoxEntry } from '../models/repository/store';
import { keepTrial, trials, type TrialStatus } from '../models/repository/trial';
import { autoBuild, collectionAdvice, type BuiltTeam } from '../models/analysis/synergy';

export type Sort = 'fit' | 'meta' | 'name' | 'bst';

export function useCollectionController({ format, team, setTeam, box, setBox, inventory }: { format: Format; team: PokemonSet[]; setTeam: (t: PokemonSet[]) => void; box: BoxEntry[]; setBox: (b: BoxEntry[]) => void; inventory: string[] }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState<Sort>('fit');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [locked, setLocked] = useState<string[]>([]);
  const [size, setSize] = useState(6);
  const [built, setBuilt] = useState<BuiltTeam[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState('');

  const sets = useMemo(() => box.map((b) => setFor(b, format)), [box, format]);
  const advice = useMemo(() => collectionAdvice(team, sets, format), [team, sets, format]);
  const fitOf = (species: string) => advice.fits.find((f) => f.set.species === species);

  // resumen de la colección
  const typeCount = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of sets) for (const t of getSpecies(effectiveSpecies(s, true))?.types ?? []) c[t] = (c[t] ?? 0) + 1;
    return c;
  }, [sets]);
  const megaCount = sets.filter((s) => effectiveSpecies(s, true) !== s.species).length;
  const metaCount = sets.filter((s) => metaEntry(s.species, format)).length;

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const bst = (s: PokemonSet) => Object.values(getSpecies(effectiveSpecies(s, true))?.baseStats ?? {}).reduce((t, v) => t + v, 0);
    return sets
      .filter((s) => (!needle || s.species.toLowerCase().includes(needle)) && (!type || getSpecies(effectiveSpecies(s, true))?.types.includes(type as never) || getSpecies(s.species)?.types.includes(type as never)))
      .sort((a, b) => {
        const inA = team.some((t) => t.species === a.species);
        const inB = team.some((t) => t.species === b.species);
        if (sort === 'fit') return (inB ? 1e6 : fitOf(b.species)?.fit ?? -1e6) - (inA ? 1e6 : fitOf(a.species)?.fit ?? -1e6);
        if (sort === 'name') return a.species.localeCompare(b.species);
        if (sort === 'bst') return bst(b) - bst(a);
        const w = (s: PokemonSet) => { const m = metaEntry(s.species, format); return m ? metaWeight(m) : -1; };
        return w(b) - w(a);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets, q, type, sort, advice, team, format]);

  const inTeam = (sp: string) => team.some((t) => t.species === sp);
  const addToTeam = (s: PokemonSet) => team.length < 6 && !inTeam(s.species) && setTeam([...team, structuredClone(s)]);
  const swap = (out: string, s: PokemonSet) => setTeam(team.map((t) => (t.species === out ? structuredClone(s) : t)));

  const build = () => {
    setBusy(true);
    setTimeout(() => {
      const lockIdx = sets.map((s, i) => (locked.includes(s.species) ? i : -1)).filter((i) => i >= 0);
      setBuilt(autoBuild(sets, format, size, lockIdx, 3));
      setBusy(false);
    }, 20);
  };
  const applyBuilt = (t: BuiltTeam, withItems: boolean) => {
    let members = t.members.map((m) => structuredClone(m));
    if (withItems && inventory.length) {
      const { assignments } = assignItems(members, inventory, format);
      members = members.map((m, i) => ({ ...m, item: assignments[i].item ?? '' }));
    }
    setTeam(members);
  };

  /** Recluta una especie (sin set propio: usa el del meta hasta que lo configures). */
  const recruitSpecies = (species: string) => setBox(addSpecies(box, species));
  /** Guarda tu set de un Pokémon (lo usan los equipos de los dos formatos). */
  const saveSet = (s: PokemonSet) => setBox(upsertSet(box, s));
  const removeFromCollection = (species: string) => setBox(box.filter((b) => b.species !== species));

  // ── Reclutados de prueba (7 días) ──
  const [now] = useState(() => Date.now());
  const trialList = useMemo(() => trials(box, now), [box, now]);
  const trialOf = (species: string): TrialStatus | undefined => trialList.find((t) => t.species === species);
  const expiredTrials = trialList.filter((t) => t.expired);
  /** «Quedármelo»: la prueba pasa a ser un reclutamiento definitivo */
  const keep = (species: string) => setBox(keepTrial(box, species));
  /** Termina la prueba sin quedárselo: sale de la colección y de los equipos */
  const releaseTrial = (species: string) => {
    if (inTeam(species)) setTeam(team.filter((t) => t.species !== species));
    setBox(box.filter((b) => b.species !== species));
  };
  const editingEntry = box.find((b) => b.species === editing);
  const editingSet = editingEntry ? setFor(editingEntry, format) : null;
  const isCustomEntry = (species: string) => isCustom(box.find((b) => b.species === species));

  return { trialList, trialOf, expiredTrials, keep, releaseTrial, recruitSpecies, saveSet, removeFromCollection, editingSet, isCustomEntry, q, setQ, type, setType, sort, setSort, expanded, setExpanded, editing, setEditing, locked, setLocked, size, setSize, built, setBuilt, busy, setBusy, adding, setAdding, sets, advice, fitOf, typeCount, megaCount, metaCount, list, inTeam, addToTeam, swap, build, applyBuilt };
}
