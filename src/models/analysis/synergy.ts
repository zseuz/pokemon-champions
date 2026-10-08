/**
 * Sinergia entre Pokémon basada en sus habilidades (y los movimientos que las aprovechan),
 * y armado automático del mejor equipo a partir de los Pokémon reclutados.
 */
import { metaEntry, metaWeight, type Format } from '../data/meta';
import { isStatusMove, moveTargetKind } from '../engine/battle';
import { getSpecies, TYPE_ES, TYPES } from '../domain/dex';
import { STATUS_MOVES } from '../domain/moveEffects';
import { effectiveSpecies, type PokemonSet } from '../domain/sets';
import { attackType, battleMonFor, defensiveMultiplier, ROLES_BY_FORMAT } from './teamAnalysis';

/** Datos precalculados de un set para evaluar sinergias rápido. */
export interface Profile {
  set: PokemonSet;
  name: string;
  /** habilidad base y, si tiene megapiedra, la de su Mega */
  abilities: string[];
  types: string[];
  baseSpe: number;
  physical: boolean;
  bulk: number;
  /** mayor stat ofensivo base */
  offense: number;
  moves: Set<string>;
  /** tipos de sus ataques (con habilidades -ate aplicadas) */
  atkTypes: string[];
  setsWeather?: 'Rain' | 'Sun' | 'Sand' | 'Snow';
  setsTerrain?: 'Grassy' | 'Psychic' | 'Electric' | 'Misty';
  setup: boolean;
  /** movimientos que golpean también al aliado (Terremoto, Surf…) */
  allHit: string[];
  weak: (t: string) => number;
}

const WEATHER_BY_ABIL: Record<string, Profile['setsWeather']> = { Drizzle: 'Rain', Drought: 'Sun', 'Sand Stream': 'Sand', 'Snow Warning': 'Snow', 'Mega Sol': 'Sun' };
const TERRAIN_BY_ABIL: Record<string, Profile['setsTerrain']> = { 'Grassy Surge': 'Grassy', 'Psychic Surge': 'Psychic', 'Electric Surge': 'Electric', 'Misty Surge': 'Misty' };
const WEATHER_MOVE: Record<string, Profile['setsWeather']> = { 'Rain Dance': 'Rain', 'Sunny Day': 'Sun', Sandstorm: 'Sand', Snowscape: 'Snow' };

export function profile(set: PokemonSet): Profile {
  const megaName = effectiveSpecies(set, true);
  const megaAbility = megaName !== set.species ? (getSpecies(megaName)?.abilities?.[0] as string) : undefined;
  const abilities = [set.ability, ...(megaAbility && megaAbility !== set.ability ? [megaAbility] : [])].filter(Boolean);
  const mon = battleMonFor(set, 0, true);
  const bs = getSpecies(megaName)?.baseStats ?? getSpecies(set.species)!.baseStats;
  const moves = new Set(set.moves);
  const atkMoves = set.moves.filter((m) => !isStatusMove(m));
  const ability = megaAbility ?? set.ability;
  let setsWeather: Profile['setsWeather'];
  for (const a of abilities) setsWeather ??= WEATHER_BY_ABIL[a];
  for (const m of set.moves) setsWeather ??= WEATHER_MOVE[m];
  let setsTerrain: Profile['setsTerrain'];
  for (const a of abilities) setsTerrain ??= TERRAIN_BY_ABIL[a];
  return {
    set, name: set.species, abilities, types: mon.types, baseSpe: bs.spe, physical: bs.atk >= bs.spa,
    bulk: (bs.hp * (bs.def + bs.spd)) / 2, offense: Math.max(bs.atk, bs.spa), moves,
    atkTypes: atkMoves.map((m) => attackType(m, ability)),
    setsWeather, setsTerrain,
    setup: set.moves.some((m) => m in STATUS_MOVES.boostsSelf),
    allHit: atkMoves.filter((m) => moveTargetKind(m) === 'all'),
    weak: (t) => defensiveMultiplier(mon, t),
  };
}

export interface SynergyHit { points: number; text: string }

const hasAb = (p: Profile, ...a: string[]) => p.abilities.some((x) => a.includes(x));
const hasMv = (p: Profile, ...m: string[]) => m.some((x) => p.moves.has(x));
const share = (p: Profile, type: string) => p.atkTypes.filter((t) => t === type).length;
const PRIORITY_MOVES = ['Fake Out', 'Sucker Punch', 'Aqua Jet', 'Extreme Speed', 'Grassy Glide', 'Bullet Punch', 'Ice Shard', 'Shadow Sneak', 'Quick Attack', 'Mach Punch', 'First Impression', 'Water Shuriken', 'Accelerock'];

/**
 * Lo que `a` aporta a `b` (dirigido). Devuelve puntos y una frase explicándolo.
 * Las reglas marcadas como dobles no cuentan en individuales y viceversa.
 */
export function provides(a: Profile, b: Profile, format: Format): SynergyHit[] {
  const out: SynergyHit[] = [];
  const add = (points: number, text: string) => out.push({ points, text });
  const dbl = format === 'doubles';

  // ── Climas ──
  if (a.setsWeather === 'Rain') {
    if (hasAb(b, 'Swift Swim')) add(25, `la lluvia de ${a.name} duplica la velocidad de ${b.name} (Nado Rápido)`);
    if (hasMv(b, 'Electro Shot')) add(15, `${b.name} usa Electro Shot sin cargar bajo la lluvia de ${a.name}`);
    if (hasMv(b, 'Hurricane', 'Thunder')) add(8, `${b.name} acierta Huracán/Trueno al 100% con lluvia`);
    if (share(b, 'Water') && b !== a) add(6 + 3 * share(b, 'Water'), `los ataques Agua de ${b.name} hacen x1.5 con lluvia`);
    if (hasAb(b, 'Dry Skin', 'Rain Dish', 'Hydration')) add(8, `${b.name} se beneficia de la lluvia (${b.abilities[0]})`);
    if (b.weak('Fire') > 1 && b !== a) add(4, `la lluvia debilita el Fuego que amenaza a ${b.name}`);
    if (b.setsWeather && b.setsWeather !== 'Rain') add(-18, `⚠ ${a.name} (lluvia) y ${b.name} (${b.setsWeather}) se pisan el clima`);
  }
  if (a.setsWeather === 'Sun') {
    if (hasAb(b, 'Chlorophyll')) add(25, `el sol de ${a.name} duplica la velocidad de ${b.name} (Clorofila)`);
    if (hasAb(b, 'Solar Power', 'Protosynthesis', 'Orichalcum Pulse')) add(15, `${b.name} se potencia con el sol (${b.abilities.find((x) => ['Solar Power', 'Protosynthesis'].includes(x))})`);
    if (hasMv(b, 'Solar Beam', 'Solar Blade')) add(12, `${b.name} usa Rayo Solar sin cargar con sol`);
    if (hasMv(b, 'Weather Ball') && b !== a) add(8, `Meteorobola de ${b.name} pasa a ser Fuego 100 con sol`);
    if (share(b, 'Fire') && b !== a) add(6 + 3 * share(b, 'Fire'), `los ataques Fuego de ${b.name} hacen x1.5 con sol`);
    if (b.weak('Water') > 1 && b !== a) add(4, `el sol debilita el Agua que amenaza a ${b.name}`);
    if (b.setsWeather && b.setsWeather !== 'Sun') add(-18, `⚠ ${a.name} (sol) y ${b.name} (${b.setsWeather}) se pisan el clima`);
  }
  if (a.setsWeather === 'Sand') {
    if (hasAb(b, 'Sand Rush')) add(25, `la arena de ${a.name} duplica la velocidad de ${b.name} (Ímpetu Arena)`);
    if (hasAb(b, 'Sand Force')) add(15, `${b.name} pega x1.3 en arena (Poder Arena)`);
    if (b.types.includes('Rock') && b !== a) add(6, `${b.name} (Roca) gana +50% Def. Esp. en arena`);
    if (!b.types.some((t) => ['Rock', 'Ground', 'Steel'].includes(t)) && !hasAb(b, 'Sand Rush', 'Sand Force', 'Sand Veil', 'Overcoat', 'Magic Guard')) add(-3, `⚠ ${b.name} recibe daño de la arena`);
    if (b.setsWeather && b.setsWeather !== 'Sand') add(-18, `⚠ ${a.name} (arena) y ${b.name} (${b.setsWeather}) se pisan el clima`);
  }
  if (a.setsWeather === 'Snow') {
    if (hasAb(b, 'Slush Rush')) add(25, `la nieve de ${a.name} duplica la velocidad de ${b.name} (Quitanieves)`);
    if (hasMv(b, 'Aurora Veil') && b !== a) add(20, `${b.name} puede usar Velo Aurora gracias a la nieve`);
    if (hasMv(b, 'Blizzard') && b !== a) add(10, `Ventisca de ${b.name} no falla con nieve`);
    if (b.types.includes('Ice') && b !== a) add(6, `${b.name} (Hielo) gana +50% Defensa con nieve`);
    if (b.setsWeather && b.setsWeather !== 'Snow') add(-18, `⚠ ${a.name} (nieve) y ${b.name} (${b.setsWeather}) se pisan el clima`);
  }

  // ── Campos ──
  if (a.setsTerrain === 'Grassy') {
    if (hasMv(b, 'Grassy Glide') && b !== a) add(15, `Fitoimpulso de ${b.name} gana prioridad en el Campo de Hierba`);
    if (share(b, 'Grass') && b !== a) add(4 + 2 * share(b, 'Grass'), `ataques Planta de ${b.name} x1.3 en Campo de Hierba`);
    if (b.set.item === 'Grassy Seed') add(hasAb(b, 'Unburden') ? 22 : 10, `${b.name} activa su Semilla Hierba${hasAb(b, 'Unburden') ? ' y Unburden duplica su velocidad' : ''}`);
    add(2, `${b.name} recupera PS cada turno en el Campo de Hierba`);
  }
  if (a.setsTerrain === 'Psychic') {
    if (hasMv(b, 'Expanding Force')) add(20, `Vasto Poder de ${b.name} golpea más fuerte${dbl ? ' y a ambos rivales' : ''} en Campo Psíquico`);
    if (share(b, 'Psychic') && b !== a) add(4 + 2 * share(b, 'Psychic'), `ataques Psíquico de ${b.name} x1.3 en Campo Psíquico`);
    if (b.set.item === 'Psychic Seed') add(hasAb(b, 'Unburden') ? 24 : 10, `${b.name} activa su Semilla Psíquica${hasAb(b, 'Unburden') ? ' y Unburden duplica su velocidad' : ''}`);
    if (b.baseSpe < 70 || hasMv(b, 'Trick Room') || b.setup) add(dbl ? 8 : 5, `el Campo Psíquico protege a ${b.name} de Fake Out y prioridad`);
    const prio = [...b.moves].filter((m) => PRIORITY_MOVES.includes(m));
    if (prio.length) add(-6, `⚠ el Campo Psíquico anula ${prio.join('/')} de ${b.name} contra rivales en el suelo`);
  }
  if (a.setsTerrain === 'Electric') {
    if (hasAb(b, 'Surge Surfer')) add(25, `${b.name} duplica su velocidad en Campo Eléctrico`);
    if (share(b, 'Electric') && b !== a) add(4 + 2 * share(b, 'Electric'), `ataques Eléctrico de ${b.name} x1.3 en Campo Eléctrico`);
    if (b.set.item === 'Electric Seed') add(hasAb(b, 'Unburden') ? 22 : 10, `${b.name} activa su Semilla Electro`);
    if (hasMv(b, 'Rising Voltage', 'Terrain Pulse') && b !== a) add(10, `${b.name} potencia su ataque de campo`);
  }
  if (a.setsTerrain === 'Misty') {
    if (b.set.item === 'Misty Seed') add(10, `${b.name} activa su Semilla Bruma`);
    if (b.types.includes('Dragon') && b !== a) add(3, '');
  }
  if (a.setsTerrain && b.setsTerrain && a.setsTerrain !== b.setsTerrain) add(-12, `⚠ ${a.name} y ${b.name} se pisan el campo`);

  // Lo demás son apoyos a un compañero: no cuentan consigo mismo
  if (a === b) return out.filter((h) => h.text);

  // ── Habilidades de apoyo ──
  if (hasAb(a, 'Intimidate') && b !== a) {
    if (b.physical === false && b.bulk < 9000) add(dbl ? 6 : 3, `Intimidación de ${a.name} cubre a ${b.name} (frágil en Defensa)`);
    else add(dbl ? 3 : 1, `Intimidación de ${a.name} reduce el daño físico que recibe ${b.name}`);
  }
  if (dbl) {
    if (hasAb(a, 'Lightning Rod') && b.weak('Electric') > 1) add(12, `Pararrayos de ${a.name} atrae los ataques Eléctrico que dañan a ${b.name}`);
    if (hasAb(a, 'Storm Drain') && b.weak('Water') > 1) add(12, `Colector de ${a.name} atrae los ataques Agua que dañan a ${b.name}`);
    if (hasAb(a, 'Armor Tail', 'Queenly Majesty', 'Dazzling') && (hasMv(b, 'Trick Room', 'Tailwind') || b.setup)) add(12, `${a.name} (${a.abilities[0]}) bloquea Fake Out y prioridad contra ${b.name}`);
    if (hasAb(a, 'Friend Guard')) add(6, `Compiescolta de ${a.name} reduce un 25% el daño a ${b.name}`);
    if (hasAb(a, 'Hospitality')) add(3, `${a.name} cura a ${b.name} al entrar (Hospitalidad)`);
    // ataques que golpean al aliado
    for (const m of a.allHit) {
      const t = attackType(m, a.abilities[a.abilities.length - 1]);
      if (b.weak(t) === 0) add(10, `${b.name} es inmune a ${m} de ${a.name}: puede usarlo sin miedo`);
      else if (b !== a) add(-5, `⚠ ${m} de ${a.name} daña a ${b.name}`);
    }
    // absorber ataques de área del aliado
    if (hasAb(b, 'Water Absorb', 'Storm Drain', 'Dry Skin') && a.allHit.some((m) => attackType(m, a.abilities[0]) === 'Water')) add(8, `${b.name} absorbe el Surf de ${a.name}`);
    if (hasAb(b, 'Volt Absorb', 'Lightning Rod', 'Motor Drive') && a.allHit.some((m) => attackType(m, a.abilities[0]) === 'Electric')) add(8, `${b.name} absorbe la Descarga de ${a.name}`);
  }
  if (hasAb(a, 'Prankster') && hasMv(a, 'Tailwind') && b.baseSpe >= 60 && b.baseSpe <= 110 && b !== a) add(dbl ? 8 : 0, `Viento Afín con Bromista de ${a.name} hace a ${b.name} más rápido`);
  if (hasAb(a, 'Prankster') && hasMv(a, 'Reflect', 'Light Screen', 'Aurora Veil') && b !== a) add(dbl ? 5 : 8, `pantallas con Bromista de ${a.name} protegen a ${b.name}`);
  if (hasAb(a, 'Regenerator') && hasMv(b, 'U-turn', 'Volt Switch', 'Flip Turn', 'Parting Shot') && !dbl) add(5, `núcleo de pivotes: ${b.name} cambia a ${a.name} (Regeneración)`);

  // ── Movimientos de apoyo que dependen de cómo es el compañero ──
  if (b !== a) {
    if (hasMv(a, 'Trick Room')) {
      if (b.baseSpe <= 55 && !b.set.moves.every(isStatusMove)) add(12, `el Espacio Raro de ${a.name} hace que ${b.name} (lento) ataque primero`);
      else if (b.baseSpe >= 100) add(-4, `⚠ ${b.name} es rápido: el Espacio Raro de ${a.name} le perjudica`);
    }
    if (hasMv(a, 'Tailwind') && !hasAb(a, 'Prankster') && b.baseSpe >= 60 && b.baseSpe <= 105) add(dbl ? 7 : 0, `Viento Afín de ${a.name} adelanta a ${b.name}`);
    if (dbl && hasMv(a, 'Follow Me', 'Rage Powder') && (b.setup || hasMv(b, 'Trick Room', 'Tailwind'))) add(12, `${a.name} redirige ataques mientras ${b.name} se prepara`);
    if (dbl && hasMv(a, 'Fake Out') && (b.setup || hasMv(b, 'Trick Room', 'Tailwind'))) add(7, `Fake Out de ${a.name} da un turno libre a ${b.name}`);
    if (dbl && hasMv(a, 'Helping Hand') && b.atkTypes.length >= 2) add(4, `Refuerzo de ${a.name} potencia a ${b.name}`);
    const hazards = ['Stealth Rock', 'Spikes', 'Toxic Spikes'];
    if (!dbl && hasMv(a, ...hazards)) {
      if (hasMv(b, ...hazards)) add(-3, `⚠ ${a.name} y ${b.name} repiten el rol de trampas`);
      else if (b.offense >= 110 && !b.set.moves.every(isStatusMove)) add(4, `las trampas de ${a.name} facilitan los KOs de ${b.name}`);
    }
  }
  return out.filter((h) => h.text);
}

/** Sinergia total entre dos Pokémon (en ambos sentidos). */
export function pairSynergy(a: Profile, b: Profile, format: Format) {
  const hits = [...provides(a, b, format), ...provides(b, a, format)];
  return { score: hits.reduce((t, h) => t + h.points, 0), hits };
}

export interface SynergyCandidate {
  set: PokemonSet;
  score: number;
  hits: SynergyHit[];
  /** con qué miembros combina mejor */
  partners: { species: string; score: number }[];
  /** puntuación solo por habilidades/sinergia, sin contar el meta */
  synergyOnly: number;
}

/** Ordena candidatos por lo bien que combinan (por habilidad) con el equipo actual. */
export function rankBySynergy(team: PokemonSet[], candidates: PokemonSet[], format: Format): SynergyCandidate[] {
  const teamP = team.map(profile);
  return candidates
    .filter((c) => !team.some((t) => t.species === c.species))
    .map((set) => {
      const p = profile(set);
      const self = provides(p, p, format);
      const per = teamP.map((m) => ({ species: m.name, ...pairSynergy(p, m, format) }));
      const hits = [...self, ...per.flatMap((x) => x.hits)];
      const synergyOnly = hits.reduce((t, h) => t + h.points, 0);
      const meta = metaEntry(set.species, format);
      return {
        set, hits, synergyOnly,
        score: synergyOnly + (meta ? metaWeight(meta) / 5 : 0),
        partners: per.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => ({ species: x.species, score: x.score })),
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ───────────────────────── Armado automático ─────────────────────────

export interface BuiltTeam {
  members: PokemonSet[];
  score: number;
  breakdown: { label: string; points: number }[];
  notes: string[];
}

interface BuildCtx {
  profiles: Profile[];
  pair: number[][];
  indiv: number[];
  roleOf: boolean[][];
  weakMatrix: number[][]; // [mon][type] multiplicador
  isMega: boolean[];
  format: Format;
}

function individualScore(set: PokemonSet, format: Format) {
  const meta = metaEntry(set.species, format);
  const bs = getSpecies(effectiveSpecies(set, true))?.baseStats;
  const bst = bs ? bs.hp + bs.atk + bs.def + bs.spa + bs.spd + bs.spe : 450;
  return (meta ? metaWeight(meta) * 0.8 : 0) + (bst - 450) / 15;
}

function buildCtx(pool: PokemonSet[], format: Format): BuildCtx {
  const profiles = pool.map(profile);
  const roles = ROLES_BY_FORMAT[format];
  return {
    profiles, format,
    pair: profiles.map((a, i) => profiles.map((b, j) => (i === j ? 0 : pairSynergy(a, b, format).score))),
    indiv: pool.map((s) => individualScore(s, format)),
    roleOf: pool.map((s) => roles.map((r) => r.test(s))),
    weakMatrix: profiles.map((p) => TYPES.map((t) => p.weak(t))),
    isMega: pool.map((s) => effectiveSpecies(s, true) !== s.species),
  };
}

function evalTeam(idx: number[], c: BuildCtx) {
  const breakdown: { label: string; points: number }[] = [];
  const indiv = idx.reduce((t, i) => t + c.indiv[i], 0);
  breakdown.push({ label: 'Fuerza individual (meta + stats)', points: indiv });
  let syn = 0;
  for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) syn += c.pair[idx[x]][idx[y]];
  breakdown.push({ label: 'Sinergia de habilidades', points: syn * 0.7 });
  const roles = ROLES_BY_FORMAT[c.format];
  let roleScore = 0;
  roles.forEach((_, r) => { roleScore += idx.some((i) => c.roleOf[i][r]) ? 7 : -6; });
  breakdown.push({ label: 'Roles cubiertos', points: roleScore });
  let def = 0;
  TYPES.forEach((_, t) => {
    const weak = idx.filter((i) => c.weakMatrix[i][t] > 1).length;
    const resist = idx.filter((i) => c.weakMatrix[i][t] < 1).length;
    if (weak >= 3) def -= (weak - 2) * 8;
    if (weak > resist) def -= (weak - resist) * 3;
    if (resist === 0) def -= 2;
  });
  breakdown.push({ label: 'Equilibrio defensivo', points: def });
  const megas = idx.filter((i) => c.isMega[i]).length;
  const megaPen = megas === 0 ? -6 : megas > 2 ? -(megas - 2) * 10 : 0;
  if (megaPen) breakdown.push({ label: megas === 0 ? 'Sin Mega' : 'Demasiadas Megas', points: megaPen });
  const score = breakdown.reduce((t, b) => t + b.points, 0);
  return { score, breakdown };
}

function combos(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/**
 * Elige los mejores `size` Pokémon de `pool`. `locked` = índices que deben estar sí o sí.
 * Búsqueda exhaustiva si hay pocas combinaciones; si no, voraz + intercambios.
 */
export function autoBuild(pool: PokemonSet[], format: Format, size = 6, locked: number[] = [], top = 3): BuiltTeam[] {
  const n = pool.length;
  if (!n) return [];
  size = Math.min(size, n);
  const ctx = buildCtx(pool, format);
  const { profiles } = ctx;
  const roles = ROLES_BY_FORMAT[format];
  const lockedSet = new Set(locked.filter((i) => i < n));
  const free = pool.map((_, i) => i).filter((i) => !lockedSet.has(i));
  const need = size - lockedSet.size;
  // solo guardamos los mejores `top` equipos distintos
  const results: { idx: number[]; score: number; key: string }[] = [];
  const push = (idx: number[]) => {
    const score = evalTeam(idx, ctx).score;
    if (results.length >= top && score <= results[results.length - 1].score) return;
    const key = [...idx].sort((a, b) => a - b).join(',');
    if (results.some((r) => r.key === key)) return;
    results.push({ idx: [...idx], score, key });
    results.sort((a, b) => b.score - a.score);
    if (results.length > top) results.pop();
  };

  if (need <= 0) push([...lockedSet].slice(0, size));
  else if (combos(free.length, need) <= 60000) {
    const cur: number[] = [...lockedSet];
    const rec = (start: number) => {
      if (cur.length === size) { push(cur); return; }
      for (let i = start; i < free.length; i++) { cur.push(free[i]); rec(i + 1); cur.pop(); }
    };
    rec(0);
  } else {
    // voraz con varios arranques + mejora por intercambios
    for (let restart = 0; restart < 12; restart++) {
      const cur = [...lockedSet];
      const order = [...free].sort(() => (restart ? Math.random() - 0.5 : 0));
      while (cur.length < size) {
        let best = -1;
        let bestScore = -Infinity;
        for (const i of order) {
          if (cur.includes(i)) continue;
          const s = evalTeam([...cur, i], ctx).score + (restart ? Math.random() * 5 : 0);
          if (s > bestScore) { bestScore = s; best = i; }
        }
        cur.push(best);
      }
      let improved = true;
      while (improved) {
        improved = false;
        const base = evalTeam(cur, ctx).score;
        for (let a = 0; a < cur.length && !improved; a++) {
          if (lockedSet.has(cur[a])) continue;
          for (const i of free) {
            if (cur.includes(i)) continue;
            const trial = [...cur];
            trial[a] = i;
            if (evalTeam(trial, ctx).score > base + 0.01) { cur.splice(0, cur.length, ...trial); improved = true; break; }
          }
        }
      }
      push(cur);
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, top).map(({ idx }) => {
    const { score, breakdown } = evalTeam(idx, ctx);
    const notes: string[] = [];
    const pairs: { a: number; b: number; s: number }[] = [];
    for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) pairs.push({ a: idx[x], b: idx[y], s: ctx.pair[idx[x]][idx[y]] });
    pairs.sort((p, q) => q.s - p.s).slice(0, 3).filter((p) => p.s > 0).forEach((p) => {
      const best = pairSynergy(profiles[p.a], profiles[p.b], format).hits.filter((h) => h.points > 0).sort((h1, h2) => h2.points - h1.points)[0];
      if (best) notes.push(`🤝 ${best.text}`);
    });
    roles.forEach((r, ri) => { if (!idx.some((i) => ctx.roleOf[i][ri])) notes.push(`⚠ Falta: ${r.name}`); });
    TYPES.forEach((t, ti) => {
      const weak = idx.filter((i) => ctx.weakMatrix[i][ti] > 1).length;
      if (weak >= 3) notes.push(`⚠ ${weak} miembros débiles a ${TYPE_ES[t]}`);
    });
    return { members: idx.map((i) => pool[i]), score, breakdown, notes };
  });
}

// ───────────────────────── Colección vs. equipo ─────────────────────────

export interface CollectionFit {
  set: PokemonSet;
  /** cuánto mejora la puntuación del equipo (añadiéndolo o con su mejor cambio) */
  fit: number;
  /** si el equipo está lleno: a quién sustituiría */
  replaces?: string;
  reasons: string[];
  inTeam: boolean;
}

export interface SwapAdvice { out: string; in: PokemonSet; delta: number; reasons: string[] }

/**
 * Compara cada Pokémon de la colección con el equipo actual:
 * - si el equipo tiene hueco, cuánto suma añadirlo;
 * - si está lleno, el mejor cambio (a quién sustituye y cuánto mejora).
 */
export function collectionAdvice(team: PokemonSet[], collection: PokemonSet[], format: Format) {
  const extra = collection.filter((c) => !team.some((t) => t.species === c.species));
  const pool = [...team, ...extra];
  const ctx = buildCtx(pool, format);
  const teamIdx = team.map((_, i) => i);
  const base = team.length ? evalTeam(teamIdx, ctx).score : 0;
  const roles = ROLES_BY_FORMAT[format];
  const missingRoles = roles.map((r, ri) => ({ r, ri })).filter(({ ri }) => !teamIdx.some((i) => ctx.roleOf[i][ri]));
  const weakTypes = TYPES.map((t, ti) => ({ t, ti })).filter(({ ti }) => {
    const weak = teamIdx.filter((i) => ctx.weakMatrix[i][ti] > 1).length;
    const resist = teamIdx.filter((i) => ctx.weakMatrix[i][ti] < 1).length;
    return weak >= 2 && weak > resist;
  });

  const reasonsFor = (ci: number, without?: number) => {
    const r: string[] = [];
    const fills = missingRoles.filter(({ ri }) => ctx.roleOf[ci][ri]).map(({ r: role }) => role.name);
    if (fills.length) r.push(`aporta ${fills.join(', ')}`);
    const covers = weakTypes.filter(({ ti }) => ctx.weakMatrix[ci][ti] < 1).map(({ t }) => TYPE_ES[t]);
    if (covers.length) r.push(`resiste ${covers.join(', ')} (debilidad del equipo)`);
    const hits = teamIdx.filter((i) => i !== without)
      .flatMap((i) => pairSynergy(ctx.profiles[ci], ctx.profiles[i], format).hits)
      .filter((h) => h.points > 0).sort((a, b) => b.points - a.points);
    if (hits[0]) r.push(`🤝 ${hits[0].text}`);
    const warn = teamIdx.filter((i) => i !== without)
      .flatMap((i) => pairSynergy(ctx.profiles[ci], ctx.profiles[i], format).hits).find((h) => h.points < -5);
    if (warn) r.push(warn.text);
    if (ctx.isMega[ci] && teamIdx.some((i) => i !== without && ctx.isMega[i])) r.push('⚠ el equipo ya tiene Mega');
    return r;
  };

  const swaps: SwapAdvice[] = [];
  const fits: CollectionFit[] = pool.map((set, ci) => {
    if (ci < team.length) return { set, fit: 0, reasons: [], inTeam: true };
    if (team.length < 6) {
      const fit = evalTeam([...teamIdx, ci], ctx).score - base;
      return { set, fit, reasons: reasonsFor(ci), inTeam: false };
    }
    let best = { delta: -Infinity, i: 0 };
    for (const i of teamIdx) {
      const delta = evalTeam(teamIdx.map((x) => (x === i ? ci : x)), ctx).score - base;
      if (delta > best.delta) best = { delta, i };
    }
    const reasons = reasonsFor(ci, best.i);
    if (best.delta > 0.5) swaps.push({ out: team[best.i].species, in: set, delta: best.delta, reasons });
    return { set, fit: best.delta, replaces: team[best.i].species, reasons, inTeam: false };
  });

  // aporte de cada miembro actual (cuánto se pierde si se quita)
  const contribution = team.map((s, i) => ({
    species: s.species,
    value: team.length > 1 ? base - evalTeam(teamIdx.filter((x) => x !== i), ctx).score : base,
  }));

  return {
    base,
    fits: fits.filter((f) => !f.inTeam).sort((a, b) => b.fit - a.fit),
    swaps: swaps.sort((a, b) => b.delta - a.delta),
    contribution: contribution.sort((a, b) => a.value - b.value),
  };
}
