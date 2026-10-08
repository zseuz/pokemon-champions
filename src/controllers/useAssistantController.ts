/** Controlador de la vista Assistant: estado y lógica, sin interfaz. */
import { useMemo, useState } from 'react';
import { metaEntry, metaFor, type Format } from '../models/data/meta';
import { evaluateOptions, rankSwitchIns, speedOrder } from '../models/engine/ai';
import { bestPlan } from '../models/engine/lookahead';
import { computeDamage, monAt, type BattleMon, type BattleState, type Terrain, type Weather } from '../models/engine/battle';
import { getSpecies } from '../models/domain/dex';
import { defaultSet, type PokemonSet } from '../models/domain/sets';
import { battleMonFor, neutralState } from '../models/analysis/teamAnalysis';
import { doublesBrief } from '../models/analysis/doublesBrief';

export type Status = '' | 'brn' | 'par' | 'psn' | 'tox' | 'slp';
export interface SlotState {
  set: PokemonSet | null;
  hp: number;
  status: Status;
  mega: boolean;
  fresh: boolean;
  boosts: { atk: number; def: number; spa: number; spd: number; spe: number };
}
export const newSlot = (set: PokemonSet | null): SlotState => ({
  set, hp: 100, status: '', mega: false, fresh: true, boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
});

/**
 * Individuales: cada uno lleva 3 Pokémon y hay 1 en combate por lado.
 * Dobles: cada uno lleva 4 de sus 6 y hay 2 en combate por lado (los otros 2 en reserva).
 */
export function useAssistantController(team: PokemonSet[], format: Format) {
  const singles = format === 'singles';
  const N = singles ? 3 : 4;
  /** Pokémon en combate por lado */
  const onField = singles ? 1 : 2;
  const [mineIdx, setMineIdx] = useState<number[]>(() => Array.from({ length: N }, (_, i) => (i < team.length ? i : -1)));
  const [mine, setMine] = useState<SlotState[]>(() => Array.from({ length: N }, () => newSlot(null)));
  const [theirs, setTheirs] = useState<SlotState[]>(() => {
    const foes = metaFor(format).filter((m) => m.set && !team.some((t) => t.species === m.species));
    return Array.from({ length: N }, (_, i) => newSlot(foes[i] ? structuredClone(foes[i].set!) : null));
  });
  // posiciones (de los N que llevas) que están en combate
  const [actives, setActives] = useState<[number[], number[]]>(() => singles ? [[0], [0]] : [[0, 1], [0, 1]]);
  /** Marca/desmarca un Pokémon como en combate (en dobles, como mucho 2: si ya hay 2, sale el primero). */
  const toggleActive = (side: 0 | 1, i: number) => setActives((prev) => {
    const cur = prev[side];
    const next = singles ? [i] : cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].slice(-onField);
    return (side === 0 ? [next, prev[1]] : [prev[0], next]) as [number[], number[]];
  });
  const [weather, setWeather] = useState<'' | Weather>('');
  const [terrain, setTerrain] = useState<'' | Terrain>('');
  const [trickRoom, setTrickRoom] = useState(false);
  const [tw, setTw] = useState<[boolean, boolean]>([false, false]);
  const [screens, setScreens] = useState<[string, string]>(['', '']);
  const [editingFoe, setEditingFoe] = useState<number | null>(null);

  // los sets propios salen siempre del equipo
  const mineSlots = mine.map((s, i) => ({ ...s, set: team[mineIdx[i]] ?? null }));

  const state = useMemo<BattleState>(() => {
    const st = neutralState();
    st.format = format;
    st.trickRoom = trickRoom ? 5 : 0;
    if (weather) st.weather = { type: weather, turns: 5 };
    if (terrain) st.terrain = { type: terrain, turns: 5 };
    const build = (slots: SlotState[], side: 0 | 1, actives: number[], extraBench: PokemonSet[]) => {
      const s = st.sides[side];
      s.tailwind = tw[side] ? 3 : 0;
      if (screens[side]) s[screens[side] as 'reflect' | 'lightScreen' | 'auroraVeil'] = 3;
      const mons = slots.map((sl) => {
        if (!sl.set || !getSpecies(sl.set.species)) return null;
        const m = battleMonFor(sl.set, side, sl.mega);
        // 0 PS = debilitado: no cuenta para combatir, cambiar ni en las tablas
        m.hp = sl.hp <= 0 ? 0 : Math.max(1, Math.round((m.maxHP * sl.hp) / 100));
        if (sl.hp <= 0) m.fainted = true;
        m.status = sl.status;
        m.turnsOnField = sl.fresh ? 0 : 1;
        Object.assign(m.boosts, sl.boosts);
        if (sl.mega && m.isMega) s.megaUsed = true;
        return m;
      });
      // primero los que están en combate, luego la reserva
      const order = [...actives, ...slots.map((_, i) => i).filter((i) => !actives.includes(i))];
      const teamMons: BattleMon[] = [];
      const pos = new Map<number, number>();
      for (const i of order) if (mons[i]) { pos.set(i, teamMons.length); teamMons.push(mons[i]!); }
      s.team = [...teamMons, ...extraBench.map((b) => battleMonFor(b, side, false))];
      s.active = actives.map((i) => pos.get(i) ?? null);
    };
    build(mineSlots, 0, actives[0], []);
    build(theirs, 1, actives[1], []);
    // en dobles siempre hay 2 posiciones, aunque una esté vacía
    for (const s of st.sides) while (s.active.length < onField) s.active.push(null);
    return st;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(mineSlots), JSON.stringify(theirs), weather, terrain, trickRoom, tw, screens, team, mineIdx, JSON.stringify(actives), format]);

  const slotsN = singles ? [0] : [0, 1];
  const myMons = slotsN.map((slot) => monAt(state, { side: 0, slot }));
  const foeMons = slotsN.map((slot) => monAt(state, { side: 1, slot }));
  // Pokémon en combate aunque esté debilitado (monAt los oculta)
  const rawActive = (side: 0 | 1, slot: number): BattleMon | null => {
    const idx = state.sides[side].active[slot];
    return idx == null ? null : state.sides[side].team[idx] ?? null;
  };
  const foesAlive = foeMons.some(Boolean);
  const advice = useMemo(() => myMons.map((m) => (m && foesAlive ? evaluateOptions(state, m).slice(0, singles ? 5 : 4) : [])), [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const foeAdvice = useMemo(() => foeMons.map((m) => (m && myMons.some(Boolean) ? evaluateOptions(state, m).slice(0, singles ? 3 : 2) : [])), [state]); // eslint-disable-line react-hooks/exhaustive-deps
  /** jugada conjunta recomendada mirando un turno adelante (simula la mejor respuesta del rival) */
  const plan = useMemo(() => (myMons.some(Boolean) && foesAlive ? bestPlan(state, 0) : null), [state]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Dobles: mejor ataque de cada uno contra cada rival, KOs entre los dos y peligros */
  const brief = useMemo(() => (!singles && myMons.some(Boolean) && foesAlive ? doublesBrief(state, 0) : null), [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const myReplace = useMemo(() => rankSwitchIns(state, 0).slice(0, 3), [state]);
  const foeReplace = useMemo(() => rankSwitchIns(state, 1).slice(0, 3), [state]);
  const alive = (side: 0 | 1) => state.sides[side].team.filter((m) => !m.fainted).length;
  const order = useMemo(() => speedOrder(state), [state]);

  /** Al elegir un Pokémon rival se carga su set más usado del meta. */
  const foeSetFor = (species: string): PokemonSet => structuredClone(metaEntry(species, format)?.set ?? defaultSet(species));
  /** Daño de un ataque (para las tablas de la vista). */
  const damage = (a: BattleMon, d: BattleMon, move: string, spread: boolean) => computeDamage(state, a, d, move, { spread });

  return { foeSetFor, damage, singles, N, onField, mineIdx, setMineIdx, mine, setMine, theirs, setTheirs, actives, toggleActive, weather, setWeather, terrain, setTerrain, trickRoom, setTrickRoom, tw, setTw, screens, setScreens, editingFoe, setEditingFoe, mineSlots, state, slotsN, myMons, foeMons, rawActive, foesAlive, advice, foeAdvice, plan, brief, myReplace, foeReplace, alive, order };
}
