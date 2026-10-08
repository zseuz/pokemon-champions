import { metaFor, metaTop, metaWeight, usageLabel, type Format, type MetaEntry } from '../data/meta';
import { computeDamage, createMon, isStatusMove, moveTargetKind, type BattleMon, type BattleState, type SideState } from '../engine/battle';
import { effectiveness, getMove, getSpecies, TYPE_ES, TYPES } from '../domain/dex';
import { STATUS_MOVES } from '../domain/moveEffects';
import { effectiveSpecies, type PokemonSet } from '../domain/sets';

function emptySide(name: string): SideState {
  return { name, team: [], active: [null, null], tailwind: 0, reflect: 0, lightScreen: 0, auroraVeil: 0, megaUsed: false, faintedCount: 0, stealthRock: false, spikes: 0 };
}

/** Estado neutro (sin clima ni campos) para comparar sets fuera de combate. */
export function neutralState(): BattleState {
  return { sides: [emptySide('A'), emptySide('B')], turn: 1, trickRoom: 0, log: [], winner: null, phase: 'choose' };
}

/** Crea el Pokémon ya megaevolucionado si su objeto lo permite (así se ve en combate). */
export function battleMonFor(set: PokemonSet, side: 0 | 1, mega = true): BattleMon {
  const m = createMon(set, side);
  const forme = effectiveSpecies(set, mega);
  if (forme !== set.species) {
    const megaAbility = (getSpecies(forme)?.abilities?.[0] as string) || set.ability;
    const megaSet = createMon({ ...set, species: forme, ability: megaAbility }, side);
    m.species = forme;
    m.types = megaSet.types;
    m.stats = { ...megaSet.stats, hp: m.stats.hp };
    m.ability = megaAbility;
    m.isMega = true;
  }
  return m;
}

const IMMUNE_ABILITY: Record<string, string> = {
  Levitate: 'Ground', 'Flash Fire': 'Fire', 'Water Absorb': 'Water', 'Storm Drain': 'Water', 'Dry Skin': 'Water',
  'Volt Absorb': 'Electric', 'Lightning Rod': 'Electric', 'Motor Drive': 'Electric', 'Sap Sipper': 'Grass', 'Earth Eater': 'Ground',
};

export function defensiveMultiplier(m: BattleMon, atkType: string) {
  if (IMMUNE_ABILITY[m.ability] === atkType) return 0;
  if (m.set.item === 'Air Balloon' && atkType === 'Ground') return 0;
  return effectiveness(atkType, m.types);
}

export interface TypeRow { type: string; mults: number[]; weak: number; resist: number }

export function defensiveChart(team: PokemonSet[]): TypeRow[] {
  const mons = team.map((s) => battleMonFor(s, 0));
  return TYPES.map((type) => {
    const mults = mons.map((m) => defensiveMultiplier(m, type));
    return { type, mults, weak: mults.filter((x) => x > 1).length, resist: mults.filter((x) => x < 1).length };
  });
}

const ATE: Record<string, string> = { Aerilate: 'Flying', Pixilate: 'Fairy', Refrigerate: 'Ice', Galvanize: 'Electric' };

/** Tipo real de un ataque teniendo en cuenta habilidades -ate (Piel Celeste, Piel Feérica…). */
export function attackType(move: string, ability: string): string {
  const t: string = getMove(move)?.type ?? 'Normal';
  return t === 'Normal' && ATE[ability] ? ATE[ability] : t;
}

/** Mejor efectividad que consigue el equipo contra cada tipo (con sus ataques). */
export function offensiveCoverage(team: PokemonSet[]) {
  const mons = team.map((s) => battleMonFor(s, 0));
  return TYPES.map((type) => {
    let best = 0;
    let by = '';
    for (const m of mons) for (const mv of m.set.moves) {
      if (isStatusMove(mv)) continue;
      const e = effectiveness(attackType(mv, m.ability), [type]);
      if (e > best) { best = e; by = `${m.species}: ${mv}`; }
    }
    return { type, best, by };
  });
}

type Role = { id: string; name: string; test: (s: PokemonSet) => boolean };

const has = (s: PokemonSet, moves: string[]) => s.moves.some((m) => moves.includes(m));
const fieldRole: Role = {
  id: 'field', name: 'Clima / Campo',
  test: (s) => ['Drizzle', 'Drought', 'Sand Stream', 'Snow Warning', 'Grassy Surge', 'Psychic Surge', 'Electric Surge', 'Misty Surge'].includes(s.ability) ||
    ['Charizardite Y', 'Tyranitarite', 'Raichunite X'].includes(s.item),
};
const priorityRole: Role = {
  id: 'priority', name: 'Prioridad',
  test: (s) => s.moves.some((m) => (getMove(m)?.priority ?? 0) > 0 && !isStatusMove(m) && m !== 'Fake Out') || s.moves.includes('Grassy Glide'),
};

export const ROLES_BY_FORMAT: Record<Format, Role[]> = {
  doubles: [
    { id: 'fakeout', name: 'Fake Out', test: (s) => s.moves.includes('Fake Out') },
    { id: 'intimidate', name: 'Intimidación', test: (s) => s.ability === 'Intimidate' },
    { id: 'speed', name: 'Control de velocidad', test: (s) => has(s, ['Tailwind', 'Trick Room', 'Icy Wind', 'Electroweb', 'Thunder Wave', 'Rock Tomb', 'Nuzzle']) },
    { id: 'redirect', name: 'Redirección', test: (s) => has(s, ['Follow Me', 'Rage Powder']) || s.ability === 'Lightning Rod' || s.ability === 'Storm Drain' },
    { id: 'spread', name: 'Daño en área', test: (s) => s.moves.some((m) => !isStatusMove(m) && ['spread', 'all'].includes(moveTargetKind(m))) },
    fieldRole,
    priorityRole,
  ],
  singles: [
    { id: 'hazards', name: 'Trampas (Rocas/Púas)', test: (s) => has(s, ['Stealth Rock', 'Spikes', 'Toxic Spikes', 'Sticky Web']) },
    { id: 'pivot', name: 'Pivote (U-turn…)', test: (s) => has(s, ['U-turn', 'Volt Switch', 'Flip Turn', 'Parting Shot', 'Teleport']) || s.ability === 'Emergency Exit' },
    { id: 'setup', name: 'Potenciador (wincon)', test: (s) => s.moves.some((m) => m in STATUS_MOVES.boostsSelf) },
    { id: 'recovery', name: 'Recuperación', test: (s) => s.moves.some((m) => m in STATUS_MOVES.heal) || s.moves.includes('Revival Blessing') },
    { id: 'speed', name: 'Velocidad / Pañuelo', test: (s) => s.item === 'Choice Scarf' || (getSpecies(effectiveSpecies(s, true))?.baseStats.spe ?? 0) >= 110 },
    { id: 'status', name: 'Estados / fases', test: (s) => has(s, ['Will-O-Wisp', 'Thunder Wave', 'Toxic', 'Yawn', 'Whirlwind', 'Roar', 'Dragon Tail', 'Encore', 'Taunt']) },
    priorityRole,
    fieldRole,
  ],
};

export function teamRoles(team: PokemonSet[], format: Format = 'doubles') {
  return ROLES_BY_FORMAT[format].map((r) => ({ ...r, members: team.filter(r.test).map((s) => s.species) }));
}

export interface ThreatRow {
  entry: MetaEntry;
  /** daño máximo (%) que hace a cada miembro */
  toUs: { species: string; pct: number; move: string }[];
  /** nuestro mejor golpe contra él */
  fromUs: { species: string; pct: number; move: string };
  /** nº de miembros a los que hace KO directo (>=100%) */
  ohkos: number;
  danger: number;
}

export function bestHit(state: BattleState, a: BattleMon, d: BattleMon) {
  let best = { pct: 0, move: '' };
  for (const mv of a.set.moves) {
    if (isStatusMove(mv)) continue;
    const r = computeDamage(state, a, d, mv);
    if (r.maxPct > best.pct) best = { pct: r.maxPct, move: mv };
  }
  return best;
}

/**
 * Mayores amenazas del meta para un equipo. `extra` suma peso a especies concretas
 * (p. ej. las que más te ganan en tu historial real).
 */
export function threats(team: PokemonSet[], limit = 12, format: Format = 'doubles', extra: Record<string, number> = {}): ThreatRow[] {
  if (!team.length) return [];
  const state = neutralState();
  const ours = team.map((s) => battleMonFor(s, 0));
  // los 80 más usados del ladder (calcular los 262 sería lento y los últimos casi no aparecen)
  const pool = [...metaTop(format, 80), ...metaFor(format).filter((e) => extra[e.species] && (e.rank ?? 0) > 80)];
  const rows = pool.filter((e) => e.set && !team.some((s) => s.species === e.species)).map((entry) => {
    const foe = battleMonFor(entry.set!, 1);
    const toUs = ours.map((m) => ({ species: m.species, ...bestHit(state, foe, m) }));
    const fromUs = ours.map((m) => ({ species: m.species, ...bestHit(state, m, foe) })).sort((a, b) => b.pct - a.pct)[0];
    const ohkos = toUs.filter((x) => x.pct >= 100).length;
    const danger = toUs.reduce((t, x) => t + Math.min(100, x.pct), 0) / ours.length + ohkos * 10 - Math.min(100, fromUs.pct) / 3 + metaWeight(entry) / 2 + (extra[entry.species] ?? 0);
    return { entry, toUs, fromUs, ohkos, danger };
  });
  return rows.sort((a, b) => b.danger - a.danger).slice(0, limit);
}

export interface Recommendation {
  entry: MetaEntry;
  score: number;
  reasons: string[];
}

export function recommend(team: PokemonSet[], limit = 6, format: Format = 'doubles'): Recommendation[] {
  const chart = defensiveChart(team);
  const missingRoles = teamRoles(team, format).filter((r) => r.members.length === 0);
  const weakTypes = chart.filter((r) => r.weak >= 2 && r.weak > r.resist).map((r) => r.type);
  const teamHasMega = team.some((s) => effectiveSpecies(s, true) !== s.species);
  const topThreats = threats(team, 5, format);
  const state = neutralState();

  const recs = metaTop(format, 80).filter((e) => e.set && !team.some((s) => s.species === e.species)).map((entry) => {
    const set = entry.set!;
    const mon = battleMonFor(set, 0);
    const reasons: string[] = [];
    let score = metaWeight(entry) / 2;
    reasons.push(`Tier ${entry.tier} · ${usageLabel(entry)}`);

    const covers = weakTypes.filter((t) => defensiveMultiplier(mon, t) < 1);
    if (covers.length) {
      score += covers.length * 8;
      reasons.push(`resiste ${covers.map((t) => TYPE_ES[t]).join(', ')} (debilidades de tu equipo)`);
    }
    const addsWeak = weakTypes.filter((t) => defensiveMultiplier(mon, t) > 1);
    if (addsWeak.length) {
      score -= addsWeak.length * 6;
      reasons.push(`⚠ también es débil a ${addsWeak.map((t) => TYPE_ES[t]).join(', ')}`);
    }
    const fills = missingRoles.filter((r) => r.test(set));
    if (fills.length) {
      score += fills.length * 10;
      reasons.push(`aporta: ${fills.map((r) => r.name).join(', ')}`);
    }
    const handles = topThreats.filter((t) => {
      const foe = battleMonFor(t.entry.set!, 1);
      return bestHit(state, mon, foe).pct >= 50 && bestHit(state, foe, mon).pct < 60;
    });
    if (handles.length) {
      score += handles.length * 6;
      reasons.push(`frena amenazas: ${handles.map((t) => t.entry.species).join(', ')}`);
    }
    const partners = (entry.partners ?? []).filter((p) => team.some((s) => s.species === p));
    if (partners.length) {
      score += partners.length * 6;
      reasons.push(`sinergia probada con ${partners.join(', ')}`);
    }
    if (teamHasMega && effectiveSpecies(set, true) !== set.species) {
      score -= 6;
      reasons.push('⚠ ya tienes una Mega (solo 1 puede megaevolucionar por combate)');
    }
    if (team.some((s) => s.item && s.item === set.item)) {
      score -= 4;
      reasons.push(`⚠ objeto repetido (${set.item}): cámbialo por la cláusula de objetos`);
    }
    return { entry, score, reasons };
  });
  return recs.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function teamWarnings(team: PokemonSet[]): string[] {
  const w: string[] = [];
  const items = team.map((s) => s.item).filter(Boolean);
  const dupItems = items.filter((it, i) => items.indexOf(it) !== i);
  if (dupItems.length) w.push(`Objetos repetidos: ${[...new Set(dupItems)].join(', ')} (no se permite en competitivo)`);
  const species = team.map((s) => s.species);
  if (new Set(species).size !== species.length) w.push('Especies repetidas (no se permite en competitivo)');
  const megas = team.filter((s) => effectiveSpecies(s, true) !== s.species).length;
  if (megas > 1) w.push(`${megas} Megas en el equipo: solo una puede megaevolucionar por combate`);
  return w;
}
