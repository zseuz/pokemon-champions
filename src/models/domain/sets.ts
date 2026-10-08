import { Pokemon } from '@smogon/calc';
import { rankAbilities } from './abilities';
import { gen, getItem, getMove, getSpecies, megaForme, STATS, type StatID } from './dex';

export type SP = Record<StatID, number>;

export interface PokemonSet {
  species: string;
  ability: string;
  item: string;
  nature: string;
  /** Stat Points de Champions: máximo 32 por stat y 66 en total. */
  sp: SP;
  moves: string[];
}

export const SP_MAX_STAT = 32;
export const SP_MAX_TOTAL = 66;

export const emptySP = (): SP => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });

export function spTotal(sp: SP) {
  return STATS.reduce((t, s) => t + (sp[s] || 0), 0);
}

export function validateSet(set: PokemonSet): string[] {
  const errs: string[] = [];
  if (!getSpecies(set.species)) errs.push(`Especie desconocida: ${set.species}`);
  if (spTotal(set.sp) > SP_MAX_TOTAL) errs.push(`Stat Points: ${spTotal(set.sp)}/${SP_MAX_TOTAL}`);
  for (const s of STATS) if (set.sp[s] > SP_MAX_STAT) errs.push(`${s} supera ${SP_MAX_STAT} SP`);
  if (set.moves.filter(Boolean).length === 0) errs.push('Sin movimientos');
  for (const m of set.moves) if (m && !getMove(m)) errs.push(`Movimiento desconocido: ${m}`);
  if (set.item && !getItem(set.item)) errs.push(`Objeto desconocido: ${set.item}`);
  return errs;
}

/** Set por defecto para una especie sin datos del meta: reparte SP según su mejor stat ofensivo. */
export function defaultSet(species: string): PokemonSet {
  const s = getSpecies(species);
  const bs = s?.baseStats ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const physical = bs.atk >= bs.spa;
  const base: PokemonSet = {
    species,
    ability: (s?.abilities?.[0] as string) || '',
    item: 'Sitrus Berry',
    nature: physical ? 'Adamant' : 'Modest',
    sp: { ...emptySP(), hp: 32, [physical ? 'atk' : 'spa']: 32, spe: 2 },
    moves: ['Protect'],
  };
  // la habilidad legal mejor valorada (p. ej. Glaceon → Gélido en vez de Manto Níveo)
  const best = rankAbilities(base, 'doubles')[0];
  return best ? { ...base, ability: best.ability } : base;
}

export interface BattleOverrides {
  mega?: boolean;
  curHP?: number;
  boosts?: Partial<Record<StatID, number>>;
  status?: '' | 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz';
  item?: string;
  ability?: string;
  alliesFainted?: number;
}

/** Nombre de la especie efectiva (Mega si corresponde). */
export function effectiveSpecies(set: PokemonSet, mega = false) {
  return (mega && megaForme(set.species, set.item)) || set.species;
}

export function toCalcPokemon(set: PokemonSet, o: BattleOverrides = {}) {
  const name = effectiveSpecies(set, o.mega);
  const isMega = name !== set.species;
  const ability = o.ability ?? (isMega ? (getSpecies(name)?.abilities?.[0] as string) : set.ability);
  return new Pokemon(gen, name, {
    ability: ability || undefined,
    item: (o.item ?? set.item) || undefined,
    nature: set.nature,
    evs: set.sp,
    boosts: o.boosts,
    status: o.status || '',
    curHP: o.curHP,
    alliesFainted: o.alliesFainted,
    moves: set.moves.filter(Boolean),
  });
}

/** Stats finales a nivel 50 (Champions). */
export function finalStats(set: PokemonSet, mega = false) {
  return toCalcPokemon(set, { mega }).rawStats as Record<StatID, number>;
}

export function canMega(set: PokemonSet) {
  return !!megaForme(set.species, set.item);
}
