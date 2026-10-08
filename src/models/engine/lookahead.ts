/**
 * IA que mira un turno adelante: para cada combinación de jugadas candidatas simula el turno
 * (contra la mejor respuesta del rival, varias veces por el azar) y puntúa cómo queda la partida.
 */
import { chooseActions, evaluateOptions, type Option } from './ai';
import { resolveTurn, type Action, type BattleMon, type BattleState, type SideActions, type SideIdx } from './battle';

/** Valor de un Pokémon: vivo, PS restantes, mejoras de stats y estados. */
function monValue(m: BattleMon): number {
  if (m.fainted) return 0;
  const b = m.boosts;
  const boosts = Math.max(-12, Math.min(16, (b.atk + b.spa) * 4 + b.spe * 5 + (b.def + b.spd) * 2));
  const status = m.status === 'slp' ? 14 : m.status === 'tox' ? 10 : m.status ? 7 : 0;
  const perish = m.perish ? (5 - m.perish) * 12 : 0;
  return 40 + 60 * (m.hp / m.maxHP) + boosts - status - perish;
}

function sideValue(state: BattleState, side: SideIdx): number {
  const s = state.sides[side];
  let v = s.team.reduce((t, m) => t + monValue(m), 0);
  const alive = s.team.filter((m) => !m.fainted).length;
  // trampas en tu lado: te quitan PS en cada cambio
  v -= ((s.stealthRock ? 6 : 0) + s.spikes * 4) * Math.max(0, alive - 1);
  if (s.tailwind) v += 6;
  if (s.reflect || s.lightScreen || s.auroraVeil) v += 6;
  return v;
}

/** Ventaja de `side` en un estado (positivo = vas ganando). */
export function positionValue(state: BattleState, side: SideIdx): number {
  if (state.winner === side) return 1000;
  if (state.winner === 'draw') return 0;
  if (state.winner != null) return -1000;
  return sideValue(state, side) - sideValue(state, (1 - side) as SideIdx);
}

export interface Plan {
  actions: SideActions;
  /** etiquetas de cada jugada (por posición) */
  labels: string[];
  /** ventaja media esperada tras el turno */
  value: number;
  /** ventaja actual, para comparar */
  now: number;
}

/** Combina las mejores opciones de cada posición (sin cambiar dos al mismo y con una sola Mega). */
function combos(perSlot: (Option[] | null)[]): Option[][] {
  let out: (Option | null)[][] = [[]];
  for (const opts of perSlot) {
    if (!opts) { out = out.map((c) => [...c, null]); continue; }
    out = out.flatMap((c) => opts.map((o) => [...c, o]));
  }
  return out
    .filter((c) => {
      const sw = c.filter((o) => o?.action.type === 'switch').map((o) => (o!.action as { to: number }).to);
      return new Set(sw).size === sw.length;
    })
    .map((c) => {
      let mega = false;
      return c.map((o) => {
        if (!o || o.action.type !== 'move' || !o.action.mega) return o;
        const keep = !mega;
        mega = true;
        return keep ? o : { ...o, action: { ...o.action, mega: false } };
      });
    }) as Option[][];
}

/**
 * Mejores planes para `side` mirando un turno adelante.
 * `width` = opciones candidatas por Pokémon; `samples` = simulaciones por plan (el daño es aleatorio).
 */
export function lookaheadPlans(state: BattleState, side: SideIdx, width?: number, samples = 3): Plan[] {
  if (state.phase !== 'choose') return [];
  const other = (1 - side) as SideIdx;
  const mons = state.sides[side].active.map((idx) => (idx == null ? null : state.sides[side].team[idx]));
  const w = width ?? (mons.length > 1 ? 3 : 5);
  const perSlot = mons.map((m) => (m && !m.fainted ? evaluateOptions(state, m).slice(0, w) : null));
  // respuesta del rival: su mejor jugada según la evaluación directa (sin mirar adelante)
  const reply = chooseActions(state, other, 0);
  const now = positionValue(state, side);
  const plans: Plan[] = [];
  for (const c of combos(perSlot)) {
    const actions: SideActions = c.map((o) => (o ? { ...o.action } as Action : null));
    let total = 0;
    for (let i = 0; i < samples; i++) {
      const next = resolveTurn(state, side === 0 ? [actions, reply] : [reply, actions]);
      total += positionValue(next, side);
    }
    // pequeño desempate con la puntuación directa de cada jugada
    const direct = c.reduce((t, o) => t + (o?.score ?? 0), 0);
    plans.push({ actions, labels: c.map((o) => o?.label ?? ''), value: total / samples + direct * 0.05, now });
  }
  return plans.sort((a, b) => b.value - a.value);
}

/** La mejor jugada mirando un turno adelante (o null si no hay que elegir). */
export function bestPlan(state: BattleState, side: SideIdx): Plan | null {
  return lookaheadPlans(state, side)[0] ?? null;
}
