/** Controlador de la pestaña Reclutamiento: subpestaña activa y acciones del catálogo. */
import { useState } from 'react';
import type { PokemonSet } from '../models/domain/sets';
import { addSpecies, upsertSet, type BoxEntry } from '../models/repository/store';

export type RecruitSub = 'selection' | 'catalog' | 'synergy' | 'items';

export function useRecruitController(box: BoxEntry[], setBox: (b: BoxEntry[]) => void) {
  const [sub, setSub] = useState<RecruitSub>('selection');
  /** Recluta una especie desde el catálogo. */
  const recruitSpecies = (species: string) => setBox(addSpecies(box, species));
  /** Recluta con un set concreto (p. ej. el build recomendado). */
  const recruitSet = (set: PokemonSet) => setBox(upsertSet(box, set));
  return { sub, setSub, recruitSpecies, recruitSet };
}
