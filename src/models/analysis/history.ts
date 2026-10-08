/**
 * Historial de combates (reales apuntados a mano o del simulador) y estadísticas:
 * % de victorias, contra qué Pokémon pierdes más y qué Pokémon tuyos rinden mejor.
 */
import type { Format } from '../data/meta';

export type BattleResult = 'win' | 'loss' | 'draw';

export interface BattleRecord {
  id: string;
  /** fecha ISO */
  date: string;
  format: Format;
  result: BattleResult;
  source: 'real' | 'sim';
  /** especies de tu equipo */
  mine: string[];
  /** especies del rival */
  rival: string[];
  notes?: string;
}

export function newBattle(data: Omit<BattleRecord, 'id' | 'date'> & { date?: string }): BattleRecord {
  return { ...data, id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, date: data.date ?? new Date().toISOString() };
}

export interface SpeciesStat { species: string; games: number; wins: number; losses: number; winRate: number }

const rate = (w: number, g: number) => (g ? Math.round((w / g) * 100) : 0);

function tally(records: BattleRecord[], pick: (b: BattleRecord) => string[]): SpeciesStat[] {
  const m = new Map<string, SpeciesStat>();
  for (const b of records) for (const sp of new Set(pick(b))) {
    const s = m.get(sp) ?? { species: sp, games: 0, wins: 0, losses: 0, winRate: 0 };
    s.games++;
    if (b.result === 'win') s.wins++;
    if (b.result === 'loss') s.losses++;
    m.set(sp, s);
  }
  return [...m.values()].map((s) => ({ ...s, winRate: rate(s.wins, s.games) }));
}

export interface HistoryStats {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  /** racha actual: +3 = 3 victorias seguidas, -2 = 2 derrotas */
  streak: number;
  /** rivales contra los que más pierdes (mín. 2 combates) */
  nemesis: SpeciesStat[];
  /** rivales contra los que más ganas */
  favorites: SpeciesStat[];
  /** rendimiento de tus Pokémon */
  mine: SpeciesStat[];
  /** últimos 10 resultados (más reciente al final) */
  recent: BattleResult[];
}

export function historyStats(history: BattleRecord[], format?: Format, source?: 'real' | 'sim'): HistoryStats {
  const list = history
    .filter((b) => (!format || b.format === format) && (!source || b.source === source))
    .sort((a, b) => a.date.localeCompare(b.date));
  const wins = list.filter((b) => b.result === 'win').length;
  const losses = list.filter((b) => b.result === 'loss').length;
  let streak = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i].result;
    if (r === 'draw') break;
    if (streak === 0) streak = r === 'win' ? 1 : -1;
    else if ((streak > 0) === (r === 'win')) streak += streak > 0 ? 1 : -1;
    else break;
  }
  const rivals = tally(list, (b) => b.rival);
  return {
    games: list.length, wins, losses, winRate: rate(wins, list.length), streak,
    nemesis: rivals.filter((s) => s.games >= 2 && s.losses > s.wins).sort((a, b) => b.losses - a.losses || a.winRate - b.winRate).slice(0, 8),
    favorites: rivals.filter((s) => s.games >= 2 && s.wins > s.losses).sort((a, b) => b.wins - a.wins || b.winRate - a.winRate).slice(0, 8),
    mine: tally(list, (b) => b.mine).sort((a, b) => b.games - a.games),
    recent: list.slice(-10).map((b) => b.result),
  };
}

/**
 * Peso extra de amenaza por especie según tus derrotas reales (0 = sin datos).
 * Se usa para priorizar en las recomendaciones a los rivales que de verdad te ganan.
 */
export function lossWeights(history: BattleRecord[], format: Format): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of tally(history.filter((b) => b.format === format), (b) => b.rival)) {
    if (s.games >= 2 && s.losses > s.wins) out[s.species] = Math.min(40, (s.losses - s.wins) * 8 + (100 - s.winRate) / 5);
  }
  return out;
}
