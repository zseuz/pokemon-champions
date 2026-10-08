/**
 * Motor de combate dobles simplificado para Pokémon Champions.
 * El daño se calcula con @smogon/calc (mecánicas oficiales de Champions); el resto de efectos
 * (Protect, Fake Out, Viento Afín, Espacio Raro, Intimidación, clima, campos, Megas, objetos comunes…)
 * se implementa aquí. Efectos poco comunes en el meta se ignoran y se avisa en el registro.
 */
import { calculate, Field, Move, Pokemon } from '@smogon/calc';
import { effectiveness, gen, getMove, getSpecies, megaForme, type StatID } from '../domain/dex';
import {
  ALLY_TARGET_MOVES, FIRST_TURN_ONLY, SECONDARY, SELF_FIELD_MOVES, STATUS_MOVES, moveAccuracy,
  type Boosts, type StatusID,
} from '../domain/moveEffects';
import type { PokemonSet } from '../domain/sets';
import { moveEs, moveLabel } from '../domain/es';

export type Weather = 'Sun' | 'Rain' | 'Sand' | 'Snow';
export type Terrain = 'Grassy' | 'Psychic' | 'Electric' | 'Misty';
export type SideIdx = 0 | 1;

export interface BattleMon {
  uid: string;
  side: SideIdx;
  set: PokemonSet;
  species: string;
  ability: string;
  item: string;
  /** objeto que tenía y perdió/consumió (para Unburden) */
  lostItem: boolean;
  types: string[];
  stats: Record<StatID, number>;
  maxHP: number;
  hp: number;
  status: '' | StatusID;
  sleepTurns: number;
  toxicCounter: number;
  boosts: Record<StatID | 'accuracy' | 'evasion', number>;
  isMega: boolean;
  fainted: boolean;
  turnsOnField: number;
  protectCount: number;
  tauntTurns: number;
  airBalloon: boolean;
  /** último movimiento usado (para Otra Vez) */
  lastMove: string;
  /** Otra Vez: obligado a repetir `move` durante `turns` turnos */
  encore: { move: string; turns: number } | null;
  /** contador de Canto Mortal (0 = sin contador) */
  perish: number;
  /** set original si se ha transformado (Ditto) */
  baseSet?: PokemonSet;
}

export interface SideState {
  name: string;
  team: BattleMon[];
  /** índice en `team` de cada posición activa (2 en dobles) */
  active: (number | null)[];
  tailwind: number;
  reflect: number;
  lightScreen: number;
  auroraVeil: number;
  megaUsed: boolean;
  faintedCount: number;
  /** trampas en el lado de este equipo */
  stealthRock: boolean;
  spikes: number;
}

export interface LogEntry {
  kind: 'turn' | 'move' | 'damage' | 'info' | 'faint' | 'switch' | 'warn' | 'end';
  text: string;
  side?: SideIdx;
}

export interface BattleState {
  sides: [SideState, SideState];
  turn: number;
  weather?: { type: Weather; turns: number };
  terrain?: { type: Terrain; turns: number };
  trickRoom: number;
  log: LogEntry[];
  winner: SideIdx | 'draw' | null;
  /** 'choose' = elegir acciones; 'replace' = el jugador debe sustituir un Pokémon debilitado */
  phase: 'choose' | 'replace' | 'end';
  /** individuales (1 contra 1) o dobles (2 contra 2); por defecto dobles */
  format?: 'singles' | 'doubles';
}

export interface Target { side: SideIdx; slot: number }

export type Action =
  | { type: 'move'; move: string; target?: Target; mega?: boolean }
  | { type: 'switch'; to: number };

/** Acciones de un bando: una por posición activa (null si la posición está vacía). */
export type SideActions = (Action | null)[];

// ───────────────────────── Creación ─────────────────────────

let uidCounter = 0;

function computeStats(set: PokemonSet, species: string, ability: string) {
  const p = new Pokemon(gen, species, { ability: ability || undefined, nature: set.nature, evs: set.sp });
  return { stats: p.rawStats as Record<StatID, number>, types: [...p.types] as string[], maxHP: p.maxHP() };
}

export function createMon(set: PokemonSet, side: SideIdx): BattleMon {
  const { stats, types, maxHP } = computeStats(set, set.species, set.ability);
  return {
    uid: `m${uidCounter++}`, side, set, species: set.species, ability: set.ability, item: set.item,
    lostItem: false, types, stats, maxHP, hp: maxHP, status: '', sleepTurns: 0, toxicCounter: 0,
    boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, hp: 0, accuracy: 0, evasion: 0 },
    isMega: false, fainted: false, turnsOnField: 0, protectCount: 0, tauntTurns: 0,
    airBalloon: set.item === 'Air Balloon', lastMove: '', encore: null, perish: 0,
  };
}

function createSide(name: string, sets: PokemonSet[], side: SideIdx, slots: number): SideState {
  const team = sets.map((s) => createMon(s, side));
  return {
    name, team, active: slots === 1 ? [team[0] ? 0 : null] : [team[0] ? 0 : null, team[1] ? 1 : null], tailwind: 0, reflect: 0,
    lightScreen: 0, auroraVeil: 0, megaUsed: false, faintedCount: 0, stealthRock: false, spikes: 0,
  };
}

export function createBattle(
  p1: PokemonSet[], p2: PokemonSet[], names: [string, string] = ['Tú', 'Rival'], format: 'singles' | 'doubles' = 'doubles',
): BattleState {
  const slots = format === 'singles' ? 1 : 2;
  const state: BattleState = {
    sides: [createSide(names[0], p1, 0, slots), createSide(names[1], p2, 1, slots)],
    turn: 0, trickRoom: 0, log: [], winner: null, phase: 'choose', format,
  };
  log(state, 'info', `¡Comienza el combate! ${names[0]} vs ${names[1]}`);
  const entering = activeMons(state);
  for (const m of entering) log(state, 'switch', `${m.side === 1 ? 'El rival saca' : 'Sacas'} a ${m.species}.`, m.side);
  for (const m of sortBySpeed(state, entering)) onEntry(state, m);
  state.turn = 1;
  log(state, 'turn', 'Turno 1');
  return state;
}

// ───────────────────────── Utilidades ─────────────────────────

function log(state: BattleState, kind: LogEntry['kind'], text: string, side?: SideIdx) {
  state.log.push({ kind, text, side });
}
const name = (m: BattleMon) => (m.side === 1 ? `${m.species} rival` : m.species);
const pct = (m: BattleMon, n: number) => Math.round((n / m.maxHP) * 1000) / 10;

export function monAt(state: BattleState, t: Target): BattleMon | null {
  const idx = state.sides[t.side].active[t.slot];
  if (idx == null) return null;
  const m = state.sides[t.side].team[idx];
  return m.fainted ? null : m;
}

export function activeMons(state: BattleState, side?: SideIdx): BattleMon[] {
  const sides = side == null ? [0, 1] as SideIdx[] : [side];
  return sides.flatMap((s) => [0, 1].map((slot) => monAt(state, { side: s, slot })).filter((m): m is BattleMon => !!m));
}

export function slotOf(state: BattleState, m: BattleMon): number {
  const side = state.sides[m.side];
  return side.active.findIndex((i) => i != null && side.team[i] === m);
}

export function allyOf(state: BattleState, m: BattleMon): BattleMon | null {
  const slot = slotOf(state, m);
  return slot < 0 ? null : monAt(state, { side: m.side, slot: 1 - slot });
}

export function foesOf(state: BattleState, m: BattleMon): BattleMon[] {
  return activeMons(state, (1 - m.side) as SideIdx);
}

export function benchOf(state: BattleState, side: SideIdx): number[] {
  const s = state.sides[side];
  return s.team.map((_, i) => i).filter((i) => !s.team[i].fainted && !s.active.includes(i));
}

const isGrounded = (m: BattleMon) => !m.types.includes('Flying') && m.ability !== 'Levitate' && !m.airBalloon;

function boostMult(stage: number) {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

export function effSpeed(state: BattleState, m: BattleMon): number {
  let s = m.stats.spe * boostMult(m.boosts.spe);
  const w = state.weather?.type;
  if (m.item === 'Choice Scarf') s *= 1.5;
  if (m.status === 'par') s *= 0.5;
  if (state.sides[m.side].tailwind > 0) s *= 2;
  if ((m.ability === 'Swift Swim' && w === 'Rain') || (m.ability === 'Chlorophyll' && w === 'Sun') ||
      (m.ability === 'Sand Rush' && w === 'Sand') || (m.ability === 'Slush Rush' && w === 'Snow')) s *= 2;
  if (m.ability === 'Unburden' && m.lostItem && !m.item) s *= 2;
  if (m.item === 'Iron Ball') s *= 0.5;
  return Math.floor(s);
}

function sortBySpeed(state: BattleState, mons: BattleMon[]) {
  const tr = state.trickRoom > 0;
  return [...mons].sort((a, b) => {
    const d = effSpeed(state, b) - effSpeed(state, a);
    return d === 0 ? Math.random() - 0.5 : tr ? -d : d;
  });
}

export function movePriority(state: BattleState, m: BattleMon, moveName: string): number {
  const mv = getMove(moveName);
  let p = mv?.priority ?? 0;
  if (moveName === 'Grassy Glide' && state.terrain?.type === 'Grassy' && isGrounded(m)) p += 1;
  if (m.ability === 'Prankster' && isStatusMove(moveName)) p += 1;
  if (m.ability === 'Gale Wings' && mv?.type === 'Flying' && m.hp === m.maxHP) p += 1;
  return p;
}

export function isStatusMove(moveName: string) {
  const mv = getMove(moveName);
  return !mv || !mv.basePower || mv.category === 'Status';
}

export function moveTargetKind(moveName: string): 'foe' | 'spread' | 'all' | 'ally' | 'self' {
  const mv = getMove(moveName);
  if (ALLY_TARGET_MOVES.has(moveName)) return 'ally';
  if (mv?.target === 'allAdjacentFoes') return 'spread';
  if (mv?.target === 'allAdjacent') return 'all';
  if (SELF_FIELD_MOVES.has(moveName)) return 'self';
  if (isStatusMove(moveName) && !(moveName in STATUS_MOVES.statusTarget) && !(moveName in STATUS_MOVES.boostsTarget) &&
      !STATUS_MOVES.taunt.includes(moveName) && moveName !== 'Encore' && moveName !== 'Transform' && !STATUS_MOVES.phaze.includes(moveName)) return 'self';
  return 'foe';
}

// ───────────────────────── Daño ─────────────────────────

function calcPokemon(state: BattleState, m: BattleMon) {
  const s = state.sides[m.side];
  const { hp: _hp, accuracy: _a, evasion: _e, ...boosts } = m.boosts;
  return new Pokemon(gen, m.species, {
    ability: m.ability || undefined,
    item: m.item || undefined,
    nature: m.set.nature,
    evs: m.set.sp,
    boosts,
    status: m.status || '',
    curHP: m.hp,
    alliesFainted: Math.min(s.faintedCount, 100),
  });
}

function toRolls(d: number | number[] | number[][]): number[] {
  if (typeof d === 'number') return Array(16).fill(d);
  if (Array.isArray(d[0])) {
    const hits = d as number[][];
    return hits[0].map((_, i) => hits.reduce((t, h) => t + h[i], 0));
  }
  return d as number[];
}

export interface DamageCalc {
  rolls: number[];
  min: number;
  max: number;
  /** % de la vida máxima del objetivo */
  minPct: number;
  maxPct: number;
  desc: string;
  effectiveness: number;
}

export function computeDamage(
  state: BattleState, atk: BattleMon, def: BattleMon, moveName: string,
  opts: { crit?: boolean; spread?: boolean; helpingHand?: boolean } = {},
): DamageCalc {
  const atkSide = state.sides[atk.side];
  const defSide = state.sides[def.side];
  const field = new Field({
    gameType: opts.spread ? 'Doubles' : 'Singles',
    weather: state.weather?.type,
    terrain: state.terrain?.type,
    attackerSide: { isTailwind: atkSide.tailwind > 0, isHelpingHand: !!opts.helpingHand } as never,
    defenderSide: {
      isReflect: defSide.reflect > 0, isLightScreen: defSide.lightScreen > 0, isAuroraVeil: defSide.auroraVeil > 0,
    } as never,
  });
  const move = new Move(gen, moveName, { isCrit: !!opts.crit });
  let rolls: number[];
  let desc = '';
  try {
    const r = calculate(gen, calcPokemon(state, atk), calcPokemon(state, def), move, field);
    rolls = toRolls(r.damage);
    try { desc = r.desc(); } catch { desc = ''; }
  } catch {
    rolls = Array(16).fill(0);
  }
  // Inmunidad a Tierra por Globo (el calc no la conoce si el objeto ya está en el set: lo cubrimos aquí)
  if (move.type === 'Ground' && def.airBalloon && moveName !== 'Thousand Arrows') rolls = rolls.map(() => 0);
  const min = Math.min(...rolls);
  const max = Math.max(...rolls);
  return {
    rolls, min, max, minPct: pct(def, min), maxPct: pct(def, max), desc,
    effectiveness: effectiveness(move.type, def.types),
  };
}

// ───────────────────────── Entrada en campo ─────────────────────────

const INTIMIDATE_IMMUNE = new Set(['Clear Body', 'White Smoke', 'Full Metal Body', 'Hyper Cutter', 'Inner Focus', 'Oblivious', 'Own Tempo', 'Scrappy']);
const WEATHER_ABIL: Record<string, Weather> = { Drizzle: 'Rain', Drought: 'Sun', 'Sand Stream': 'Sand', 'Snow Warning': 'Snow', 'Mega Sol': 'Sun' };
const TERRAIN_ABIL: Record<string, Terrain> = { 'Grassy Surge': 'Grassy', 'Psychic Surge': 'Psychic', 'Electric Surge': 'Electric', 'Misty Surge': 'Misty' };
const WEATHER_ROCK: Record<Weather, string> = { Sun: 'Heat Rock', Rain: 'Damp Rock', Sand: 'Smooth Rock', Snow: 'Icy Rock' };
const WEATHER_ES: Record<Weather, string> = { Sun: 'sol intenso', Rain: 'lluvia', Sand: 'tormenta de arena', Snow: 'nieve' };
const TERRAIN_ES: Record<Terrain, string> = { Grassy: 'Campo de Hierba', Psychic: 'Campo Psíquico', Electric: 'Campo Eléctrico', Misty: 'Campo de Niebla' };
const SEED_FOR: Record<string, [Terrain, StatID]> = {
  'Grassy Seed': ['Grassy', 'def'], 'Electric Seed': ['Electric', 'def'], 'Psychic Seed': ['Psychic', 'spd'], 'Misty Seed': ['Misty', 'spd'],
};

function setWeather(state: BattleState, w: Weather, by: BattleMon) {
  if (state.weather?.type === w) return;
  state.weather = { type: w, turns: by.item === WEATHER_ROCK[w] ? 8 : 5 };
  log(state, 'info', `${name(by)} provoca ${WEATHER_ES[w]}.`, by.side);
}

function setTerrain(state: BattleState, t: Terrain, by: BattleMon) {
  if (state.terrain?.type === t) return;
  state.terrain = { type: t, turns: by.item === 'Terrain Extender' ? 8 : 5 };
  log(state, 'info', `${name(by)} activa el ${TERRAIN_ES[t]}.`, by.side);
  for (const m of activeMons(state)) checkSeed(state, m);
}

function checkSeed(state: BattleState, m: BattleMon) {
  const seed = SEED_FOR[m.item];
  if (seed && state.terrain?.type === seed[0]) {
    consumeItem(state, m);
    applyBoosts(state, m, { [seed[1]]: 1 }, m, 'por su semilla');
  }
}

function consumeItem(_state: BattleState, m: BattleMon) {
  if (!m.item) return;
  m.item = '';
  m.lostItem = true;
}

function onEntry(state: BattleState, m: BattleMon) {
  m.turnsOnField = 0;
  m.protectCount = 0;
  const a = m.ability;
  if (a === 'Intimidate') {
    for (const foe of foesOf(state, m)) {
      if (INTIMIDATE_IMMUNE.has(foe.ability)) {
        log(state, 'info', `${name(foe)} no se ve afectado por Intimidación.`, foe.side);
        continue;
      }
      if (foe.ability === 'Guard Dog') { applyBoosts(state, foe, { atk: 1 }, foe); continue; }
      log(state, 'info', `Intimidación de ${name(m)}:`, m.side);
      applyBoosts(state, foe, { atk: -1 }, m);
      if (foe.ability === 'Rattled') applyBoosts(state, foe, { spe: 1 }, foe);
    }
  }
  if (a === 'Imposter') {
    const slot = slotOf(state, m);
    const t = monAt(state, { side: (1 - m.side) as SideIdx, slot }) ?? foesOf(state, m)[0];
    if (t) transform(state, m, t);
  }
  if (WEATHER_ABIL[a]) setWeather(state, WEATHER_ABIL[a], m);
  if (TERRAIN_ABIL[a]) setTerrain(state, TERRAIN_ABIL[a], m);
  if (a === 'Hospitality') {
    const ally = allyOf(state, m);
    if (ally && ally.hp < ally.maxHP) heal(state, ally, Math.floor(ally.maxHP / 4), `por Hospitalidad de ${m.species}`);
  }
  checkSeed(state, m);
}

// ───────────────────────── Stats, estado y PS ─────────────────────────

export function applyBoosts(state: BattleState, target: BattleMon, b: Boosts, source: BattleMon, why = '') {
  const ES: Record<string, string> = { atk: 'Ataque', def: 'Defensa', spa: 'At. Esp.', spd: 'Def. Esp.', spe: 'Velocidad', accuracy: 'Precisión', evasion: 'Evasión' };
  let loweredByFoe = false;
  for (const [stat, raw] of Object.entries(b) as [keyof BattleMon['boosts'], number][]) {
    let delta = raw;
    if (target.ability === 'Contrary') delta = -delta;
    if (delta < 0 && source.side !== target.side && (target.ability === 'Clear Body' || target.ability === 'Full Metal Body' || target.ability === 'White Smoke')) {
      log(state, 'info', `${name(target)} evita la bajada de stats.`, target.side);
      continue;
    }
    const before = target.boosts[stat];
    target.boosts[stat] = Math.max(-6, Math.min(6, before + delta));
    const real = target.boosts[stat] - before;
    if (real === 0) continue;
    const word = real > 0 ? (real > 1 ? 'sube mucho' : 'sube') : (real < -1 ? 'baja mucho' : 'baja');
    log(state, 'info', `${ES[stat] ?? stat} de ${name(target)} ${word}${why ? ' ' + why : ''}.`, target.side);
    if (real < 0 && source.side !== target.side) loweredByFoe = true;
  }
  if (loweredByFoe) {
    if (target.ability === 'Defiant') applyBoosts(state, target, { atk: 2 }, target, 'por Competitivo');
    if (target.ability === 'Competitive') applyBoosts(state, target, { spa: 2 }, target, 'por Tenacidad');
  }
  if (target.item === 'White Herb' && Object.values(target.boosts).some((v) => v < 0)) {
    for (const k of Object.keys(target.boosts) as (keyof BattleMon['boosts'])[]) if (target.boosts[k] < 0) target.boosts[k] = 0;
    consumeItem(state, target);
    log(state, 'info', `${name(target)} restaura sus stats con la Hierba Blanca.`, target.side);
  }
}

function canStatus(state: BattleState, t: BattleMon, s: StatusID): boolean {
  if (t.status || t.fainted) return false;
  if (s === 'brn' && t.types.includes('Fire')) return false;
  if (s === 'par' && t.types.includes('Electric')) return false;
  if ((s === 'psn' || s === 'tox') && (t.types.includes('Poison') || t.types.includes('Steel'))) return false;
  if (state.terrain?.type === 'Misty' && isGrounded(t)) return false;
  if (s === 'slp' && state.terrain?.type === 'Electric' && isGrounded(t)) return false;
  if (s === 'slp' && (t.ability === 'Insomnia' || t.ability === 'Vital Spirit' || t.ability === 'Sweet Veil')) return false;
  if (t.ability === 'Flower Veil' && t.types.includes('Grass')) return false;
  return true;
}

const STATUS_ES: Record<StatusID, string> = { brn: 'quemado', par: 'paralizado', psn: 'envenenado', tox: 'gravemente envenenado', slp: 'dormido' };

function inflict(state: BattleState, t: BattleMon, s: StatusID): boolean {
  if (!canStatus(state, t, s)) return false;
  t.status = s;
  if (s === 'slp') t.sleepTurns = 1 + Math.floor(Math.random() * 3);
  if (s === 'tox') t.toxicCounter = 0;
  log(state, 'info', `${name(t)} ha sido ${STATUS_ES[s]}.`, t.side);
  if (t.item === 'Lum Berry') {
    t.status = '';
    consumeItem(state, t);
    log(state, 'info', `${name(t)} se cura con la Baya Ziuela.`, t.side);
  }
  return true;
}

function heal(state: BattleState, m: BattleMon, amount: number, why: string) {
  if (m.fainted || m.hp >= m.maxHP) return;
  const real = Math.min(amount, m.maxHP - m.hp);
  m.hp += real;
  log(state, 'info', `${name(m)} recupera ${pct(m, real)}% PS ${why}.`, m.side);
}

function damage(state: BattleState, m: BattleMon, amount: number, why: string) {
  if (m.fainted || amount <= 0) return;
  const real = Math.min(amount, m.hp);
  m.hp -= real;
  log(state, 'damage', `${name(m)} pierde ${pct(m, real)}% PS ${why}.`, m.side);
  checkFaint(state, m);
  checkSitrus(state, m);
}

function checkSitrus(state: BattleState, m: BattleMon) {
  if (!m.fainted && m.item === 'Sitrus Berry' && m.hp <= m.maxHP / 2) {
    consumeItem(state, m);
    heal(state, m, Math.floor(m.maxHP / 4), 'con la Baya Zidra');
  }
}

function checkFaint(state: BattleState, m: BattleMon) {
  if (m.hp <= 0 && !m.fainted) {
    m.hp = 0;
    m.fainted = true;
    state.sides[m.side].faintedCount++;
    log(state, 'faint', `¡${name(m)} se ha debilitado!`, m.side);
  }
}

// ───────────────────────── Megaevolución ─────────────────────────

export function canMegaNow(state: BattleState, m: BattleMon) {
  return !m.isMega && !state.sides[m.side].megaUsed && !!megaForme(m.set.species, m.item);
}

function megaEvolve(state: BattleState, m: BattleMon) {
  const forme = megaForme(m.set.species, m.item);
  if (!forme) return;
  const ability = (getSpecies(forme)?.abilities?.[0] as string) || m.ability;
  const { stats, types } = computeStats(m.set, forme, ability);
  m.species = forme;
  m.ability = ability;
  m.stats = { ...stats, hp: m.stats.hp };
  m.types = types;
  m.isMega = true;
  state.sides[m.side].megaUsed = true;
  log(state, 'info', `¡${m.set.species} megaevoluciona en ${forme}! (Habilidad: ${ability})`, m.side);
  if (WEATHER_ABIL[ability]) setWeather(state, WEATHER_ABIL[ability], m);
  if (TERRAIN_ABIL[ability]) setTerrain(state, TERRAIN_ABIL[ability], m);
  if (ability === 'Intimidate') onEntry(state, m);
}

// ───────────────────────── Cambios ─────────────────────────

function switchIn(state: BattleState, side: SideIdx, slot: number, teamIdx: number, runEntry = true) {
  const s = state.sides[side];
  const outIdx = s.active[slot];
  if (outIdx != null) {
    const out = s.team[outIdx];
    out.boosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, hp: 0, accuracy: 0, evasion: 0 };
    out.tauntTurns = 0;
    out.encore = null;
    out.perish = 0;
    out.lastMove = '';
    if (out.baseSet) untransform(out);
    if (out.status === 'tox') out.toxicCounter = 0;
    if (!out.fainted) {
      if (out.ability === 'Regenerator') out.hp = Math.min(out.maxHP, out.hp + Math.floor(out.maxHP / 3));
      log(state, 'switch', `${name(out)} vuelve.`, side);
    }
  }
  s.active[slot] = teamIdx;
  const m = s.team[teamIdx];
  log(state, 'switch', `${side === 1 ? 'El rival saca' : 'Sacas'} a ${m.species}.`, side);
  entryHazards(state, m);
  if (runEntry && !m.fainted) onEntry(state, m);
}

/** Transformación / Impostor: copia especie, tipos, stats (salvo PS), habilidad, movimientos y cambios de stats. */
function transform(state: BattleState, m: BattleMon, t: BattleMon) {
  if (m.baseSet || t.baseSet) { log(state, 'info', '¡Pero falló!'); return; }
  m.baseSet = m.set;
  m.species = t.species;
  m.types = [...t.types];
  m.stats = { ...t.stats, hp: m.stats.hp };
  m.ability = t.ability;
  m.boosts = { ...t.boosts };
  m.set = { ...m.set, moves: [...t.set.moves], nature: t.set.nature, sp: { ...t.set.sp, hp: m.set.sp.hp }, ability: t.ability };
  log(state, 'info', `¡${m.side === 1 ? 'Ditto rival' : 'Ditto'} se transforma en ${t.species}!`, m.side);
}

function untransform(m: BattleMon) {
  const base = m.baseSet!;
  const { stats, types } = computeStats(base, base.species, base.ability);
  Object.assign(m, { set: base, species: base.species, ability: base.ability, types, stats, baseSet: undefined });
}

const SPIKES_DMG = [0, 1 / 8, 1 / 6, 1 / 4];

/** Daño de Trampa Rocas y Púas al entrar (Botas Gruesas y Muro Mágico lo evitan). */
function entryHazards(state: BattleState, m: BattleMon) {
  const s = state.sides[m.side];
  if (m.item === 'Heavy-Duty Boots' || m.ability === 'Magic Guard') return;
  if (s.stealthRock) damage(state, m, Math.floor((m.maxHP * effectiveness('Rock', m.types)) / 8), 'por Trampa Rocas');
  if (s.spikes && isGrounded(m)) damage(state, m, Math.floor(m.maxHP * SPIKES_DMG[s.spikes]), 'por las Púas');
}

/** Rugido, Remolino, Cola Dragón…: saca a un Pokémon al azar del banquillo del objetivo. */
function forceSwitch(state: BattleState, t: BattleMon): boolean {
  const bench = benchOf(state, t.side);
  const slot = slotOf(state, t);
  if (!bench.length || slot < 0 || t.fainted) return false;
  if (t.ability === 'Guard Dog' || t.ability === 'Suction Cups') { log(state, 'info', `${name(t)} se aferra al suelo.`, t.side); return false; }
  log(state, 'info', `¡${name(t)} es expulsado del combate!`, t.side);
  switchIn(state, t.side, slot, bench[Math.floor(Math.random() * bench.length)]);
  return true;
}

function clearHazards(state: BattleState, side: SideIdx, by: BattleMon) {
  const s = state.sides[side];
  if (!s.stealthRock && !s.spikes) return;
  s.stealthRock = false;
  s.spikes = 0;
  log(state, 'info', `${name(by)} elimina las trampas del lado de ${side === 0 ? 'tu equipo' : 'el rival'}.`, by.side);
}

/** Elige el mejor reemplazo del banquillo: el que menos sufre los tipos de los rivales activos. */
export function bestSwitchIn(state: BattleState, side: SideIdx): number | null {
  const bench = benchOf(state, side);
  if (!bench.length) return null;
  const foes = activeMons(state, (1 - side) as SideIdx);
  const score = (i: number) => {
    const m = state.sides[side].team[i];
    const worst = Math.max(1, ...foes.flatMap((f) => f.types.map((t) => effectiveness(t, m.types))));
    return m.hp / m.maxHP - worst * 0.3;
  };
  return bench.sort((a, b) => score(b) - score(a))[0];
}

// ───────────────────────── Turno ─────────────────────────

interface Queued {
  mon: BattleMon;
  action: Action;
  priority: number;
  speed: number;
  order: number;
}

export function resolveTurn(prev: BattleState, actions: [SideActions, SideActions]): BattleState {
  const state = structuredClone(prev);
  if (state.phase !== 'choose') return state;

  const turnFlags = {
    protected: new Set<string>(),
    wideGuard: new Set<SideIdx>(),
    redirect: new Map<SideIdx, BattleMon>(),
    helpingHand: new Set<string>(),
    acted: new Set<string>(),
    flinched: new Set<string>(),
    attackersThisTurn: new Set<string>(),
  };

  const queue: Queued[] = [];
  let order = 0;
  for (const side of [0, 1] as SideIdx[]) {
    actions[side].forEach((a, slot) => {
      const mon = monAt(state, { side, slot });
      if (!a || !mon) return;
      queue.push({ mon, action: a, priority: 0, speed: 0, order: order++ });
      if (a.type === 'move' && !isStatusMove(a.move)) turnFlags.attackersThisTurn.add(mon.uid);
    });
  }

  // 1) Cambios (siempre primero)
  for (const q of sortQueue(state, queue.filter((q) => q.action.type === 'switch'))) {
    const a = q.action as Extract<Action, { type: 'switch' }>;
    const slot = slotOf(state, q.mon);
    if (slot < 0 || q.mon.fainted) continue;
    if (state.sides[q.mon.side].team[a.to].fainted || state.sides[q.mon.side].active.includes(a.to)) continue;
    switchIn(state, q.mon.side, slot, a.to);
  }

  // 2) Megaevoluciones
  for (const q of sortQueue(state, queue.filter((q) => q.action.type === 'move' && q.action.mega))) {
    if (canMegaNow(state, q.mon) && slotOf(state, q.mon) >= 0) megaEvolve(state, q.mon);
  }

  // 3) Movimientos por prioridad y velocidad (recalculada en cada paso, como en Gen 8+)
  let pending = queue.filter((q) => q.action.type === 'move');
  while (pending.length) {
    pending = sortQueue(state, pending);
    const q = pending.shift()!;
    if (q.mon.fainted || slotOf(state, q.mon) < 0) continue;
    executeMove(state, q.mon, q.action as Extract<Action, { type: 'move' }>, turnFlags);
    turnFlags.acted.add(q.mon.uid);
    if (sideDefeated(state, 0) || sideDefeated(state, 1)) break;
  }

  endOfTurn(state, turnFlags);
  return state;
}

function sortQueue(state: BattleState, qs: Queued[]) {
  for (const q of qs) {
    q.priority = q.action.type === 'switch' ? 10 : movePriority(state, q.mon, q.action.move);
    q.speed = effSpeed(state, q.mon);
  }
  const tr = state.trickRoom > 0;
  return [...qs].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.speed !== b.speed) return tr ? a.speed - b.speed : b.speed - a.speed;
    return Math.random() - 0.5;
  });
}

type TurnFlags = {
  protected: Set<string>;
  wideGuard: Set<SideIdx>;
  redirect: Map<SideIdx, BattleMon>;
  helpingHand: Set<string>;
  acted: Set<string>;
  flinched: Set<string>;
  attackersThisTurn: Set<string>;
};

const RESIST_BERRY: Record<string, string> = {
  'Chople Berry': 'Fighting', 'Occa Berry': 'Fire', 'Passho Berry': 'Water', 'Wacan Berry': 'Electric',
  'Rindo Berry': 'Grass', 'Yache Berry': 'Ice', 'Kebia Berry': 'Poison', 'Shuca Berry': 'Ground',
  'Coba Berry': 'Flying', 'Payapa Berry': 'Psychic', 'Tanga Berry': 'Bug', 'Charti Berry': 'Rock',
  'Kasib Berry': 'Ghost', 'Haban Berry': 'Dragon', 'Colbur Berry': 'Dark', 'Babiri Berry': 'Steel',
  'Roseli Berry': 'Fairy', 'Chilan Berry': 'Normal',
};

/** Tipo real del movimiento tras habilidades -ate y Weather Ball. */
function effectiveMoveType(state: BattleState, user: BattleMon, moveName: string): string {
  const mv = getMove(moveName);
  let t: string = mv?.type ?? 'Normal';
  if (moveName === 'Weather Ball' && state.weather) t = { Sun: 'Fire', Rain: 'Water', Sand: 'Rock', Snow: 'Ice' }[state.weather.type];
  if (moveName === 'Terrain Pulse' && state.terrain && isGrounded(user)) t = { Grassy: 'Grass', Psychic: 'Psychic', Electric: 'Electric', Misty: 'Fairy' }[state.terrain.type];
  if (t === 'Normal') {
    const ate: Record<string, string> = { Aerilate: 'Flying', Pixilate: 'Fairy', Refrigerate: 'Ice', Galvanize: 'Electric' };
    if (ate[user.ability]) t = ate[user.ability];
  }
  return t;
}

function executeMove(state: BattleState, user: BattleMon, chosen: Extract<Action, { type: 'move' }>, f: TurnFlags) {
  // Otra Vez: solo puede repetir el movimiento bloqueado
  const action = user.encore && user.encore.move !== chosen.move ? { ...chosen, move: user.encore.move } : chosen;
  const moveName = action.move;
  const mv = getMove(moveName);
  const side = state.sides[user.side];

  // Estados que impiden moverse
  if (f.flinched.has(user.uid)) { log(state, 'info', `${name(user)} retrocede y no puede moverse.`, user.side); return; }
  if (user.status === 'slp') {
    if (user.sleepTurns > 0) {
      user.sleepTurns--;
      log(state, 'info', `${name(user)} está dormido.`, user.side);
      return;
    }
    user.status = '';
    log(state, 'info', `${name(user)} se despierta.`, user.side);
  }
  if (user.status === 'par' && Math.random() < 0.25) {
    log(state, 'info', `${name(user)} está paralizado y no puede moverse.`, user.side);
    return;
  }
  if (user.tauntTurns > 0 && isStatusMove(moveName)) {
    log(state, 'info', `${name(user)} no puede usar ${moveLabel(moveName)} por la Mofa.`, user.side);
    return;
  }

  log(state, 'move', `${name(user)} usa ${moveLabel(moveName)}.`, user.side);
  user.lastMove = moveName;
  if (!STATUS_MOVES.protect.includes(moveName)) user.protectCount = 0;

  if (FIRST_TURN_ONLY.has(moveName) && user.turnsOnField > 0) {
    log(state, 'info', '¡Pero falló! (solo funciona el primer turno en el campo)', user.side);
    return;
  }

  // ── Movimientos de estado de campo / propios ──
  if (STATUS_MOVES.protect.includes(moveName)) {
    const chance = 1 / Math.pow(3, user.protectCount);
    if (Math.random() < chance) {
      f.protected.add(user.uid);
      user.protectCount++;
      log(state, 'info', `${name(user)} se protege.`, user.side);
    } else {
      user.protectCount = 0;
      log(state, 'info', '¡Pero falló!', user.side);
    }
    return;
  }
  if (STATUS_MOVES.wideGuard.includes(moveName)) {
    f.wideGuard.add(user.side);
    log(state, 'info', `Vasta Guardia protege al equipo de ${name(user)}.`, user.side);
    return;
  }
  if (STATUS_MOVES.redirect.includes(moveName)) {
    f.redirect.set(user.side, user);
    log(state, 'info', `${name(user)} se convierte en el centro de atención.`, user.side);
    return;
  }
  if (STATUS_MOVES.tailwind.includes(moveName)) {
    side.tailwind = 4;
    log(state, 'info', `¡Sopla Viento Afín a favor de ${user.side === 0 ? 'tu equipo' : 'el rival'}!`, user.side);
    return;
  }
  if (STATUS_MOVES.trickRoom.includes(moveName)) {
    if (state.trickRoom > 0) { state.trickRoom = 0; log(state, 'info', 'Las dimensiones vuelven a la normalidad.'); }
    else { state.trickRoom = 5; log(state, 'info', `¡${name(user)} retuerce las dimensiones! (Espacio Raro)`, user.side); }
    return;
  }
  if (moveName in STATUS_MOVES.screens) {
    const key = STATUS_MOVES.screens[moveName];
    if (key === 'auroraVeil' && state.weather?.type !== 'Snow') { log(state, 'info', '¡Pero falló! (necesita nieve)'); return; }
    side[key] = user.item === 'Light Clay' ? 8 : 5;
    log(state, 'info', `${moveName} protege al equipo de ${name(user)}.`, user.side);
    return;
  }
  if (moveName in STATUS_MOVES.hazards) {
    const foe = state.sides[1 - user.side];
    const who = user.side === 0 ? 'del rival' : 'de tu equipo';
    if (moveName === 'Stealth Rock') {
      if (foe.stealthRock) { log(state, 'info', '¡Pero falló!'); return; }
      foe.stealthRock = true;
      log(state, 'info', `¡Hay piedras puntiagudas flotando alrededor ${who}!`, user.side);
    } else {
      if (foe.spikes >= 3) { log(state, 'info', '¡Pero falló!'); return; }
      foe.spikes++;
      log(state, 'info', `¡Hay púas en el suelo ${who}! (${foe.spikes} capa${foe.spikes > 1 ? 's' : ''})`, user.side);
    }
    return;
  }
  if (moveName === 'Defog' || moveName === 'Tidy Up') {
    clearHazards(state, 0, user);
    clearHazards(state, 1, user);
    if (moveName === 'Defog') {
      const foe = state.sides[1 - user.side];
      foe.reflect = foe.lightScreen = foe.auroraVeil = 0;
    } else applyBoosts(state, user, { atk: 1, spe: 1 }, user);
    return;
  }
  if (STATUS_MOVES.perish.includes(moveName)) {
    for (const m of activeMons(state)) {
      if (m.perish || m.ability === 'Soundproof') continue;
      m.perish = 4;
    }
    log(state, 'info', '¡Todos los Pokémon que oyen la canción se debilitarán en 3 turnos!');
    return;
  }
  if (moveName in STATUS_MOVES.weather) { setWeather(state, STATUS_MOVES.weather[moveName] as Weather, user); return; }
  if (moveName in STATUS_MOVES.boostsSelf) { applyBoosts(state, user, STATUS_MOVES.boostsSelf[moveName], user); return; }
  if (moveName in STATUS_MOVES.heal && moveName !== 'Strength Sap') {
    heal(state, user, Math.floor(user.maxHP * STATUS_MOVES.heal[moveName]), '');
    return;
  }
  if (STATUS_MOVES.helpingHand.includes(moveName)) {
    const ally = allyOf(state, user);
    if (!ally || f.acted.has(ally.uid)) { log(state, 'info', '¡Pero falló!'); return; }
    f.helpingHand.add(ally.uid);
    log(state, 'info', `${name(user)} se prepara para ayudar a ${ally.species}.`, user.side);
    return;
  }
  if (moveName in STATUS_MOVES.healAlly && STATUS_MOVES.healAlly[moveName] > 0) {
    const ally = allyOf(state, user);
    if (ally) heal(state, ally, Math.floor(ally.maxHP * STATUS_MOVES.healAlly[moveName]), `gracias a ${user.species}`);
    return;
  }

  // ── Movimientos dirigidos ──
  const kind = moveTargetKind(moveName);
  if (kind === 'self' || kind === 'ally') {
    log(state, 'warn', `(${moveLabel(moveName)} no tiene efecto en este simulador)`);
    return;
  }

  let targets: BattleMon[] = [];
  if (kind === 'spread') targets = foesOf(state, user);
  else if (kind === 'all') targets = [...foesOf(state, user), allyOf(state, user)].filter((m): m is BattleMon => !!m);
  else {
    const foeSide = (1 - user.side) as SideIdx;
    let t = action.target && action.target.side === foeSide ? monAt(state, action.target) : null;
    if (action.target && action.target.side === user.side) t = monAt(state, action.target); // ataque al aliado
    if (!t) t = foesOf(state, user)[0] ?? null;
    const moveType = effectiveMoveType(state, user, moveName);
    // Pararrayos / Colector
    const rod = foesOf(state, user).find((m) =>
      (m.ability === 'Lightning Rod' && moveType === 'Electric') || (m.ability === 'Storm Drain' && moveType === 'Water'));
    const red = f.redirect.get(foeSide);
    if (rod && t && t.side === foeSide) t = rod;
    else if (red && !red.fainted && t && t.side === foeSide && !(red.set.moves.includes('Rage Powder') && user.types.includes('Grass'))) {
      t = red;
    }
    if (t) targets = [t];
  }
  if (!targets.length) { log(state, 'info', '¡Pero no hay objetivo!'); return; }

  const spread = targets.length > 1;
  const status = isStatusMove(moveName);
  const priority = movePriority(state, user, moveName);
  const moveType = effectiveMoveType(state, user, moveName);
  let totalDealt = 0;
  let hitSomething = false;

  for (const t of targets) {
    if (t.fainted) continue;
    const isFoe = t.side !== user.side;
    // Protecciones
    if (f.protected.has(t.uid) && !mv?.breaksProtect) { log(state, 'info', `${name(t)} se protegió.`, t.side); continue; }
    if (spread && f.wideGuard.has(t.side) && !status) { log(state, 'info', `Vasta Guardia protege a ${name(t)}.`, t.side); continue; }
    if (isFoe && priority > 0) {
      const tAlly = allyOf(state, t);
      if ([t, tAlly].some((m) => m && ['Armor Tail', 'Queenly Majesty', 'Dazzling'].includes(m.ability))) {
        log(state, 'info', `${name(t)} está protegido de movimientos con prioridad.`, t.side); continue;
      }
      if (state.terrain?.type === 'Psychic' && isGrounded(t)) {
        log(state, 'info', `El Campo Psíquico protege a ${name(t)}.`, t.side); continue;
      }
    }
    if (status && isFoe && t.ability === 'Good as Gold') { log(state, 'info', `${name(t)} no se ve afectado (Cuerpo Áureo).`, t.side); continue; }
    if (status && isFoe && user.ability === 'Prankster' && t.types.includes('Dark')) { log(state, 'info', `No afecta a ${name(t)}.`, t.side); continue; }
    if (moveName === 'Sucker Punch' && (!f.attackersThisTurn.has(t.uid) || f.acted.has(t.uid))) { log(state, 'info', '¡Pero falló!'); break; }
    // Precisión
    const acc = moveAccuracy(moveName, state.weather?.type);
    const accStage = user.boosts.accuracy - t.boosts.evasion;
    if (acc > 0 && user.ability !== 'No Guard' && t.ability !== 'No Guard' && Math.random() * 100 >= acc * boostMult(accStage)) {
      log(state, 'info', `¡${name(t)} esquivó el ataque!`, t.side); continue;
    }

    if (status) {
      hitSomething = true;
      applyStatusMove(state, user, t, moveName);
      continue;
    }

    // Absorciones
    const absorb = absorbAbility(t, moveType);
    if (absorb && isFoe) {
      log(state, 'info', `${name(t)} absorbe el ataque (${t.ability}).`, t.side);
      if (absorb === 'heal') heal(state, t, Math.floor(t.maxHP / 4), '');
      else applyBoosts(state, t, absorb, t);
      continue;
    }

    const crit = Math.random() < 1 / 24;
    const calc = computeDamage(state, user, t, moveName, { crit, spread, helpingHand: f.helpingHand.has(user.uid) });
    let dmg = calc.rolls[Math.floor(Math.random() * calc.rolls.length)];
    if (calc.max === 0) {
      log(state, 'info', `No afecta a ${name(t)}...`, t.side);
      if (calc.effectiveness === 0 && (mv?.hasCrashDamage)) damage(state, user, Math.floor(user.maxHP / 2), 'por el golpe fallido');
      continue;
    }
    hitSomething = true;
    if (crit) log(state, 'info', '¡Golpe crítico!');
    if (calc.effectiveness > 1) log(state, 'info', '¡Es súper eficaz!');
    else if (calc.effectiveness < 1) log(state, 'info', 'No es muy eficaz...');
    // Baya que reduce daño súper eficaz
    if (RESIST_BERRY[t.item] && (calc.effectiveness > 1 || t.item === 'Chilan Berry') && RESIST_BERRY[t.item] === moveType) {
      log(state, 'info', `La ${t.item} de ${name(t)} reduce el daño.`, t.side);
      consumeItem(state, t);
    }
    // Banda Focus / Robustez
    if (dmg >= t.hp && t.hp === t.maxHP && (t.item === 'Focus Sash' || t.ability === 'Sturdy')) {
      dmg = t.hp - 1;
      log(state, 'info', `¡${name(t)} aguanta el golpe ${t.item === 'Focus Sash' ? 'con la Banda Focus' : 'gracias a Robustez'}!`, t.side);
      if (t.item === 'Focus Sash') consumeItem(state, t);
    }
    const dealt = Math.min(dmg, t.hp);
    totalDealt += dealt;
    damage(state, t, dealt, `(${moveEs(moveName)})`);
    if (t.airBalloon && dealt > 0) { t.airBalloon = false; if (t.item === 'Air Balloon') consumeItem(state, t); log(state, 'info', `¡El Globo Helio de ${name(t)} explotó!`, t.side); }
    if (moveName === 'Knock Off' && t.item && !megaForme(t.set.species, t.item) && !t.fainted) {
      log(state, 'info', `${name(user)} quita el ${t.item} a ${name(t)}.`, user.side);
      consumeItem(state, t);
    }
    afterHit(state, user, t, moveName, f, dealt);
  }

  if (!hitSomething) return;

  // Retroceso, drenaje, Vidasfera
  if (totalDealt > 0 && !user.fainted) {
    if (mv?.recoil && user.ability !== 'Rock Head' && user.ability !== 'Magic Guard') {
      damage(state, user, Math.max(1, Math.floor((totalDealt * mv.recoil[0]) / mv.recoil[1])), 'por el retroceso');
    }
    if (mv?.drain) heal(state, user, Math.floor((totalDealt * mv.drain[0]) / mv.drain[1]), 'drenando energía');
    if (user.item === 'Life Orb' && user.ability !== 'Magic Guard' && user.ability !== 'Sheer Force') {
      damage(state, user, Math.floor(user.maxHP / 10), 'por la Vidasfera');
    }
  }
  // Efectos sobre el usuario (Close Combat, Draco Meteor…)
  const sec = SECONDARY[moveName];
  if (sec?.self && sec.chance >= 100 && !user.fainted) applyBoosts(state, user, sec.self, user);
  else if (sec?.self && Math.random() * 100 < sec.chance && !user.fainted) applyBoosts(state, user, sec.self, user);

  // Giro Rápido / Giro Mortal: quitan tus trampas y suben Velocidad
  if ((moveName === 'Rapid Spin' || moveName === 'Mortal Spin') && !user.fainted) {
    clearHazards(state, user.side, user);
    if (moveName === 'Rapid Spin') applyBoosts(state, user, { spe: 1 }, user);
  }
  // Cola Dragón / Llave Giro: expulsan al objetivo
  if (STATUS_MOVES.dragOut.includes(moveName) && totalDealt > 0 && targets[0] && !targets[0].fainted) forceSwitch(state, targets[0]);

  // Pivotes (U-turn, Parting Shot…)
  if (STATUS_MOVES.pivot.includes(moveName) && !user.fainted) {
    const to = bestSwitchIn(state, user.side);
    if (to != null) switchIn(state, user.side, slotOf(state, user), to);
  }
}

function absorbAbility(t: BattleMon, type: string): 'heal' | Boosts | null {
  if (type === 'Water' && (t.ability === 'Water Absorb' || t.ability === 'Dry Skin')) return 'heal';
  if (type === 'Electric' && t.ability === 'Volt Absorb') return 'heal';
  if (type === 'Water' && t.ability === 'Storm Drain') return { spa: 1 };
  if (type === 'Electric' && (t.ability === 'Lightning Rod' || t.ability === 'Motor Drive')) return t.ability === 'Motor Drive' ? { spe: 1 } : { spa: 1 };
  if (type === 'Grass' && t.ability === 'Sap Sipper') return { atk: 1 };
  if (type === 'Fire' && t.ability === 'Flash Fire') return {};
  if (type === 'Ground' && t.ability === 'Earth Eater') return 'heal';
  return null;
}

function applyStatusMove(state: BattleState, user: BattleMon, t: BattleMon, moveName: string) {
  if (moveName in STATUS_MOVES.statusTarget) {
    const s = STATUS_MOVES.statusTarget[moveName];
    if ((moveName === 'Spore' || moveName.includes('Powder')) && t.types.includes('Grass')) { log(state, 'info', `No afecta a ${name(t)}.`); return; }
    if (moveName === 'Thunder Wave' && t.types.includes('Ground')) { log(state, 'info', `No afecta a ${name(t)}.`); return; }
    if (!inflict(state, t, s)) log(state, 'info', '¡Pero falló!');
    return;
  }
  if (moveName in STATUS_MOVES.boostsTarget) {
    applyBoosts(state, t, STATUS_MOVES.boostsTarget[moveName], user);
    if (moveName === 'Parting Shot') {
      const to = bestSwitchIn(state, user.side);
      if (to != null) switchIn(state, user.side, slotOf(state, user), to);
    }
    return;
  }
  if (moveName === 'Strength Sap') {
    const atk = Math.floor(t.stats.atk * boostMult(t.boosts.atk));
    applyBoosts(state, t, { atk: -1 }, user);
    heal(state, user, atk, 'con Absorbefuerza');
    return;
  }
  if (STATUS_MOVES.phaze.includes(moveName)) {
    if (moveName === 'Roar' && t.ability === 'Soundproof') { log(state, 'info', `No afecta a ${name(t)}.`, t.side); return; }
    if (!forceSwitch(state, t)) log(state, 'info', '¡Pero falló!');
    return;
  }
  if (moveName === 'Transform') { transform(state, user, t); return; }
  if (STATUS_MOVES.encore.includes(moveName)) {
    if (!t.lastMove || t.encore || t.lastMove === 'Encore') { log(state, 'info', '¡Pero falló!'); return; }
    t.encore = { move: t.lastMove, turns: 3 };
    log(state, 'info', `¡${name(t)} tiene que repetir ${moveLabel(t.lastMove)} (Otra Vez)!`, t.side);
    return;
  }
  if (STATUS_MOVES.taunt.includes(moveName)) {
    t.tauntTurns = 3;
    log(state, 'info', `${name(t)} cae en la Mofa.`, t.side);
    return;
  }
  log(state, 'warn', `(${moveLabel(moveName)} no tiene efecto en este simulador)`);
}

const CONTACT_PUNISH: Record<string, number> = { 'Rough Skin': 8, 'Iron Barbs': 8 };

function afterHit(state: BattleState, user: BattleMon, t: BattleMon, moveName: string, f: TurnFlags, dealt: number) {
  const mv = getMove(moveName);
  const contact = !!mv?.flags?.contact;
  if (user.ability !== 'Sheer Force') {
    const sec = SECONDARY[moveName];
    if (sec && !t.fainted && t.ability !== 'Shield Dust' && Math.random() * 100 < sec.chance) {
      if (sec.flinch && !f.acted.has(t.uid) && t.ability !== 'Inner Focus') f.flinched.add(t.uid);
      if (sec.boosts) applyBoosts(state, t, sec.boosts, user);
      if (sec.status === 'random-dire') inflict(state, t, (['psn', 'par', 'slp'] as StatusID[])[Math.floor(Math.random() * 3)]);
      else if (sec.status) inflict(state, t, sec.status);
    }
  }
  if (!t.fainted && dealt > 0 && t.ability === 'Stamina') applyBoosts(state, t, { def: 1 }, t, 'por Firmeza');
  if (contact && user.ability !== 'Long Reach') {
    if (t.item === 'Rocky Helmet' && !user.fainted) damage(state, user, Math.floor(user.maxHP / 6), 'por el Casco Dentado');
    if (CONTACT_PUNISH[t.ability] && !user.fainted) damage(state, user, Math.floor(user.maxHP / CONTACT_PUNISH[t.ability]), `por ${t.ability}`);
    if (Math.random() < 0.3) {
      if (t.ability === 'Flame Body') inflict(state, user, 'brn');
      if (t.ability === 'Static') inflict(state, user, 'par');
      if (t.ability === 'Poison Point') inflict(state, user, 'psn');
      if (user.ability === 'Poison Touch' && !t.fainted) inflict(state, t, 'psn');
    }
  }
}

// ───────────────────────── Fin de turno ─────────────────────────

function endOfTurn(state: BattleState, f: TurnFlags) {
  void f;
  const mons = sortBySpeed(state, activeMons(state));
  const w = state.weather?.type;
  for (const m of mons) {
    if (m.fainted) continue;
    if (w === 'Sand' && !m.types.some((t) => ['Rock', 'Ground', 'Steel'].includes(t)) &&
        !['Sand Force', 'Sand Rush', 'Sand Veil', 'Overcoat', 'Magic Guard'].includes(m.ability)) {
      damage(state, m, Math.floor(m.maxHP / 16), 'por la tormenta de arena');
    }
  }
  for (const m of mons) {
    if (m.fainted) continue;
    if (state.terrain?.type === 'Grassy' && isGrounded(m)) heal(state, m, Math.floor(m.maxHP / 16), 'por el Campo de Hierba');
    if (m.item === 'Leftovers') heal(state, m, Math.floor(m.maxHP / 16), 'con los Restos');
    if (m.ability !== 'Magic Guard') {
      if (m.status === 'brn') damage(state, m, Math.floor(m.maxHP / 16), 'por la quemadura');
      if (m.status === 'psn') damage(state, m, Math.floor(m.maxHP / 8), 'por el veneno');
      if (m.status === 'tox') { m.toxicCounter++; damage(state, m, Math.floor((m.maxHP * m.toxicCounter) / 16), 'por el veneno'); }
    }
    if (m.tauntTurns > 0) m.tauntTurns--;
    if (m.encore && --m.encore.turns <= 0) { m.encore = null; log(state, 'info', `${name(m)} ya no está bajo los efectos de Otra Vez.`, m.side); }
    m.turnsOnField++;
  }
  for (const m of mons) {
    if (m.fainted || !m.perish) continue;
    m.perish--;
    log(state, 'info', `Contador de Canto Mortal de ${name(m)}: ${m.perish}.`, m.side);
    if (m.perish === 0) damage(state, m, m.hp, 'por Canto Mortal');
  }
  // Contadores de campo
  if (state.weather && --state.weather.turns <= 0) { log(state, 'info', `Termina la ${WEATHER_ES[state.weather.type]}.`); state.weather = undefined; }
  if (state.terrain && --state.terrain.turns <= 0) { log(state, 'info', `Se disipa el ${TERRAIN_ES[state.terrain.type]}.`); state.terrain = undefined; }
  if (state.trickRoom > 0 && --state.trickRoom === 0) log(state, 'info', 'Las dimensiones vuelven a la normalidad.');
  for (const s of state.sides) {
    if (s.tailwind > 0 && --s.tailwind === 0) log(state, 'info', `Amaina el Viento Afín de ${s.name}.`);
    for (const k of ['reflect', 'lightScreen', 'auroraVeil'] as const) if (s[k] > 0) s[k]--;
  }

  // Resultado
  const d0 = sideDefeated(state, 0);
  const d1 = sideDefeated(state, 1);
  if (d0 || d1) {
    state.winner = d0 && d1 ? 'draw' : d1 ? 0 : 1;
    state.phase = 'end';
    log(state, 'end', state.winner === 'draw' ? '¡Empate!' : state.winner === 0 ? '¡Has ganado el combate!' : 'Has perdido el combate.');
    return;
  }

  // Reemplazos: el rival los hace automáticamente; el jugador elige
  for (const side of [1, 0] as SideIdx[]) {
    const s = state.sides[side];
    for (let slot = 0; slot < s.active.length; slot++) {
      // bucle: el que entra puede caer por las trampas
      for (let guard = 0; guard < 6; guard++) {
        const idx = s.active[slot];
        if (idx == null || !s.team[idx].fainted) break;
        if (!benchOf(state, side).length) { s.active[slot] = null; break; }
        if (side !== 1) break;
        const to = bestSwitchIn(state, 1);
        if (to == null) break;
        switchIn(state, 1, slot, to);
      }
    }
    if (sideDefeated(state, side)) {
      state.winner = side === 1 ? 0 : 1;
      state.phase = 'end';
      log(state, 'end', state.winner === 0 ? '¡Has ganado el combate!' : 'Has perdido el combate.');
      return;
    }
  }
  if (needsReplacement(state).length) {
    state.phase = 'replace';
    return;
  }
  nextTurn(state);
}

function nextTurn(state: BattleState) {
  state.turn++;
  state.phase = 'choose';
  log(state, 'turn', `Turno ${state.turn}`);
}

export function sideDefeated(state: BattleState, side: SideIdx) {
  return state.sides[side].team.every((m) => m.fainted);
}

/** Posiciones del jugador con un Pokémon debilitado que deben sustituirse. */
export function needsReplacement(state: BattleState): number[] {
  const s = state.sides[0];
  return s.active.map((_, slot) => slot).filter((slot) => {
    const idx = s.active[slot];
    return idx != null && s.team[idx].fainted && benchOf(state, 0).length > 0;
  });
}

export function replaceFainted(prev: BattleState, slot: number, teamIdx: number): BattleState {
  const state = structuredClone(prev);
  switchIn(state, 0, slot, teamIdx);
  const pendingSlots = needsReplacement(state);
  if (!pendingSlots.length) {
    // si ya no quedan suplentes, vaciar posiciones debilitadas
    const s = state.sides[0];
    for (let i = 0; i < s.active.length; i++) { const idx = s.active[i]; if (idx != null && s.team[idx].fainted) s.active[i] = null; }
    if (sideDefeated(state, 0)) {
      state.winner = 1;
      state.phase = 'end';
      log(state, 'end', 'Has perdido el combate.');
      return state;
    }
    nextTurn(state);
  }
  return state;
}

// ───────────────────────── Opciones legales ─────────────────────────

export function legalMoves(m: BattleMon): string[] {
  if (m.encore) return [m.encore.move];
  return m.set.moves.filter(Boolean);
}

export function legalTargets(state: BattleState, m: BattleMon, moveName: string): Target[] {
  const kind = moveTargetKind(moveName);
  if (kind !== 'foe') return [];
  const foeSide = (1 - m.side) as SideIdx;
  const ts: Target[] = [0, 1].filter((slot) => monAt(state, { side: foeSide, slot })).map((slot) => ({ side: foeSide, slot }));
  const ally = allyOf(state, m);
  if (ally) ts.push({ side: m.side, slot: slotOf(state, ally) });
  return ts;
}
