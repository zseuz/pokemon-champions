/** Controlador de un combate en curso: acciones elegidas, consejo de la IA y resolución del turno. */
import { useState } from 'react';
import { chooseActions, evaluateOptions, type Option } from '../models/engine/ai';
import {
  benchOf, monAt, moveTargetKind, needsReplacement, replaceFainted, resolveTurn, type Action, type BattleState, type SideActions,
} from '../models/engine/battle';

export function useBattleController(battle: BattleState, setBattle: (b: BattleState) => void, difficulty: number) {
  const [choices, setChoices] = useState<(Action | null)[]>([null, null]);
  const [hint, setHint] = useState<Option[][] | null>(null);

  const mine = [0, 1].map((slot) => monAt(battle, { side: 0, slot }));
  const foes = [0, 1].map((slot) => monAt(battle, { side: 1, slot }));
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
    const ai = chooseActions(battle, 1, difficulty);
    setBattle(resolveTurn(battle, [choices as SideActions, ai]));
    setChoices([null, null]);
    setHint(null);
  };

  const showHint = () => setHint(mine.map((m) => (m ? evaluateOptions(battle, m).slice(0, 3) : [])));
  /** Aplica la mejor jugada del consejo (solo una Mega por turno). */
  const applyHint = () => {
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

  return { choices, setChoice, hint, mine, foes, ready, megaClaimed, submit, showHint, applyHint, replaceSlots, replacements, replace };
}
