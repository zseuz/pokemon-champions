/**
 * Resumen táctico de un turno de dobles (2 contra 2): el mejor ataque de cada uno de tus Pokémon
 * contra cada rival, ataques en área, KOs combinando a los dos (focus) y qué rival amenaza a cuál de los tuyos.
 */
import {
  activeMons, computeDamage, effSpeed, isStatusMove, legalMoves, moveTargetKind, type BattleMon, type BattleState, type SideIdx,
} from '../engine/battle';

export type KO = 'sure' | 'chance' | null;

export interface Hit {
  attacker: BattleMon;
  target: BattleMon;
  move: string;
  minPct: number;
  maxPct: number;
  /** probabilidad de dejarlo KO con PS actuales (0-1) */
  koChance: number;
  ko: KO;
  spread: boolean;
  /** el atacante se mueve antes que el objetivo (sin contar prioridad) */
  faster: boolean;
  /** ataque de carga: este turno solo se prepara (sin su clima ni Hierba Única) */
  charge: boolean;
}

export interface FocusFire {
  target: BattleMon;
  parts: Hit[];
  minPct: number;
  maxPct: number;
  /** PS que le quedan al objetivo (%) */
  hpPct: number;
  ko: KO;
}

export interface DoublesBrief {
  /** por cada uno de tus Pokémon en combate: su mejor golpe contra cada rival */
  attacks: { mon: BattleMon; vs: Hit[]; spread: Hit[] }[];
  /** atacar los dos al mismo rival */
  focus: FocusFire[];
  /** por cada uno de tus Pokémon: lo más fuerte que le puede hacer cada rival */
  danger: { mon: BattleMon; from: Hit[]; total: number }[];
}

const hpPct = (m: BattleMon) => (m.hp / m.maxHP) * 100;

function outspeeds(state: BattleState, a: BattleMon, b: BattleMon) {
  const sa = effSpeed(state, a);
  const sb = effSpeed(state, b);
  return state.trickRoom > 0 ? sa < sb : sa > sb;
}

const CHARGE: Record<string, string> = { 'Electro Shot': 'Rain', 'Solar Beam': 'Sun', 'Solar Blade': 'Sun', 'Meteor Beam': '' };
const needsCharge = (state: BattleState, a: BattleMon, move: string) =>
  move in CHARGE && !a.charging && a.item !== 'Power Herb' && state.weather?.type !== CHARGE[move];

function hit(state: BattleState, a: BattleMon, t: BattleMon, move: string, spread: boolean): Hit {
  const d = computeDamage(state, a, t, move, { spread });
  const left = hpPct(t);
  const koChance = d.rolls.length ? d.rolls.filter((r) => (r / t.maxHP) * 100 >= left).length / d.rolls.length : 0;
  return {
    attacker: a, target: t, move, minPct: d.minPct, maxPct: d.maxPct, koChance, spread,
    ko: koChance >= 1 ? 'sure' : koChance > 0 ? 'chance' : null, faster: outspeeds(state, a, t), charge: needsCharge(state, a, move),
  };
}

const avg = (h: Hit) => (h.minPct + h.maxPct) / 2;
/** Mejor golpe: primero el que más probabilidad de KO tiene, luego el que más daño hace; los de carga, al final (llegan un turno tarde). */
const better = (a: Hit, b: Hit) => (Number(a.charge) - Number(b.charge)) || (b.koChance - a.koChance) || (avg(b) - avg(a));

/** Mejor ataque de `a` contra `t` (incluye los de área si hay dos rivales: hacen un 25 % menos). */
export function bestHit(state: BattleState, a: BattleMon, t: BattleMon): Hit | null {
  const foes = activeMons(state, t.side);
  const hits = legalMoves(a)
    .filter((mv) => !isStatusMove(mv))
    .map((mv) => hit(state, a, t, mv, foes.length > 1 && moveTargetKind(mv) !== 'foe'))
    .filter((h) => h.maxPct > 0)
    .sort(better);
  return hits[0] ?? null;
}

/** Resumen del turno para el bando `side` (0 = tú). */
export function doublesBrief(state: BattleState, side: SideIdx = 0): DoublesBrief {
  const mine = activeMons(state, side);
  const foes = activeMons(state, (1 - side) as SideIdx);

  const attacks = mine.map((mon) => {
    const vs = foes.map((f) => bestHit(state, mon, f)).filter((h): h is Hit => !!h);
    // ataques en área: golpean a los dos rivales (y a tu aliado si es "a todos")
    const spread = foes.length > 1
      ? legalMoves(mon).filter((mv) => !isStatusMove(mv) && moveTargetKind(mv) !== 'foe').flatMap((mv) => foes.map((f) => hit(state, mon, f, mv, true)))
      : [];
    return { mon, vs, spread };
  });

  const focus: FocusFire[] = mine.length > 1 ? foes.map((target) => {
    const parts = mine.map((m) => bestHit(state, m, target)).filter((h): h is Hit => !!h);
    const minPct = parts.reduce((t, h) => t + h.minPct, 0);
    const maxPct = parts.reduce((t, h) => t + h.maxPct, 0);
    const left = hpPct(target);
    return { target, parts, minPct, maxPct, hpPct: left, ko: minPct >= left ? 'sure' : maxPct >= left ? 'chance' : null } as FocusFire;
  }) : [];

  const danger = mine.map((mon) => {
    const from = foes.map((f) => bestHit(state, f, mon)).filter((h): h is Hit => !!h).sort(better);
    return { mon, from, total: from.reduce((t, h) => t + avg(h), 0) };
  });

  return { attacks, focus, danger };
}
