import { describe, expect, it } from 'vitest';
import { historyStats, lossWeights, newBattle, type BattleRecord } from '../src/models/analysis/history';

const mk = (result: BattleRecord['result'], rival: string[], i: number, format: BattleRecord['format'] = 'singles', source: BattleRecord['source'] = 'real') =>
  newBattle({ format, source, result, mine: ['Garchomp'], rival, date: new Date(2026, 0, 1, 0, i).toISOString() });

describe('historial', () => {
  const h = [
    mk('loss', ['Kingambit', 'Gholdengo'], 1),
    mk('loss', ['Kingambit'], 2),
    mk('win', ['Gholdengo'], 3),
    mk('win', ['Gholdengo'], 4),
    mk('win', ['Kingambit'], 5, 'doubles'),
    mk('loss', ['Kingambit'], 6, 'singles', 'sim'),
  ];

  it('calcula victorias, racha y últimos resultados por formato', () => {
    const s = historyStats(h, 'singles', 'real');
    expect(s.games).toBe(4);
    expect(s.wins).toBe(2);
    expect(s.winRate).toBe(50);
    expect(s.streak).toBe(2);
    expect(s.recent).toEqual(['loss', 'loss', 'win', 'win']);
    expect(historyStats(h, 'singles').streak).toBe(-1);
  });

  it('detecta némesis y favoritos', () => {
    const s = historyStats(h, 'singles', 'real');
    expect(s.nemesis.map((x) => x.species)).toEqual(['Kingambit']);
    expect(s.favorites.map((x) => x.species)).toEqual(['Gholdengo']);
  });

  it('pondera como amenaza a quien te gana en ese formato', () => {
    const w = lossWeights(h, 'singles');
    expect(w.Kingambit).toBeGreaterThan(0);
    expect(w.Gholdengo).toBeUndefined();
    expect(lossWeights(h, 'doubles')).toEqual({});
  });
});
