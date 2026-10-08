/** Controlador del simulador: vista previa (elegir 4 de 6), rival aleatorio, dificultad e inicio del combate. */
import { useState } from 'react';
import { createBattle, type BattleState } from '../models/engine/battle';
import { pickFour, randomMetaTeam } from '../models/engine/opponents';
import type { PokemonSet } from '../models/domain/sets';

export function useSimulatorController(team: PokemonSet[]) {
  const [rival, setRival] = useState<PokemonSet[]>(() => randomMetaTeam());
  const [picks, setPicks] = useState<number[]>([0, 1, 2, 3]);
  const [rivalPicks, setRivalPicks] = useState<number[] | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [difficulty, setDifficulty] = useState(0.15);

  const togglePick = (i: number) => {
    if (picks.includes(i)) setPicks(picks.filter((x) => x !== i));
    else if (picks.length < 4) setPicks([...picks, i]);
  };
  const newRival = () => setRival(randomMetaTeam());
  const start = () => {
    const rp = pickFour(rival);
    setRivalPicks(rp);
    setBattle(createBattle(picks.map((i) => team[i]), rp.map((i) => rival[i]), ['Tú', 'Rival']));
  };
  const exit = () => { setBattle(null); setRivalPicks(null); };
  const rematch = () => setBattle(createBattle(picks.map((i) => team[i]), (rivalPicks ?? [0, 1, 2, 3]).map((i) => rival[i])));

  return { rival, picks, togglePick, newRival, battle, setBattle, difficulty, setDifficulty, start, exit, rematch };
}
