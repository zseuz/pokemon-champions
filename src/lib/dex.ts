import { Generations, MEGA_STONES, toID } from '@smogon/calc';
import type { TypeName } from '@smogon/calc/dist/data/interface';

/** Generación 0 = mecánicas de Pokémon Champions en @smogon/calc (nivel 50, Stat Points). */
export const gen = Generations.get(0);

export type { TypeName };

export const TYPES: TypeName[] = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
  'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
];

export const TYPE_ES: Record<string, string> = {
  Normal: 'Normal', Fire: 'Fuego', Water: 'Agua', Electric: 'Eléctrico', Grass: 'Planta', Ice: 'Hielo',
  Fighting: 'Lucha', Poison: 'Veneno', Ground: 'Tierra', Flying: 'Volador', Psychic: 'Psíquico',
  Bug: 'Bicho', Rock: 'Roca', Ghost: 'Fantasma', Dragon: 'Dragón', Dark: 'Siniestro', Steel: 'Acero',
  Fairy: 'Hada', Stellar: 'Astral', '???': '???',
};

export const TYPE_COLOR: Record<string, string> = {
  Normal: '#9fa19f', Fire: '#e62829', Water: '#2980ef', Electric: '#fac000', Grass: '#3fa129',
  Ice: '#3dcef3', Fighting: '#ff8000', Poison: '#9141cb', Ground: '#915121', Flying: '#81b9ef',
  Psychic: '#ef4179', Bug: '#91a119', Rock: '#afa981', Ghost: '#704170', Dragon: '#5060e1',
  Dark: '#624d4e', Steel: '#60a1b8', Fairy: '#ef70ef',
};

export const STAT_ES = { hp: 'PS', atk: 'Ata', def: 'Def', spa: 'AtEsp', spd: 'DefEsp', spe: 'Vel' } as const;
export type StatID = keyof typeof STAT_ES;
export const STATS: StatID[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export const id = (s: string) => toID(s) as string;

export function getSpecies(name: string) {
  return gen.species.get(toID(name));
}
export function getMove(name: string) {
  return gen.moves.get(toID(name));
}
export function getItem(name: string) {
  return gen.items.get(toID(name));
}

/** Especies jugables (sin formas Mega, que se obtienen con su megapiedra). */
export const ALL_SPECIES = [...gen.species]
  .filter((s) => !/-Mega/.test(s.name))
  .map((s) => s.name as string)
  .sort();
export const ALL_MOVES = [...gen.moves].filter((m) => m.name !== '(No Move)').map((m) => m.name as string).sort();
export const ALL_ITEMS = [...gen.items].map((i) => i.name as string).sort();
export const ALL_ABILITIES = [...gen.abilities].map((a) => a.name as string).sort();
export const NATURES = [...gen.natures].map((n) => ({ name: n.name as string, plus: n.plus, minus: n.minus }));

/** Forma Mega a la que evoluciona `species` con `item`, si aplica. */
export function megaForme(species: string, item?: string): string | undefined {
  if (!item) return;
  const map = (MEGA_STONES as Record<string, Record<string, string>>)[item];
  if (!map) return;
  const base = getSpecies(species);
  return map[species] ?? (base?.baseSpecies ? map[base.baseSpecies] : undefined);
}

/** Multiplicador de efectividad de un tipo de ataque contra una lista de tipos defensivos. */
export function effectiveness(atk: string, defTypes: readonly string[]): number {
  const t = gen.types.get(toID(atk));
  if (!t) return 1;
  return defTypes.reduce((m, d) => m * ((t.effectiveness as Record<string, number>)[d] ?? 1), 1);
}

/** ID de sprite de Showdown: "Charizard-Mega-Y" → "charizard-megay". */
export function spriteId(name: string): string {
  const base = getSpecies(name)?.baseSpecies;
  if (!base || !name.startsWith(base + '-')) return toID(name);
  return `${toID(base)}-${toID(name.slice(base.length + 1))}`;
}
