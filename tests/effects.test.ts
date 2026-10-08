/** Individuales y efectos nuevos del simulador: trampas, Rugido, Otra Vez y Canto Mortal. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { metaEntry } from '../src/models/data/meta';
import { evaluateOptions } from '../src/models/engine/ai';
import { createBattle, legalMoves, monAt, resolveTurn, type Action, type BattleState } from '../src/models/engine/battle';

const set = (species: string, moves?: string[]) => {
  const s = structuredClone(metaEntry(species, 'doubles')!.set!);
  if (moves) s.moves = moves;
  return s;
};
const mv = (move: string): Action => ({ type: 'move', move, target: { side: 1, slot: 0 } });
const foeMv = (move: string): Action => ({ type: 'move', move, target: { side: 0, slot: 0 } });
const turn = (b: BattleState, mine: Action, theirs: Action) => resolveTurn(b, [[mine], [theirs]]);

beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => { vi.restoreAllMocks(); });

describe('Individuales', () => {
  it('solo hay un Pokémon activo por lado', () => {
    const b = createBattle([set('Garchomp'), set('Kingambit')], [set('Gyarados'), set('Incineroar')], ['Tú', 'Rival'], 'singles');
    expect(b.sides[0].active).toEqual([0]);
    expect(monAt(b, { side: 1, slot: 1 })).toBeNull();
  });

  it('Trampa Rocas daña al Pokémon que entra según su debilidad a Roca', () => {
    let b = createBattle([set('Garchomp', ['Stealth Rock', 'Protect'])], [set('Kingambit', ['Protect']), set('Gyarados')], ['Tú', 'Rival'], 'singles');
    b = turn(b, mv('Stealth Rock'), foeMv('Protect'));
    expect(b.sides[1].stealthRock).toBe(true);
    b = turn(b, mv('Protect'), { type: 'switch', to: 1 });
    const gyarados = monAt(b, { side: 1, slot: 0 })!;
    expect(gyarados.species).toBe('Gyarados');
    expect(gyarados.hp).toBe(gyarados.maxHP - Math.floor((gyarados.maxHP * 2) / 8));
  });

  it('Rugido obliga al rival a cambiar', () => {
    let b = createBattle([set('Garchomp', ['Roar'])], [set('Kingambit', ['Swords Dance']), set('Gyarados')], ['Tú', 'Rival'], 'singles');
    b = turn(b, mv('Roar'), foeMv('Swords Dance'));
    expect(monAt(b, { side: 1, slot: 0 })!.species).toBe('Gyarados');
  });

  it('Otra Vez obliga a repetir el último movimiento', () => {
    let b = createBattle([set('Garchomp', ['Encore', 'Protect'])], [set('Kingambit', ['Swords Dance', 'Iron Head'])], ['Tú', 'Rival'], 'singles');
    b = turn(b, mv('Protect'), foeMv('Swords Dance'));
    b = turn(b, mv('Encore'), foeMv('Iron Head'));
    const k = monAt(b, { side: 1, slot: 0 })!;
    expect(k.encore?.move).toBe('Swords Dance');
    expect(k.boosts.atk).toBe(4);
    expect(legalMoves(k)).toEqual(['Swords Dance']);
    // la IA lo sabe: Otra Vez sobre un movimiento de estado vale más que un ataque resistido
    const b2 = createBattle([set('Garchomp', ['Encore', 'Dragon Claw'])], [set('Kingambit', ['Swords Dance'])], ['Tú', 'Rival'], 'singles');
    b2.sides[1].team[0].lastMove = 'Swords Dance';
    expect(evaluateOptions(b2, monAt(b2, { side: 0, slot: 0 })!)[0].label).toContain('Otra Vez');
  });

  it('Canto Mortal debilita a ambos a los 3 turnos', () => {
    let b = createBattle([set('Garchomp', ['Perish Song', 'Swords Dance'])], [set('Kingambit', ['Swords Dance'])], ['Tú', 'Rival'], 'singles');
    b = turn(b, mv('Perish Song'), foeMv('Swords Dance'));
    for (let i = 0; i < 3 && b.phase !== 'end'; i++) b = turn(b, mv('Swords Dance'), foeMv('Swords Dance'));
    expect(b.phase).toBe('end');
    expect(b.winner).toBe('draw');
  });

  it('Ditto (Impostor) se transforma en el rival al entrar y vuelve a su forma al salir', () => {
    let b = createBattle([set('Garchomp', ['Protect'])], [set('Ditto'), set('Gyarados')], ['Tú', 'Rival'], 'singles');
    const d = monAt(b, { side: 1, slot: 0 })!;
    expect(d.species).toBe('Garchomp');
    expect(d.set.moves).toEqual(['Protect']);
    b = turn(b, mv('Protect'), { type: 'switch', to: 1 });
    expect(b.sides[1].team[0].species).toBe('Ditto');
  });

  it('Electrorrayo tarda un turno sin lluvia y sale al momento con lluvia', () => {
    const arch = set('Archaludon', ['Electro Shot', 'Protect']);
    let b = createBattle([{ ...arch, item: 'Leftovers' }], [set('Gyarados', ['Protect', 'Waterfall'])], ['Tú', 'Rival'], 'singles');
    const hp0 = monAt(b, { side: 1, slot: 0 })!.hp;
    b = turn(b, mv('Electro Shot'), foeMv('Waterfall'));
    const a = monAt(b, { side: 0, slot: 0 })!;
    expect(a.charging).toBe('Electro Shot');
    expect(a.boosts.spa).toBe(1);
    expect(legalMoves(a)).toEqual(['Electro Shot']);
    expect(monAt(b, { side: 1, slot: 0 })!.hp).toBe(hp0);
    b = turn(b, mv('Electro Shot'), foeMv('Waterfall'));
    expect(b.sides[0].team[0].charging).toBeUndefined();
    expect(b.sides[1].team[0].hp).toBeLessThan(hp0);
  });
});
