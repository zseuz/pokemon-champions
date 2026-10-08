/** Controlador de un combate en curso: acciones elegidas, consejo de la IA y resolución del turno. */
import { useState } from 'react';
import { chooseActions, evaluateOptions, type Option } from '../models/engine/ai';
import { bestPlan, type Plan } from '../models/engine/lookahead';
import {
  benchOf, monAt, moveTargetKind, needsReplacement, replaceFainted, resolveTurn, type Action, type BattleState, type SideActions,
} from '../models/engine/battle';

/** Dificultad: ruido de la IA (0.6 fácil, 0.15 normal, 0 difícil) o EXPERT = mira un turno adelante. */
export const EXPERT = -1;

export function useBattleController(battle: BattleState, setBattle: (b: BattleState) => void, difficulty: number) {
  const [choices, setChoices] = useState<(Action | null)[]>([null, null]);
  const [hint, setHint] = useState<Option[][] | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);

  // una posición en individuales, dos en dobles
  const mine = battle.sides[0].active.map((_, slot) => monAt(battle, { side: 0, slot }));
  const foes = battle.sides[1].active.map((_, slot) => monAt(battle, { side: 1, slot }));
  const ready = battle.phase === 'choose' && mine.every((m, i) => {
    const c = choices[i];
    if (!m) return true;
    if (!c) return false;
    return c.type === 'switch' || moveTargetKind(c.move) !== 'foe' || !!c.target;
  });
  const megaClaimed = (i: number) => choices.some((c, j) => j !== i && c?.type === 'move' && c.mega);
  const setChoice = (i: number, a: Action | null) => setChoices(choices.map((c, j) => (j === i ? a : c)));

  /** Resuelve el turno con tus acciones y las de la IA rival. */
  const submit = () => {
    const ai = difficulty === EXPERT ? bestPlan(battle, 1)?.actions ?? chooseActions(battle, 1, 0) : chooseActions(battle, 1, difficulty);
    setBattle(resolveTurn(battle, [choices as SideActions, ai]));
    setChoices([null, null]);
    setHint(null);
    setPlan(null);
  };

  const showHint = () => {
    setHint(mine.map((m) => (m ? evaluateOptions(battle, m).slice(0, 3) : [])));
    setPlan(bestPlan(battle, 0));
  };
  /** Aplica la mejor jugada del consejo: la del plan a un turno vista si existe (solo una Mega por turno). */
  const applyHint = () => {
    if (plan) { setChoices(plan.actions.map((a) => a ?? null)); return; }
    if (!hint) return;
    let megaTaken = false;
    setChoices(hint.map((opts, i) => {
      const a = opts[0]?.action;
      if (!a || !mine[i]) return null;
      if (a.type === 'move') {
        const mega = !megaTaken && !!a.mega;
        megaTaken ||= mega;
        return { ...a, mega };
      }
      return a;
    }));
  };

  const replaceSlots = battle.phase === 'replace' ? needsReplacement(battle) : [];
  const replacements = benchOf(battle, 0).map((i) => {
    const b = battle.sides[0].team[i];
    return { i, species: b.species, hpPct: Math.round((b.hp / b.maxHP) * 100) };
  });
  const replace = (slot: number, teamIdx: number) => setBattle(replaceFainted(battle, slot, teamIdx));

  return { plan, choices, setChoice, hint, mine, foes, ready, megaClaimed, submit, showHint, applyHint, replaceSlots, replacements, replace };
}
