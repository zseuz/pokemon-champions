/** Controlador de la vista MatchupPanel: estado y lógica, sin interfaz. */
import { useMemo } from 'react';
import { type Format } from '../models/data/meta';
import { matchups, recommendBuild, typeProfile } from '../models/analysis/build';
import { getMove } from '../models/domain/dex';
import { type PokemonSet } from '../models/domain/sets';

export function useMatchupController(set: PokemonSet, format: Format) {
  const hasAttacks = set.moves.some((m) => getMove(m)?.basePower);
  const analysed = useMemo(() => (hasAttacks ? set : recommendBuild(set.species, format).set), [set, format, hasAttacks]);
  const data = useMemo(() => matchups(analysed, format), [analysed, format]);
  const types = useMemo(() => typeProfile(analysed), [analysed]);
  return { hasAttacks, analysed, data, types };
}
