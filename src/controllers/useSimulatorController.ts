/** Controlador del simulador: vista previa (elegir 4 de 6 en dobles, 3 de 6 en individuales), rival aleatorio, dificultad e inicio. */
import { useState } from 'react';
import { createBattle, type BattleState } from '../models/engine/battle';
import { pickFour, randomMetaTeam } from '../models/engine/opponents';
import type { PokemonSet } from '../models/domain/sets';
import type { Format } from '../models/data/meta';
import { newBattle, type BattleRecord } from '../models/analysis/history';

export function useSimulatorController(team: PokemonSet[], format: Format, onFinish?: (b: BattleRecord) => void) {
  /** Pokémon que se llevan al combate */
  const N = format === 'singles' ? 3 : 4;
  /** Pokémon que salen de inicio */
  const leads = format === 'singles' ? 1 : 2;
  const [rival, setRival] = useState<PokemonSet[]>(() => randomMetaTeam(6, format));
  const [picks, setPicks] = useState<number[]>(() => team.map((_, i) => i).slice(0, N));
  const [rivalPicks, setRivalPicks] = useState<number[] | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [difficulty, setDifficulty] = useState(0.15);

  const togglePick = (i: number) => {
    if (picks.includes(i)) setPicks(picks.filter((x) => x !== i));
    else if (picks.length < N) setPicks([...picks, i]);
  };
  const newRival = () => setRival(randomMetaTeam(6, format));
  const start = () => {
    const rp = pickFour(rival, N);
    setRivalPicks(rp);
    setBattle(createBattle(picks.map((i) => team[i]), rp.map((i) => rival[i]), ['Tú', 'Rival'], format));
  };
  const exit = () => { setBattle(null); setRivalPicks(null); };
  const rematch = () => setBattle(createBattle(picks.map((i) => team[i]), (rivalPicks ?? pickFour(rival, N)).map((i) => rival[i]), ['Tú', 'Rival'], format));

  /** Al terminar un combate se guarda en el historial (origen: simulador). */
  const recordEnd = (b: BattleState) => {
    if (!onFinish || b.phase !== 'end') return;
    onFinish(newBattle({
      format, source: 'sim',
      result: b.winner === 0 ? 'win' : b.winner === 1 ? 'loss' : 'draw',
      mine: b.sides[0].team.map((m) => m.set.species), rival: b.sides[1].team.map((m) => m.set.species),
    }));
  };

  return { N, leads, recordEnd, rival, picks, togglePick, newRival, battle, setBattle, difficulty, setDifficulty, start, exit, rematch };
}
