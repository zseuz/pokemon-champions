/**
 * Recomendación de objetos: puntúa cada objeto de tu inventario para cada miembro del equipo
 * y busca el reparto que maximiza el total respetando la cláusula de objetos (cada objeto una vez).
 */
import { metaEntry, metaFor, metaWeight, type Format } from '../data/meta';
import { isStatusMove } from '../engine/battle';
import { effectiveness, getSpecies, megaForme, TYPE_ES } from '../domain/dex';
import { STATUS_MOVES } from '../domain/moveEffects';
import type { PokemonSet } from '../domain/sets';
import { itemEs } from '../domain/es';
import { attackType } from './teamAnalysis';
import { profile } from './synergy';

export const ITEM_ES: Record<string, string> = {
  'Sitrus Berry': 'Baya Zidra', Leftovers: 'Restos', 'Life Orb': 'Vidasfera', 'Focus Sash': 'Banda Focus',
  'Choice Scarf': 'Pañuelo Elección', 'Rocky Helmet': 'Casco Dentado', 'Light Clay': 'Refleluz', 'White Herb': 'Hierba Blanca',
  'Lum Berry': 'Baya Ziuela', 'Air Balloon': 'Globo Helio', 'Mental Herb': 'Hierba Mental', 'Expert Belt': 'Cinta Experto',
  'Eject Button': 'Botón Escape', 'Red Card': 'Tarjeta Roja', 'Terrain Extender': 'Cubresuelos', 'Muscle Band': 'Cinta Fuerte',
  'Wise Glasses': 'Gafas Especiales', 'Scope Lens': 'Periscopio', 'Wide Lens': 'Lupa', 'Shell Bell': 'Campana Concha',
  'Quick Claw': 'Garra Rápida', 'Bright Powder': 'Polvo Brillo', 'King\'s Rock': 'Roca del Rey', 'Big Root': 'Raíz Grande',
};

const TYPE_ITEM: Record<string, string> = {
  Charcoal: 'Fire', 'Mystic Water': 'Water', 'Miracle Seed': 'Grass', Magnet: 'Electric', 'Never-Melt Ice': 'Ice',
  'Black Belt': 'Fighting', 'Poison Barb': 'Poison', 'Soft Sand': 'Ground', 'Sharp Beak': 'Flying', 'Twisted Spoon': 'Psychic',
  'Silver Powder': 'Bug', 'Hard Stone': 'Rock', 'Spell Tag': 'Ghost', 'Dragon Fang': 'Dragon', 'Black Glasses': 'Dark',
  'Metal Coat': 'Steel', 'Fairy Feather': 'Fairy', 'Silk Scarf': 'Normal', 'Normal Gem': 'Normal',
};
const RESIST_BERRY: Record<string, string> = {
  'Chople Berry': 'Fighting', 'Occa Berry': 'Fire', 'Passho Berry': 'Water', 'Wacan Berry': 'Electric',
  'Rindo Berry': 'Grass', 'Yache Berry': 'Ice', 'Kebia Berry': 'Poison', 'Shuca Berry': 'Ground',
  'Coba Berry': 'Flying', 'Payapa Berry': 'Psychic', 'Tanga Berry': 'Bug', 'Charti Berry': 'Rock',
  'Kasib Berry': 'Ghost', 'Haban Berry': 'Dragon', 'Colbur Berry': 'Dark', 'Babiri Berry': 'Steel',
  'Roseli Berry': 'Fairy', 'Chilan Berry': 'Normal',
};
const WEATHER_ROCK: Record<string, string> = { 'Heat Rock': 'Sun', 'Damp Rock': 'Rain', 'Smooth Rock': 'Sand', 'Icy Rock': 'Snow' };
const SEED: Record<string, string> = { 'Grassy Seed': 'Grassy', 'Psychic Seed': 'Psychic', 'Electric Seed': 'Electric', 'Misty Seed': 'Misty' };
const SELF_DROP = ['Close Combat', 'Draco Meteor', 'Make It Rain', 'Overheat', 'Leaf Storm', 'Superpower', 'Shell Smash', 'Armor Cannon', 'Headlong Rush'];

export const itemName = (i: string) => {
  const es = ITEM_ES[i] ?? itemEs(i);
  return es && es !== i ? `${es} (${i})` : i;
};

/** Reparto de tipos de ataque en el meta (para valorar bayas que reducen daño). */
function metaAttackShare(format: Format): Record<string, number> {
  const w: Record<string, number> = {};
  let total = 0;
  for (const e of metaFor(format)) {
    if (!e.set) continue;
    for (const m of e.set.moves) {
      if (isStatusMove(m)) continue;
      const t = attackType(m, e.set.ability);
      w[t] = (w[t] ?? 0) + metaWeight(e);
      total += metaWeight(e);
    }
  }
  for (const k of Object.keys(w)) w[k] /= total;
  return w;
}
const shareCache: Partial<Record<Format, Record<string, number>>> = {};

export interface ItemScore { item: string; score: number; reason: string; mega: boolean }

/** Puntúa un objeto para un set dentro de un equipo. */
export function scoreItem(set: PokemonSet, item: string, team: PokemonSet[], format: Format): ItemScore {
  const p = profile({ ...set, item: '' });
  const bs = getSpecies(set.species)!.baseStats;
  const atkMoves = set.moves.filter((m) => !isStatusMove(m));
  const statusMoves = set.moves.filter((m) => isStatusMove(m));
  const offense = Math.max(bs.atk, bs.spa);
  const physicalBulk = (bs.hp * bs.def) / 100;
  const specialBulk = (bs.hp * bs.spd) / 100;
  const frail = bs.hp * (bs.def + bs.spd) < 2 * 75 * 85;
  const dbl = format === 'doubles';
  const share = (shareCache[format] ??= metaAttackShare(format));
  const r = (score: number, reason: string, mega = false): ItemScore => ({ item, score, reason, mega });

  const forme = megaForme(set.species, item);
  if (forme) return r(100, `megapiedra: evoluciona a ${forme}`, true);
  if (/ite( [XYZ])?$/.test(item) && !forme) return r(-100, 'megapiedra de otro Pokémon');

  const meta = metaEntry(set.species, format)?.set?.item === item ? 25 : 0;
  const metaTxt = meta ? ' · es el objeto más usado en el meta' : '';

  if (TYPE_ITEM[item]) {
    const t = TYPE_ITEM[item];
    const n = p.atkTypes.filter((x) => x === t).length;
    if (!n) return r(meta - 5, `no tiene ataques ${TYPE_ES[t]}`);
    const stab = p.types.includes(t);
    return r(meta + 10 + n * 6 + (stab ? 8 : 0) + offense / 20, `potencia x1.2 sus ${n} ataque(s) ${TYPE_ES[t]}${stab ? ' con STAB' : ''}${metaTxt}`);
  }
  if (RESIST_BERRY[item]) {
    const t = RESIST_BERRY[item];
    const mult = effectiveness(t, p.types);
    if (item === 'Chilan Berry') return r(meta + 2 + (share[t] ?? 0) * 25, `reduce a la mitad un golpe Normal (${Math.round((share[t] ?? 0) * 100)}% de los ataques del meta)`);
    if (mult < 2) return r(meta - 5, `no es débil a ${TYPE_ES[t]}`);
    const s = (mult >= 4 ? 30 : 10) + (share[t] ?? 0) * 120;
    return r(meta + s, `reduce a la mitad un golpe ${TYPE_ES[t]}${mult >= 4 ? ' (¡débil x4!)' : ''}, ${Math.round((share[t] ?? 0) * 100)}% de los ataques del meta${metaTxt}`);
  }
  if (WEATHER_ROCK[item]) {
    return p.setsWeather === WEATHER_ROCK[item] ? r(meta + 28, 'alarga su clima a 8 turnos') : r(-10, 'no provoca ese clima');
  }
  if (SEED[item]) {
    const terrainOnTeam = team.some((m) => profile(m).setsTerrain === SEED[item]);
    if (!terrainOnTeam) return r(-10, `nadie en tu equipo activa el campo ${SEED[item]}`);
    const unburden = set.ability === 'Unburden';
    return r(meta + (unburden ? 40 : 14), `se activa con el campo de tu equipo${unburden ? ' y Unburden duplica su velocidad' : ''}${metaTxt}`);
  }

  switch (item) {
    case 'Life Orb':
      return r(meta + (atkMoves.length >= 3 ? 14 + offense / 8 : 2) - (frail ? 0 : 3), atkMoves.length >= 3 ? `+30% de daño a cambio de 10% PS por ataque${metaTxt}` : 'pocos ataques para aprovecharla');
    case 'Choice Scarf': {
      const lockedOk = statusMoves.filter((m) => !['U-turn', 'Volt Switch', 'Flip Turn'].includes(m)).length === 0;
      if (!lockedOk) return r(meta - 10, 'usa movimientos de estado/Protect: el Pañuelo le bloquea');
      const mid = bs.spe >= 70 && bs.spe <= 115;
      return r(meta + (mid ? 26 : 12) + offense / 15, `+50% velocidad${mid ? ': supera a la mayoría de rivales' : ''}${metaTxt}`);
    }
    case 'Focus Sash':
      return r(meta + (frail ? 26 : 6) + (dbl ? 0 : 4) + (set.moves.some((m) => ['Stealth Rock', 'Tailwind', 'Trick Room'].includes(m)) ? 8 : 0),
        frail ? `es frágil: la Banda Focus le asegura un turno${metaTxt}` : 'aguanta bien sin ella');
    case 'Sitrus Berry':
      return r(meta + 12 + (physicalBulk + specialBulk) / 40 + (statusMoves.length >= 2 ? 6 : 0), `cura 25% PS a mitad de vida; ideal para tanques y soportes${metaTxt}`);
    case 'Leftovers':
      return r(meta + 8 + (physicalBulk + specialBulk) / 45 + (set.moves.some((m) => STATUS_MOVES.protect.includes(m)) ? 6 : 0) + (dbl ? 0 : 8), `recupera 1/16 PS por turno${dbl ? '' : ' (muy bueno en individuales)'}${metaTxt}`);
    case 'Rocky Helmet':
      return r(meta + physicalBulk / 25 + (bs.def >= 100 ? 8 : 0), `castiga los ataques de contacto${bs.def >= 100 ? ' y tiene buena Defensa' : ''}${metaTxt}`);
    case 'Light Clay':
      return set.moves.some((m) => m in STATUS_MOVES.screens) ? r(meta + 38, 'pantallas 8 turnos en vez de 5') : r(-15, 'no usa Reflejo/Pantalla Luz/Velo Aurora');
    case 'Terrain Extender':
      return p.setsTerrain ? r(meta + 24, 'su campo dura 8 turnos') : r(-15, 'no activa ningún campo');
    case 'White Herb': {
      const drops = set.moves.filter((m) => SELF_DROP.includes(m));
      if (!drops.length) return r(meta - 2, 'no se baja stats a sí mismo');
      return r(meta + 18 + (set.ability === 'Unburden' ? 20 : 0), `restaura las bajadas de ${drops.join('/')}${set.ability === 'Unburden' ? ' y activa Unburden' : ''}${metaTxt}`);
    }
    case 'Air Balloon': {
      const ground = effectiveness('Ground', p.types);
      return ground > 1 && set.ability !== 'Levitate' ? r(meta + 14 + ground * 3, `inmune a Tierra hasta que lo golpeen (débil x${ground})${metaTxt}`) : r(-5, 'no es débil a Tierra');
    }
    case 'Lum Berry':
      return r(meta + 8 + (set.moves.some((m) => m in STATUS_MOVES.boostsSelf) ? 8 : 0), 'cura un estado (sueño, quemadura, parálisis…)');
    case 'Mental Herb':
      return set.moves.some((m) => ['Trick Room', 'Tailwind', 'Follow Me', 'Rage Powder'].includes(m)) ? r(meta + 14, 'evita una Mofa/Otra Vez al preparar') : r(0, 'no depende de apoyo');
    case 'Expert Belt':
      return r(meta + (new Set(p.atkTypes).size >= 3 ? 14 : 4), 'potencia x1.2 los golpes súper eficaces');
    case 'Muscle Band':
      return r(meta + (p.physical && atkMoves.length >= 2 ? 10 : 0), 'potencia sus ataques físicos');
    case 'Wise Glasses':
      return r(meta + (!p.physical && atkMoves.length >= 2 ? 10 : 0), 'potencia sus ataques especiales');
    case 'Eject Button':
      return r(meta + (dbl ? 8 : 6) + (statusMoves.length >= 2 ? 4 : 0), 'sale del combate al recibir un golpe');
    case 'Shell Bell':
      return r(meta + (atkMoves.length >= 3 ? 6 : 0), 'recupera PS al hacer daño');
    case 'Big Root':
      return r(meta + (set.moves.some((m) => ['Drain Punch', 'Giga Drain', 'Leech Life', 'Matcha Gotcha', 'Horn Leech', 'Strength Sap'].includes(m)) ? 12 : 0), 'potencia los movimientos que drenan');
    case 'Light Ball':
      return set.species === 'Pikachu' ? r(60, 'duplica el ataque de Pikachu') : r(-20, 'solo sirve a Pikachu');
    case 'Leek':
      return set.species.startsWith('Farfetch') || set.species.startsWith('Sirfetch') ? r(40, 'golpes críticos') : r(-20, "solo sirve a Farfetch'd/Sirfetch'd");
    default:
      if (/Berry$/.test(item)) return r(meta + 3, 'baya de un solo uso');
      return r(meta + 2, 'efecto menor');
  }
}

export interface Assignment {
  species: string;
  item: string | null;
  score: number;
  reason: string;
  alternatives: ItemScore[];
}

/**
 * Busca el mejor reparto: cada miembro recibe como mucho un objeto y cada objeto se usa una vez.
 * Las megapiedras puntúan menos a partir de la segunda (solo una Mega por combate).
 */
export function assignItems(team: PokemonSet[], inventory: string[], format: Format): { assignments: Assignment[]; total: number } {
  const items = [...new Set(inventory)];
  const scored = team.map((s) => items.map((it) => scoreItem(s, it, team, format)).sort((a, b) => b.score - a.score));
  const K = 8;
  const cand = scored.map((list) => list.filter((x) => x.score > 0).slice(0, K));
  const MEGA_DECAY = [1, 0.55, 0.25, 0.1, 0.05, 0.05];

  let best: { total: number; pick: (ItemScore | null)[] } = { total: -Infinity, pick: [] };
  const used = new Set<string>();
  const pick: (ItemScore | null)[] = [];
  // ordenar miembros por menos opciones primero acelera la poda
  const order = team.map((_, i) => i).sort((a, b) => cand[a].length - cand[b].length);
  const optimistic = order.map((i) => cand[i][0]?.score ?? 0);
  const suffix = optimistic.map((_, k) => optimistic.slice(k).reduce((t, x) => t + Math.max(0, x), 0));

  const rec = (k: number, total: number, megas: number) => {
    if (k === order.length) {
      if (total > best.total) best = { total, pick: [...pick] };
      return;
    }
    if (total + suffix[k] <= best.total) return;
    const i = order[k];
    for (const c of cand[i]) {
      if (used.has(c.item)) continue;
      const s = c.mega ? c.score * MEGA_DECAY[megas] : c.score;
      used.add(c.item);
      pick[i] = c;
      rec(k + 1, total + s, megas + (c.mega ? 1 : 0));
      used.delete(c.item);
    }
    pick[i] = null;
    rec(k + 1, total, megas);
  };
  rec(0, 0, 0);

  const assignments = team.map((s, i) => {
    const p = best.pick[i] ?? null;
    return {
      species: s.species,
      item: p?.item ?? null,
      score: p?.score ?? 0,
      reason: p?.reason ?? (cand[i].length ? 'sus mejores objetos los usan otros miembros' : 'ningún objeto de tu inventario le aporta nada'),
      alternatives: scored[i].filter((x) => x.item !== p?.item && x.score > 0).slice(0, 3),
    };
  });
  return { assignments, total: best.total };
}

/** Objetos que usan los sets del meta del formato (para rellenar rápido el inventario). */
export function metaItems(format: Format): string[] {
  return [...new Set(metaFor(format).map((e) => e.set?.item).filter((x): x is string => !!x))].sort();
}

export const COMMON_ITEMS = [
  'Sitrus Berry', 'Leftovers', 'Life Orb', 'Focus Sash', 'Choice Scarf', 'Rocky Helmet', 'Light Clay', 'White Herb',
  'Lum Berry', 'Air Balloon', 'Mental Herb', 'Expert Belt', 'Eject Button', 'Terrain Extender',
];

