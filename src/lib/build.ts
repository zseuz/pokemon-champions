/**
 * Build recomendado y enfrentamientos de un Pokémon:
 * - qué movimientos puede aprender y cuáles conviene llevar (puntuación + motivos);
 * - build completo sugerido (movimientos, habilidad, objeto, naturaleza y Stat Points);
 * - contra qué Pokémon del meta gana o pierde, con el daño real de @smogon/calc.
 */
import { MEGA_STONES } from '@smogon/calc';
import learnData from '../data/learnsets.json';
import { metaEntry, metaFor, metaTop, metaWeight, usageLabel, type Format, type MetaEntry } from '../data/meta';
import { rankAbilities } from './abilities';
import { computeDamage, isStatusMove, moveTargetKind, type BattleMon } from './battle';
import { ALL_ITEMS, ALL_MOVES, effectiveness, getMove, getSpecies, megaForme, TYPE_ES, TYPES } from './dex';
import { itemName, scoreItem } from './items';
import { moveAccuracy, STATUS_MOVES } from './moveEffects';
import { defaultSet, effectiveSpecies, type PokemonSet, type SP } from './sets';
import { attackType, battleMonFor, defensiveMultiplier, neutralState } from './teamAnalysis';

const LEARN = learnData as { moves: string[]; species: Record<string, number[]> };

/** Movimientos que puede aprender una especie (si no hay datos, todos). */
export function learnable(species: string): string[] {
  const idx = LEARN.species[species] ?? LEARN.species[getSpecies(species)?.baseSpecies ?? ''];
  return idx?.length ? idx.map((i) => LEARN.moves[i]) : ALL_MOVES;
}

// ───────────────────────── Puntuación de movimientos ─────────────────────────

/** Valor de movimientos de apoyo: [individuales, dobles, explicación]. */
const SUPPORT: Record<string, [number, number, string]> = {
  Protect: [14, 46, 'imprescindible en dobles: bloquea ataques y gana turnos'],
  Detect: [12, 42, 'igual que Protección'],
  'Spiky Shield': [16, 44, 'Protección que además daña al contacto'],
  "King's Shield": [20, 40, 'Protección que baja el Ataque al contacto'],
  'Baneful Bunker': [16, 40, 'Protección que envenena al contacto'],
  'Fake Out': [12, 44, 'el primer turno hace retroceder al rival'],
  Tailwind: [14, 38, 'dobla la velocidad de tu equipo 4 turnos'],
  'Trick Room': [8, 30, 'invierte el orden de velocidad 5 turnos'],
  'Follow Me': [0, 34, 'atrae los ataques hacia sí'],
  'Rage Powder': [0, 34, 'atrae los ataques hacia sí'],
  'Helping Hand': [0, 20, 'potencia un 50% el ataque del aliado'],
  'Wide Guard': [0, 18, 'bloquea ataques en área'],
  'Will-O-Wisp': [24, 22, 'quema y reduce a la mitad el daño físico'],
  'Thunder Wave': [18, 16, 'paraliza: velocidad a la mitad'],
  Toxic: [20, 6, 'envenena gravemente'],
  Yawn: [18, 8, 'duerme al rival el turno siguiente'],
  Spore: [36, 34, 'duerme al rival con 100% de precisión'],
  'Sleep Powder': [26, 24, 'duerme al rival (75%)'],
  'Swords Dance': [30, 22, '+2 Ataque'],
  'Nasty Plot': [30, 22, '+2 At. Esp.'],
  'Dragon Dance': [32, 22, '+1 Ataque y Velocidad'],
  'Quiver Dance': [34, 26, '+1 At. Esp., Def. Esp. y Velocidad'],
  'Calm Mind': [26, 16, '+1 At. Esp. y Def. Esp.'],
  'Bulk Up': [26, 16, '+1 Ataque y Defensa'],
  'Shell Smash': [36, 30, '+2 Ataque, At. Esp. y Velocidad'],
  'Iron Defense': [16, 10, '+2 Defensa'],
  'Belly Drum': [22, 18, 'Ataque al máximo a cambio de media vida'],
  Recover: [28, 16, 'recupera la mitad de los PS'],
  Roost: [28, 16, 'recupera la mitad de los PS'],
  'Slack Off': [28, 16, 'recupera la mitad de los PS'],
  'Soft-Boiled': [28, 16, 'recupera la mitad de los PS'],
  'Morning Sun': [22, 12, 'recupera PS (más con sol)'],
  Synthesis: [22, 12, 'recupera PS (más con sol)'],
  Moonlight: [22, 12, 'recupera PS (más con sol)'],
  'Strength Sap': [28, 22, 'se cura y baja el Ataque rival'],
  'Stealth Rock': [36, 2, 'daña a cada rival que entra (clave en individuales)'],
  Spikes: [24, 0, 'daña a los rivales que entran'],
  'Toxic Spikes': [18, 0, 'envenena a los rivales que entran'],
  'Sticky Web': [22, 4, 'baja la velocidad de los rivales que entran'],
  Defog: [14, 2, 'quita trampas'],
  'Rapid Spin': [14, 2, 'quita trampas y sube velocidad'],
  'Parting Shot': [22, 26, 'baja stats al rival y cambia de Pokémon'],
  Taunt: [16, 18, 'impide movimientos de estado rivales'],
  Encore: [18, 20, 'obliga al rival a repetir su movimiento'],
  Reflect: [16, 18, 'reduce el daño físico 5 turnos'],
  'Light Screen': [16, 18, 'reduce el daño especial 5 turnos'],
  'Aurora Veil': [26, 30, 'reduce todo el daño 5 turnos (necesita nieve)'],
  Whirlwind: [12, 2, 'fuerza al rival a cambiar'],
  Roar: [12, 2, 'fuerza al rival a cambiar'],
  Substitute: [12, 4, 'crea un sustituto'],
  'Destiny Bond': [10, 6, 'si cae, se lleva al rival'],
  'Revival Blessing': [24, 24, 'revive a un aliado debilitado'],
  'Perish Song': [6, 10, 'todos caen en 3 turnos'],
  Trick: [8, 6, 'intercambia objetos'],
  'Heal Pulse': [0, 12, 'cura al aliado'],
  'Ally Switch': [0, 12, 'cambia de posición con el aliado'],
  Haze: [10, 6, 'anula cambios de stats'],
  'Sunny Day': [4, 8, 'provoca sol'], 'Rain Dance': [4, 8, 'provoca lluvia'],
  Coaching: [0, 10, 'sube Ataque y Defensa del aliado'],
};

/** Ataques con efecto útil además del daño: [bonus individuales, bonus dobles, motivo]. */
const EFFECT_BONUS: Record<string, [number, number, string]> = {
  'Icy Wind': [2, 10, 'baja la velocidad de los rivales'], Electroweb: [2, 10, 'baja la velocidad de los rivales'],
  Snarl: [4, 10, 'baja el At. Esp. de los rivales'], 'Knock Off': [10, 8, 'quita el objeto rival'],
  'U-turn': [10, 5, 'pivota a otro Pokémon'], 'Volt Switch': [10, 5, 'pivota a otro Pokémon'], 'Flip Turn': [10, 5, 'pivota a otro Pokémon'],
  'Rock Tomb': [4, 6, 'baja la velocidad'], Nuzzle: [4, 8, 'paraliza siempre'], 'Dire Claw': [6, 6, '50% de estado (veneno/parálisis/sueño)'],
  'Rock Slide': [0, 5, '30% de hacer retroceder a ambos'], 'Last Respects': [6, 6, 'más potencia por cada aliado debilitado'],
  'Throat Chop': [4, 4, 'impide movimientos de sonido'], 'Spirit Break': [4, 4, 'baja el At. Esp.'],
  'Drain Punch': [6, 4, 'recupera PS'], 'Giga Drain': [5, 3, 'recupera PS'], 'Matcha Gotcha': [4, 6, 'recupera PS y puede quemar'],
  'Leech Life': [5, 3, 'recupera PS'], 'Horn Leech': [5, 3, 'recupera PS'], 'Scald': [8, 6, '30% de quemar'],
  'Sucker Punch': [6, 6, 'prioridad (si el rival ataca)'], 'Expanding Force': [0, 8, 'golpea a ambos en Campo Psíquico'],
  'Glaive Rush': [0, 0, ''], 'Body Press': [6, 4, 'usa su Defensa para atacar'],
};
const CHARGE_MOVES: Record<string, string> = { 'Solar Beam': 'Sun', 'Solar Blade': 'Sun', 'Electro Shot': 'Rain', 'Meteor Beam': '' };
const BAD_MOVES = new Set(['Hyper Beam', 'Giga Impact', 'Focus Punch', 'Dream Eater', 'Self-Destruct', 'Explosion', 'Last Resort', 'Belch', 'Snore', 'Sky Attack', 'Skull Bash', 'Razor Wind', 'Bide']);

export interface MoveScore { move: string; score: number; reasons: string[]; learnable: boolean }

function megaStonesFor(species: string): string[] {
  return Object.keys(MEGA_STONES).filter((stone) => megaForme(species, stone));
}

/** Peso de cada tipo defensivo en el meta (para valorar cobertura). */
const targetsCache = new Map<Format, { species: string; weight: number; types: string[] }[]>();
function metaTargets(format: Format) {
  let t = targetsCache.get(format);
  if (!t) {
    t = metaFor(format).filter((e) => e.set).map((e) => ({
      species: e.species, weight: metaWeight(e),
      types: getSpecies(effectiveSpecies(e.set!, true))?.types as string[] ?? [],
    }));
    targetsCache.set(format, t);
  }
  return t;
}

/** Puntúa un movimiento para un set, teniendo en cuenta los otros movimientos ya elegidos. */
export function scoreMove(set: PokemonSet, move: string, format: Format, others: string[] = []): MoveScore {
  const mv = getMove(move);
  const legal = learnable(set.species).includes(move);
  const reasons: string[] = [];
  if (!mv) return { move, score: -100, reasons: ['movimiento desconocido'], learnable: false };
  const dbl = format === 'doubles';
  const forme = effectiveSpecies(set, true);
  const sp = getSpecies(forme)!;
  const ability = forme !== set.species ? (sp.abilities?.[0] as string) : set.ability;
  const meta = metaEntry(set.species, format)?.set?.moves.includes(move);
  let score = 0;

  if (isStatusMove(move) || move === 'Fake Out') {
    const sup = SUPPORT[move];
    if (sup) { score = sup[dbl ? 1 : 0]; reasons.push(sup[2]); } else { score = 3; reasons.push('movimiento de apoyo poco habitual'); }
    if ((move === 'Swords Dance' || move === 'Bulk Up' || move === 'Dragon Dance') && sp.baseStats.atk < sp.baseStats.spa) { score -= 22; reasons.push('su Ataque es menor que su At. Esp.'); }
    if ((move === 'Nasty Plot' || move === 'Calm Mind' || move === 'Quiver Dance') && sp.baseStats.spa < sp.baseStats.atk) { score -= 22; reasons.push('su At. Esp. es menor que su Ataque'); }
    if (move === 'Trick Room') { if (sp.baseStats.spe <= 60) { score += 14; reasons.push('es lento: le beneficia'); } else score -= 6; }
    if (move === 'Tailwind' && sp.baseStats.spe <= 50) { score -= 8; reasons.push('es muy lento para aprovecharlo'); }
    if (move === 'Aurora Veil' && ability !== 'Snow Warning') { score -= 14; reasons.push('necesita nieve de un compañero'); }
    if (ability === 'Prankster' && sup) { score += 8; reasons.push('con Bromista sale con prioridad'); }
    const setup = Object.keys(STATUS_MOVES.boostsSelf);
    if (setup.includes(move) && others.some((o) => setup.includes(o))) { score -= 20; reasons.push('ya tiene otro movimiento potenciador'); }
    if (STATUS_MOVES.protect.includes(move) && others.some((o) => STATUS_MOVES.protect.includes(o))) { score -= 40; reasons.push('ya tiene una Protección'); }
    if (move in STATUS_MOVES.heal && others.some((o) => o in STATUS_MOVES.heal)) { score -= 20; reasons.push('ya tiene recuperación'); }
    const statusInflict = ['Will-O-Wisp', 'Thunder Wave', 'Toxic', 'Yawn', 'Spore', 'Sleep Powder'];
    if (statusInflict.includes(move) && others.some((o) => statusInflict.includes(o))) { score -= 14; reasons.push('ya tiene otro movimiento de estado'); }
    if (move === 'Fake Out' && mv.basePower) score += 2;
  } else {
    const type = attackType(move, ability);
    let bp = mv.basePower;
    if (Array.isArray(mv.multihit)) bp *= 3; else if (typeof mv.multihit === 'number') bp *= mv.multihit;
    if (move === 'Weather Ball') bp = 75;
    if (move === 'Acrobatics' && !set.item) bp = 110;
    const stab = sp.types.includes(type as never) || ['Protean', 'Libero'].includes(ability) ? (ability === 'Adaptability' ? 2 : 1.5) : 1;
    const ate = type !== mv.type ? 1.2 : 1;
    const physical = mv.category === 'Physical' || move === 'Body Press';
    const stat = move === 'Body Press' ? sp.baseStats.def : physical ? sp.baseStats.atk : sp.baseStats.spa;
    const ratio = Math.min(1, stat / Math.max(sp.baseStats.atk, sp.baseStats.spa));
    const acc = (moveAccuracy(move) || 100) / 100;
    const power = bp * stab * ate * acc * Math.pow(ratio, 1.6);
    score = power / 3.2;
    if (move === 'Acrobatics' && !set.item) reasons.push('sin objeto pega con 110 de potencia');
    reasons.push(`${TYPE_ES[type]} ${bp} de potencia${stab > 1 ? ` con STAB${stab === 2 ? ' x2' : ''}` : ''}${ate > 1 ? ` (convertido por ${ability})` : ''}${acc < 1 ? `, ${Math.round(acc * 100)}% precisión` : ''}`);
    if (ratio < 0.75) reasons.push(`usa su ${physical ? 'Ataque' : 'At. Esp.'}, que es su stat ofensivo débil`);
    const prio = mv.priority ?? (move === 'Grassy Glide' ? 1 : 0);
    if (prio > 0 && move !== 'Fake Out') { score += 9; reasons.push(`prioridad +${prio}`); }
    const kind = moveTargetKind(move);
    if (dbl && kind === 'spread') { score += 6; reasons.push('golpea a los dos rivales'); }
    if (dbl && kind === 'all') { score -= 8; reasons.push('⚠ golpea también a tu aliado'); }
    if (move === 'Grassy Glide' && ability === 'Grassy Surge') { score += 18; reasons.push('su propio Campo de Hierba le da prioridad'); }
    const eff = EFFECT_BONUS[move];
    if (eff && eff[2]) { score += eff[dbl ? 1 : 0]; reasons.push(eff[2]); }
    if (mv.recoil) { score -= 4; reasons.push('daño de retroceso'); }
    if (mv.mindBlownRecoil) { score -= 25; reasons.push('le quita media vida'); }
    if (mv.self?.boosts && Object.values(mv.self.boosts).some((v) => (v ?? 0) < 0)) score -= 3;
    if (move in CHARGE_MOVES) {
      const w = CHARGE_MOVES[move];
      const self = (w === 'Sun' && (ability === 'Drought' || set.item === 'Charizardite Y')) || (w === 'Rain' && ability === 'Drizzle');
      if (!self) { score -= 18; reasons.push(`tarda 2 turnos sin ${w === 'Sun' ? 'sol' : 'lluvia'}`); }
    }
    if (BAD_MOVES.has(move)) { score -= 30; reasons.push('poco fiable en competitivo'); }
    // cobertura respecto a los otros ataques
    const otherAtk = others.filter((o) => !isStatusMove(o) && o !== 'Fake Out');
    const otherTypes = otherAtk.map((o) => attackType(o, ability));
    const utility = (m: string) => !!EFFECT_BONUS[m]?.[2] || (getMove(m)?.priority ?? 0) > 0;
    const dupe = otherAtk.filter((o) => attackType(o, ability) === type);
    if (dupe.length) {
      const soft = utility(move) || dupe.every(utility);
      score -= soft ? 8 : 25;
      reasons.push(`ya tiene un ataque ${TYPE_ES[type]} (${dupe.join(', ')})`);
    }
    const strongStab = (m: string) => { const x = getMove(m); const t = attackType(m, ability); return !!x && x.basePower >= 80 && (sp.types as string[]).includes(t); };
    if (stab > 1 && bp >= 80 && !otherAtk.some(strongStab)) { score += 10; reasons.push('ataque principal con STAB'); }
    const targets = metaTargets(format);
    const total = targets.reduce((t, x) => t + x.weight, 0) || 1;
    const covered = (t: string, defTypes: string[]) => effectiveness(t, defTypes) >= 2;
    const gain = targets.filter((x) => covered(type, x.types) && !otherTypes.some((o) => covered(o, x.types)));
    const g = gain.reduce((t, x) => t + x.weight, 0) / total;
    if (g > 0.04) {
      score += Math.min(14, g * 45);
      reasons.push(`súper eficaz contra ${gain.sort((a, b) => b.weight - a.weight).slice(0, 3).map((x) => x.species).join(', ')}${gain.length > 3 ? '…' : ''}`);
    }
  }
  if (meta) { score += 20; reasons.unshift('lo lleva el set más usado del meta'); }
  if (!legal) { reasons.unshift('no puede aprenderlo'); score = -100; }
  return { move, score, reasons, learnable: legal };
}

/** Todos los movimientos aprendibles puntuados para el hueco que no es `others`. */
export function rankMoves(set: PokemonSet, format: Format, others: string[]) {
  return learnable(set.species).map((m) => scoreMove(set, m, format, others)).sort((a, b) => b.score - a.score);
}

// ───────────────────────── Build recomendado ─────────────────────────

export interface BuildPart { label: string; value: string; reasons: string[] }
export interface Build { set: PokemonSet; parts: BuildPart[]; role: string; metaSet?: PokemonSet; metaEntry?: MetaEntry }

export function recommendBuild(species: string, format: Format, team: PokemonSet[] = []): Build {
  const meta = metaEntry(species, format);
  const base: PokemonSet = structuredClone(meta?.set ?? defaultSet(species));
  base.species = species;
  const stones = megaStonesFor(species);
  const stone = meta?.set && stones.includes(meta.set.item) ? meta.set.item : stones[0];
  const working: PokemonSet = { ...base, item: stone ?? '' };
  const forme = effectiveSpecies(working, true);
  const bs = getSpecies(forme)!.baseStats;

  // 1) movimientos: elección voraz (cada uno se valora junto a los ya elegidos)
  const picks: MoveScore[] = [];
  for (let k = 0; k < 4; k++) {
    const chosen = picks.map((p) => p.move);
    const best = learnable(species).filter((m) => !chosen.includes(m))
      .map((m) => scoreMove(working, m, format, chosen)).sort((a, b) => b.score - a.score)[0];
    if (!best || best.score < -50) break;
    picks.push(best);
  }
  // re-puntuar cada movimiento con los otros 3 para explicar bien
  const moves = picks.map((p) => p.move);
  const moveParts = moves.map((m) => scoreMove(working, m, format, moves.filter((x) => x !== m)));
  working.moves = moves;

  // 2) rol, naturaleza y Stat Points
  const statusCount = moves.filter((m) => isStatusMove(m) && !STATUS_MOVES.protect.includes(m)).length;
  const physical = moves.filter((m) => getMove(m)?.category === 'Physical').length >= moves.filter((m) => getMove(m)?.category === 'Special').length && bs.atk >= bs.spa * 0.9;
  const trickRoom = moves.includes('Trick Room') || bs.spe <= 50;
  const support = statusCount >= 2 && Math.max(bs.atk, bs.spa) < 110;
  let nature: string; let sp: SP; let role: string; const natureWhy: string[] = []; const spWhy: string[] = [];
  if (support) {
    role = 'Soporte';
    nature = physical ? 'Careful' : 'Calm';
    if (bs.def < bs.spd) nature = physical ? 'Impish' : 'Bold';
    sp = { hp: 32, atk: 0, def: 16, spa: 0, spd: 18, spe: 0 };
    natureWhy.push(`sube su defensa más débil y baja el stat ofensivo que no usa`);
    spWhy.push('máximos PS y defensas repartidas para aguantar y apoyar');
  } else if (trickRoom) {
    role = 'Atacante lento (Espacio Raro)';
    nature = physical ? 'Brave' : 'Quiet';
    sp = { hp: 32, atk: physical ? 32 : 0, def: 2, spa: physical ? 0 : 32, spd: 0, spe: 0 };
    natureWhy.push('más daño y menos velocidad: va primero bajo Espacio Raro');
    spWhy.push('PS y ataque al máximo, 0 en velocidad');
  } else if (bs.spe >= 80) {
    role = physical ? 'Atacante físico rápido' : 'Atacante especial rápido';
    nature = physical ? 'Jolly' : 'Timid';
    sp = { hp: 2, atk: physical ? 32 : 0, def: 0, spa: physical ? 0 : 32, spd: 0, spe: 32 };
    natureWhy.push(`+Velocidad: con base ${bs.spe} adelanta a más rivales`);
    spWhy.push(`${physical ? 'Ataque' : 'At. Esp.'} y Velocidad al máximo`);
  } else {
    role = physical ? 'Atacante físico robusto' : 'Atacante especial robusto';
    nature = physical ? 'Adamant' : 'Modest';
    sp = { hp: 32, atk: physical ? 32 : 0, def: 0, spa: physical ? 0 : 32, spd: 0, spe: 2 };
    natureWhy.push(`+${physical ? 'Ataque' : 'At. Esp.'}: no es rápido, mejor pegar más fuerte`);
    spWhy.push('PS y ataque al máximo para aguantar y golpear');
  }
  working.nature = nature;
  working.sp = sp;

  // 3) habilidad
  const ab = rankAbilities(working, format, [...team.filter((t) => t.species !== species), working])[0];
  if (ab) working.ability = ab.ability;

  // 4) objeto (respetando los que ya llevan tus compañeros)
  const mates = team.filter((t) => t.species !== species);
  const used = new Set(mates.map((m) => m.item).filter(Boolean));
  const items = ALL_ITEMS.filter((i) => !used.has(i)).map((i) => scoreItem(working, i, [...mates, working], format)).sort((a, b) => b.score - a.score);
  let item = items[0];
  // si la megapiedra elegida para valorar los ataques empata con otra (p. ej. Garchompite / Garchompite Z), mantenerla
  if (item?.mega && stone) item = items.find((x) => x.item === stone) ?? item;
  working.item = item?.item ?? '';

  const parts: BuildPart[] = [
    ...moveParts.map((m, i) => ({ label: `Movimiento ${i + 1}`, value: m.move, reasons: m.reasons })),
    { label: 'Habilidad', value: working.ability, reasons: ab?.reasons.length ? ab.reasons : ['la mejor de las que puede tener'] },
    { label: 'Objeto', value: itemName(working.item), reasons: [item?.reason ?? '', ...(used.size ? [`(sin repetir: ${[...used].join(', ')} ya los llevan tus compañeros)`] : [])].filter(Boolean) },
    { label: 'Naturaleza', value: nature, reasons: natureWhy },
    { label: 'Stat Points', value: Object.entries(sp).filter(([, v]) => v).map(([k, v]) => `${v} ${({ hp: 'PS', atk: 'Ata', def: 'Def', spa: 'AtEsp', spd: 'DefEsp', spe: 'Vel' } as Record<string, string>)[k]}`).join(' / '), reasons: spWhy },
  ];
  return { set: working, parts, role, metaSet: meta?.set, metaEntry: meta };
}

// ───────────────────────── Enfrentamientos ─────────────────────────

export interface Hit { move: string; minPct: number; maxPct: number; hits: number }
export interface Matchup {
  entry: MetaEntry;
  foe: BattleMon;
  mine: Hit;
  theirs: Hit;
  mySpeed: number;
  theirSpeed: number;
  verdict: 'win' | 'lose' | 'even';
  margin: number;
  summary: string;
}

function bestHit(a: BattleMon, d: BattleMon): Hit {
  const state = neutralState();
  let best: Hit = { move: '—', minPct: 0, maxPct: 0, hits: Infinity };
  for (const m of a.set.moves) {
    if (isStatusMove(m)) continue;
    const r = computeDamage(state, a, d, m);
    const hits = r.minPct > 0 ? Math.ceil(100 / r.minPct) : Infinity;
    if (r.maxPct > best.maxPct) best = { move: m, minPct: r.minPct, maxPct: r.maxPct, hits };
  }
  return best;
}

const speedOf = (m: BattleMon) => Math.floor(m.stats.spe * (m.set.item === 'Choice Scarf' ? 1.5 : 1));
export const koText = (h: Hit) => (h.hits === Infinity ? 'no le hace daño' : h.hits === 1 ? 'KO directo' : `${h.hits}HKO`);

export function matchups(set: PokemonSet, format: Format) {
  const me = battleMonFor(set, 0, true);
  const rows: Matchup[] = metaTop(format, 100).filter((e) => e.set && e.species !== set.species).map((entry) => {
    const foe = battleMonFor(entry.set!, 1, true);
    const mine = bestHit(me, foe);
    const theirs = bestHit(foe, me);
    const mySpeed = speedOf(me);
    const theirSpeed = speedOf(foe);
    const faster = mySpeed > theirSpeed ? 1 : mySpeed < theirSpeed ? -1 : 0;
    // ganas si necesitas menos golpes, o los mismos y eres más rápido
    const diff = (theirs.hits === Infinity ? 9 : theirs.hits) - (mine.hits === Infinity ? 9 : mine.hits);
    const margin = diff + faster * 0.5;
    const verdict: Matchup['verdict'] = margin > 0 ? 'win' : margin < 0 ? 'lose' : 'even';
    const summary = `Tú: ${mine.move} ${mine.minPct}–${mine.maxPct}% (${koText(mine)}). Él: ${theirs.move} ${theirs.minPct}–${theirs.maxPct}% (${koText(theirs)}). ${faster > 0 ? 'Eres más rápido' : faster < 0 ? 'Es más rápido' : 'Empate de velocidad'} (${mySpeed} vs ${theirSpeed}).`;
    return { entry, foe, mine, theirs, mySpeed, theirSpeed, verdict, margin, summary };
  });
  const w = (m: Matchup) => metaWeight(m.entry);
  return {
    me,
    strong: rows.filter((r) => r.verdict === 'win').sort((a, b) => b.margin * 10 + w(b) - (a.margin * 10 + w(a))),
    weak: rows.filter((r) => r.verdict === 'lose').sort((a, b) => a.margin * 10 - w(a) - (b.margin * 10 - w(b))),
    even: rows.filter((r) => r.verdict === 'even').sort((a, b) => w(b) - w(a)),
  };
}

/** Tabla de tipos: debilidades, resistencias, inmunidades y cobertura ofensiva. */
export function typeProfile(set: PokemonSet) {
  const me = battleMonFor(set, 0, true);
  const def = TYPES.map((t) => ({ type: t, mult: defensiveMultiplier(me, t) }));
  const atkTypes = [...new Set(set.moves.filter((m) => !isStatusMove(m)).map((m) => attackType(m, me.ability)))];
  const offense = TYPES.map((t) => ({ type: t, best: Math.max(0, ...atkTypes.map((a) => effectiveness(a, [t]))) }));
  return {
    x4: def.filter((d) => d.mult >= 4).map((d) => d.type),
    x2: def.filter((d) => d.mult === 2).map((d) => d.type),
    half: def.filter((d) => d.mult === 0.5).map((d) => d.type),
    quarter: def.filter((d) => d.mult > 0 && d.mult <= 0.25).map((d) => d.type),
    immune: def.filter((d) => d.mult === 0).map((d) => d.type),
    superEffective: offense.filter((o) => o.best >= 2).map((o) => o.type),
    resisted: offense.filter((o) => o.best > 0 && o.best < 1).map((o) => o.type),
    noDamage: offense.filter((o) => o.best === 0).map((o) => o.type),
    atkTypes,
    usage: (e?: MetaEntry) => (e ? usageLabel(e) : ''),
  };
}

