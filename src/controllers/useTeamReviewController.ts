/** Controlador de la vista TeamReview: estado y lógica, sin interfaz. */
import { useMemo, useState } from 'react';
import { type Format } from '../models/data/meta';
import { teamObservations, type Level } from '../models/analysis/observations';
import type { PokemonSet } from '../models/domain/sets';

export function useTeamReviewController(team: PokemonSet[], collection: PokemonSet[], format: Format, inventory: string[]) {
  const obs = useMemo(() => teamObservations(team, collection, format, inventory), [team, collection, format, inventory]);
  const [showLow, setShowLow] = useState(false);
  const counts = (['alta', 'media', 'baja'] as Level[]).map((l) => ({ l, n: obs.filter((o) => o.level === l).length }));
  const visible = showLow ? obs : obs.filter((o) => o.level !== 'baja');
  const inTeam = (sp: string) => team.some((t) => t.species === sp);

  return { obs, showLow, setShowLow, counts, visible, inTeam };
}
