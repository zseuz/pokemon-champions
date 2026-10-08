/** Controlador del selector de acción de un Pokémon en el simulador: movimientos, objetivos, cambios y Mega. */
import { useState } from 'react';
import {
  benchOf, canMegaNow, legalMoves, legalTargets, monAt, moveTargetKind,
  type Action, type BattleMon, type BattleState, type Target,
} from '../models/engine/battle';
import { getMove } from '../models/domain/dex';
import { moveLabel } from '../models/domain/es';

export function useActionPickerController(
  battle: BattleState, mon: BattleMon, choice: Action | null, onChange: (a: Action | null) => void,
  megaBlocked: boolean, otherSwitch: number | null,
) {
  const [mega, setMegaState] = useState(false);
  const canMega = canMegaNow(battle, mon) && !megaBlocked;
  const selectedMove = choice?.type === 'move' ? choice.move : null;

  /** Botones de movimiento ya preparados para pintar. */
  const moves = legalMoves(mon).map((mv) => {
    const info = getMove(mv);
    return {
      move: mv, label: moveLabel(mv), type: info?.type ?? 'Normal', power: info?.basePower || 0,
      spread: ['spread', 'all'].includes(moveTargetKind(mv)),
      dimmed: (mv === 'Fake Out' || mv === 'First Impression') && mon.turnsOnField > 0,
    };
  });

  const pickMove = (mv: string) => {
    const foeTargets = legalTargets(battle, mon, mv).filter((t) => t.side === 1);
    onChange({ type: 'move', move: mv, target: foeTargets.length === 1 ? foeTargets[0] : undefined, mega: mega && canMega });
  };
  const setMega = (on: boolean) => {
    setMegaState(on);
    if (choice?.type === 'move') onChange({ ...choice, mega: on });
  };

  const needsTarget = !!selectedMove && moveTargetKind(selectedMove) === 'foe' && choice?.type === 'move' && !choice.target;
  const targets = needsTarget
    ? legalTargets(battle, mon, selectedMove!).map((t) => ({ t, name: monAt(battle, t)!.species, ally: t.side === 0 }))
    : [];
  const pickTarget = (t: Target | undefined) => { if (choice?.type === 'move') onChange({ ...choice, target: t }); };
  const chosenTarget = choice?.type === 'move' && choice.target && moveTargetKind(choice.move) === 'foe'
    ? monAt(battle, choice.target)?.species : undefined;
  const chosenLabel = choice ? (choice.type === 'move' ? moveLabel(choice.move) : `Cambio a ${battle.sides[0].team[choice.to].species}`) : '';

  const bench = benchOf(battle, 0).filter((i) => i !== otherSwitch).map((i) => {
    const b = battle.sides[0].team[i];
    return { i, species: b.species, hpPct: Math.round((b.hp / b.maxHP) * 100) };
  });
  const switchTo = (i: number) => onChange({ type: 'switch', to: i });

  return { mega, setMega, canMega, selectedMove, moves, pickMove, needsTarget, targets, pickTarget, chosenTarget, chosenLabel, bench, switchTo };
}
