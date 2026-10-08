/**
 * Evaluación de los candidatos que ofrece el reclutamiento de Pokémon Champions.
 * Cada candidato viene con habilidad, movimientos, naturaleza y Stat Points concretos,
 * así que se valora ESE ejemplar (no la especie en general) y cómo encaja en tu equipo.
 */
import { metaEntry, metaWeight, usageLabel, type Format } from '../data/meta';
import { abilityName, legalAbilities, rankAbilities } from '../domain/abilities';
import { isStatusMove } from '../engine/battle';
import { matchups, recommendBuild, scoreMove } from './build';
import { getMove, getSpecies, NATURES, STAT_ES, STATS, type StatID } from '../domain/dex';
import { moveLabel, natureEs } from '../domain/es';
import { effectiveSpecies, spTotal, type PokemonSet } from '../domain/sets';
import { collectionAdvice } from './synergy';

export interface PartGrade { label: string; pct: number; text: string; tips: string[] }

export interface CandidateEval {
  set: PokemonSet;
  /** calidad del ejemplar 0-100 (habilidad, ataques, naturaleza, SP) */
  quality: number;
  parts: PartGrade[];
  /** mejora que aporta a tu equipo (añadiéndolo o cambiándolo por alguien) */
  teamFit: number;
  replaces?: string;
  fitReasons: string[];
  wins: number;
  losses: number;
  metaText: string;
  total: number;
  verdict: string;
  /** si ya tienes un ejemplar de esa especie configurado: cómo se compara con el tuyo */
  owned?: { quality: number; diff: number; better: boolean; same: boolean };
}

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

function gradeAbility(set: PokemonSet, format: Format, team: PokemonSet[]): PartGrade {
  const ranked = rankAbilities(set, format, team);
  const legal = legalAbilities(set.species);
  if (!legal.includes(set.ability)) {
    return { label: 'Habilidad', pct: 30, text: `${abilityName(set.ability)} (no reconocida para ${set.species})`, tips: ['revisa que hayas elegido la habilidad correcta'] };
  }
  const pos = ranked.findIndex((r) => r.ability === set.ability);
  const best = ranked[0];
  const mine = ranked[pos];
  if (ranked.length === 1) return { label: 'Habilidad', pct: 100, text: `${abilityName(set.ability)} (la única que puede tener)`, tips: [] };
  // Megas: la habilidad base importa menos si va a megaevolucionar
  const spread = Math.max(1, best.score - ranked[ranked.length - 1].score);
  const pct = pos === 0 ? 100 : clamp(100 - ((best.score - mine.score) / spread) * 70);
  return {
    label: 'Habilidad', pct,
    text: pos === 0
      ? `★ ${abilityName(set.ability)}: la mejor de sus ${ranked.length} posibles${mine.reasons[0] ? ` (${mine.reasons[0]})` : ''}`
      : `${abilityName(set.ability)}: ${pos + 1}ª de ${ranked.length}. La mejor sería ${abilityName(best.ability)}${best.reasons[0] ? ` (${best.reasons[0]})` : ''}`,
    tips: pos === 0 ? [] : [`si te sale otro ${set.species} con ${abilityName(best.ability)}, es mejor`],
  };
}

function gradeMoves(set: PokemonSet, format: Format, ideal: PokemonSet): PartGrade {
  const scores = set.moves.map((m) => scoreMove(set, m, format, set.moves.filter((o) => o !== m)));
  const idealScores = ideal.moves.map((m) => scoreMove(ideal, m, format, ideal.moves.filter((o) => o !== m)));
  const sum = (xs: { score: number }[]) => xs.reduce((t, x) => t + Math.max(0, x.score), 0);
  const pct = clamp((sum(scores) / Math.max(1, sum(idealScores))) * 100);
  const good = scores.filter((x) => x.score >= 30).map((x) => moveLabel(x.move));
  const weak = scores.filter((x) => x.score < 15);
  const attacks = set.moves.filter((m) => !isStatusMove(m) && getMove(m)?.basePower);
  const tips: string[] = [];
  for (const w of weak) tips.push(`${moveLabel(w.move)} aporta poco${w.reasons[0] ? ` (${w.reasons.find((r) => r.startsWith('⚠') || r.startsWith('ya') || r.startsWith('usa')) ?? w.reasons[0]})` : ''}`);
  const missing = ideal.moves.filter((m) => !set.moves.includes(m)).slice(0, 2);
  if (missing.length && pct < 90) tips.push(`le vendrían mejor: ${missing.map(moveLabel).join(', ')}`);
  if (!attacks.length) tips.push('no tiene ataques que hagan daño');
  return {
    label: 'Movimientos', pct,
    text: `${good.length}/${set.moves.length} buenos${good.length ? `: ${good.join(', ')}` : ''}`,
    tips,
  };
}

function gradeNature(set: PokemonSet, ideal: PokemonSet): PartGrade {
  const n = NATURES.find((x) => x.name === set.nature);
  const sp = getSpecies(effectiveSpecies(set, true))!.baseStats;
  const atkMoves = set.moves.filter((m) => !isStatusMove(m));
  const phys = atkMoves.filter((m) => getMove(m)?.category === 'Physical').length;
  const spec = atkMoves.filter((m) => getMove(m)?.category === 'Special').length;
  const main: StatID = phys > spec ? 'atk' : spec > phys ? 'spa' : sp.atk >= sp.spa ? 'atk' : 'spa';
  const unused: StatID = main === 'atk' ? 'spa' : 'atk';
  const trick = set.moves.includes('Trick Room') || sp.spe <= 50;
  const label = `${natureEs(set.nature)} (${set.nature})`;
  if (!n?.plus || n.plus === n.minus) return { label: 'Naturaleza', pct: 55, text: `${label}: neutra`, tips: [`mejor ${natureEs(ideal.nature)} (${ideal.nature})`] };
  let pct = 50;
  const notes: string[] = [];
  if (n.plus === main) { pct += 35; notes.push(`+${STAT_ES[main]} (su stat de ataque)`); }
  else if (n.plus === 'spe' && !trick) { pct += 32; notes.push('+Velocidad'); }
  else if (n.plus === 'spe' && trick) { pct -= 20; notes.push('+Velocidad le perjudica en Espacio Raro'); }
  else if (n.plus === unused) { pct -= 25; notes.push(`+${STAT_ES[unused]}, que no usa`); }
  else { pct += 15; notes.push(`+${STAT_ES[n.plus]}`); }
  if (n.minus === unused) { pct += 15; notes.push(`−${STAT_ES[unused]} (no lo usa)`); }
  else if (n.minus === main) { pct -= 35; notes.push(`−${STAT_ES[main]}: le quita daño`); }
  else if (n.minus === 'spe' && trick) { pct += 15; notes.push('−Velocidad (bien para Espacio Raro)'); }
  else if (n.minus === 'spe') { pct -= 15; notes.push('−Velocidad'); }
  else notes.push(`−${STAT_ES[n.minus!]}`);
  return { label: 'Naturaleza', pct: clamp(pct), text: `${label}: ${notes.join(', ')}`, tips: pct < 70 ? [`mejor ${natureEs(ideal.nature)} (${ideal.nature})`] : [] };
}

function gradeSP(set: PokemonSet, ideal: PokemonSet): PartGrade {
  const total = spTotal(set.sp);
  const overlap = STATS.reduce((t, k) => t + Math.min(set.sp[k], ideal.sp[k]), 0);
  const pct = clamp((overlap / 66) * 100);
  const txt = STATS.filter((k) => set.sp[k]).map((k) => `${set.sp[k]} ${STAT_ES[k]}`).join(' / ') || 'sin repartir';
  const idealTxt = STATS.filter((k) => ideal.sp[k]).map((k) => `${ideal.sp[k]} ${STAT_ES[k]}`).join(' / ');
  return {
    label: 'Stat Points', pct, text: `${txt}${total < 66 ? ` (${total}/66)` : ''}`,
    tips: pct < 80 ? [`reparto ideal: ${idealTxt} (puedes cambiarlo en el juego)`] : [],
  };
}

/** Naturaleza y Stat Points ideales según los ataques que trae ESTE ejemplar. */
function idealSpread(set: PokemonSet): Pick<PokemonSet, 'nature' | 'sp'> {
  const bs = getSpecies(effectiveSpecies(set, true))!.baseStats;
  const atkMoves = set.moves.filter((m) => !isStatusMove(m));
  const phys = atkMoves.filter((m) => getMove(m)?.category === 'Physical').length;
  const spec = atkMoves.filter((m) => getMove(m)?.category === 'Special').length;
  const physical = phys > spec || (phys === spec && bs.atk >= bs.spa);
  const support = set.moves.filter((m) => isStatusMove(m) && m !== 'Protect').length >= 2 && atkMoves.length <= 2;
  const zero = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  if (support) return { nature: bs.def < bs.spd ? (physical ? 'Impish' : 'Bold') : (physical ? 'Careful' : 'Calm'), sp: { ...zero, hp: 32, def: 16, spd: 18 } };
  if (set.moves.includes('Trick Room') || bs.spe <= 50) return { nature: physical ? 'Brave' : 'Quiet', sp: { ...zero, hp: 32, [physical ? 'atk' : 'spa']: 32, def: 2 } };
  if (bs.spe >= 80) return { nature: physical ? 'Jolly' : 'Timid', sp: { ...zero, hp: 2, [physical ? 'atk' : 'spa']: 32, spe: 32 } };
  return { nature: physical ? 'Adamant' : 'Modest', sp: { ...zero, hp: 32, [physical ? 'atk' : 'spa']: 32, spe: 2 } };
}

/** Todas las naturalezas puntuadas para un set (según los ataques que lleva). */
export function rankNatures(set: PokemonSet) {
  const ideal = { ...set, ...idealSpread(set) };
  return NATURES.map((n) => {
    const g = gradeNature({ ...set, nature: n.name }, ideal);
    return { nature: n.name, pct: n.name === ideal.nature ? 100 : g.pct, text: g.text.replace(/^[^:]+: /, '') };
  }).sort((a, b) => b.pct - a.pct);
}

/** Califica un set (habilidad, movimientos, naturaleza y Stat Points) frente a lo ideal para ese Pokémon. */
export function gradeSet(set: PokemonSet, format: Format, team: PokemonSet[]) {
  const ideal = recommendBuild(set.species, format, team).set;
  const spread = { ...ideal, ...idealSpread(set) };
  const parts = [gradeAbility(set, format, team), gradeMoves(set, format, ideal), gradeNature(set, spread), gradeSP(set, spread)];
  // pesos: los ataques y la habilidad vienen fijados; naturaleza y SP suelen poder ajustarse
  const quality = clamp(parts[0].pct * 0.3 + parts[1].pct * 0.4 + parts[2].pct * 0.18 + parts[3].pct * 0.12);
  return { parts, quality, ideal };
}

export function evaluateCandidate(set: PokemonSet, format: Format, team: PokemonSet[], collection: PokemonSet[] = []): CandidateEval {
  const { parts, quality } = gradeSet(set, format, team);

  const others = team.filter((t) => t.species !== set.species);
  const adv = collectionAdvice(others, [...collection.filter((c) => c.species !== set.species), set], format);
  const fit = adv.fits.find((f) => f.set === set || f.set.species === set.species);
  const mu = matchups(set, format);
  const meta = metaEntry(set.species, format);
  const metaText = meta ? `Tier ${meta.tier} en ${format === 'doubles' ? 'dobles' : 'individuales'} (${usageLabel(meta)})` : 'poco usado en el meta';

  const teamFit = fit?.fit ?? 0;
  const total = quality * 0.55 + Math.max(-20, Math.min(40, teamFit)) * 0.8 + (meta ? metaWeight(meta) * 0.5 : 0) + (mu.strong.length - mu.weak.length) * 0.6;
  const bst = getSpecies(effectiveSpecies(set, true))!.baseStats;
  const strongStat = Math.max(bst.atk, bst.spa);
  let verdict = quality >= 80 ? 'Ejemplar muy bueno' : quality >= 60 ? 'Ejemplar correcto' : 'Ejemplar flojo';
  if (strongStat < 80 && !meta) verdict += ' · especie poco competitiva';
  return {
    set, quality, parts, teamFit, replaces: fit?.replaces, fitReasons: fit?.reasons ?? [],
    wins: mu.strong.length, losses: mu.weak.length, metaText, total, verdict,
  };
}

/**
 * Ordena los candidatos. `owned` = tus sets ya configurados por especie: si ya tienes ese Pokémon,
 * el candidato solo vale la pena si es MEJOR que el tuyo.
 */
export function rankCandidates(cands: PokemonSet[], format: Format, team: PokemonSet[], collection: PokemonSet[], owned: Record<string, PokemonSet> = {}) {
  return cands.map((c) => {
    const ev = evaluateCandidate(c, format, team, collection);
    const mine = owned[c.species];
    if (mine) {
      const q = gradeSet(mine, format, team).quality;
      const diff = ev.quality - q;
      const same = JSON.stringify({ ...mine, item: '' }) === JSON.stringify({ ...c, item: '' });
      const better = !same && diff > 3;
      ev.owned = { quality: q, diff, better, same };
      if (same) { ev.total -= 1000; ev.verdict += ' · ya lo reclutaste'; }
      else if (better) { ev.total += diff / 2; ev.verdict += ` · mejor que el tuyo (+${diff}%)`; }
      else { ev.total -= 40; ev.verdict += diff < -3 ? ` · peor que el tuyo (${diff}%)` : ' · igual que el que ya tienes'; }
    }
    return ev;
  }).sort((a, b) => b.total - a.total);
}

/** Set vacío para registrar un candidato tal como lo muestra el juego. */
export function blankCandidate(species: string): PokemonSet {
  return {
    species, ability: legalAbilities(species)[0] ?? '', item: '', nature: 'Hardy',
    sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, moves: [],
  };
}
