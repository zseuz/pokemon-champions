/** Controlador de la vista TeamBuilder: estado y lógica, sin interfaz. */
import { useMemo, useState } from 'react';
import { metaEntry, type Format } from '../models/data/meta';
import { getSpecies } from '../models/domain/dex';
import { defaultSet, type PokemonSet } from '../models/domain/sets';
import { defensiveChart, offensiveCoverage, recommend, teamRoles, teamWarnings, threats } from '../models/analysis/teamAnalysis';

export function useTeamBuilderController({ team, setTeam, format, onRecruit }: { team: PokemonSet[]; setTeam: (t: PokemonSet[]) => void; format: Format; onRecruit: (s: PokemonSet) => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState('');

  const chart = useMemo(() => defensiveChart(team), [team]);
  const coverage = useMemo(() => offensiveCoverage(team), [team]);
  const roles = useMemo(() => teamRoles(team, format), [team, format]);
  const warns = useMemo(() => teamWarnings(team), [team]);
  const threatRows = useMemo(() => threats(team, 8, format), [team, format]);
  const recs = useMemo(() => (team.length < 6 ? recommend(team, 6, format) : []), [team, format]);

  const add = (species: string) => {
    if (!getSpecies(species) || team.length >= 6) return;
    const set = structuredClone(metaEntry(species, format)?.set ?? defaultSet(species));
    setTeam([...team, set]);
    onRecruit(set);
    setAdding('');
    if (!metaEntry(species, format)?.set) setEditing(team.length);
  };

  return { editing, setEditing, adding, setAdding, chart, coverage, roles, warns, threatRows, recs, add };
}
