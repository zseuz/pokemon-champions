/**
 * Tests del motor de combate y de la IA. Se fija el azar para que los resultados sean repetibles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { metaEntry } from '../src/models/data/meta';
import { evaluateOptions, rankSwitchIns } from '../src/models/engine/ai';
import { createBattle, monAt, resolveTurn, type BattleState } from '../src/models/engine/battle';
import { battleMonFor, neutralState } from '../src/models/analysis/teamAnalysis';

const set = (species: string) => structuredClone(metaEntry(species, 'doubles')!.set!);

// azar fijo: sin críticos, sin fallos, tirada media
beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => { vi.restoreAllMocks(); });

describe('Motor de combate', () => {
  it('Intimidación baja el Ataque de los rivales al empezar', () => {
    const b = createBattle([set('Incineroar'), set('Rillaboom')], [set('Garchomp'), set('Kingambit')]);
    const garchomp = monAt(b, { side: 1, slot: 0 })!;
    expect(garchomp.boosts.atk).toBe(-1);
  });

  it('Protección bloquea un ataque', () => {
    let b = createBattle([set('Sneasler'), set('Incineroar')], [set('Kingambit'), set('Farigiraf')]);
    const before = monAt(b, { side: 1, slot: 0 })!.hp;
    b = resolveTurn(b, [
      [{ type: 'move', move: 'Close Combat', target: { side: 1, slot: 0 } }, { type: 'move', move: 'Protect' }],
      [{ type: 'move', move: 'Protect' }, { type: 'move', move: 'Protect' }],
    ]);
    expect(monAt(b, { side: 1, slot: 0 })!.hp).toBe(before);
    expect(b.log.some((l) => l.text.includes('se protegió'))).toBe(true);
  });

  it('Fake Out falla después del primer turno', () => {
    let b = createBattle([set('Rillaboom'), set('Incineroar')], [set('Garchomp'), set('Salamence')]);
    const t = { side: 1 as const, slot: 0 };
    b = resolveTurn(b, [[{ type: 'move', move: 'Protect' }, { type: 'move', move: 'Protect' }], [{ type: 'move', move: 'Protect' }, { type: 'move', move: 'Protect' }]]);
    b = resolveTurn(b, [[{ type: 'move', move: 'Fake Out', target: t }, { type: 'move', move: 'Protect' }], [{ type: 'move', move: 'Protect' }, { type: 'move', move: 'Protect' }]]);
    expect(b.log.some((l) => l.text.includes('solo funciona el primer turno'))).toBe(true);
  });

  it('el combate termina cuando un equipo se queda sin Pokémon', () => {
    let b: BattleState = createBattle([set('Garchomp')], [set('Raichu')]);
    for (let i = 0; i < 10 && b.phase !== 'end'; i++) {
      b = resolveTurn(b, [[{ type: 'move', move: 'Earthquake' }, null], [{ type: 'move', move: 'Thunderbolt', target: { side: 0, slot: 0 } }, null]]);
    }
    expect(b.phase).toBe('end');
    expect(b.winner).toBe(0);
  });
});

describe('IA / asistente', () => {
  it('recomienda el ataque súper eficaz más fuerte', () => {
    const garchomp = { ...set('Garchomp'), moves: ['Earth Power', 'Dragon Claw', 'Rock Slide', 'Protect'] };
    const b = createBattle([garchomp], [set('Raichu')]);
    const best = evaluateOptions(b, monAt(b, { side: 0, slot: 0 })!)[0];
    expect(best.action.type).toBe('move');
    expect(best.action.type === 'move' && best.action.move).toBe('Earth Power');
  });

  it('no propone sacar a un Pokémon debilitado', () => {
    const st = neutralState();
    st.format = 'singles';
    const a = battleMonFor(set('Garchomp'), 0);
    const ko = battleMonFor(set('Kingambit'), 0);
    ko.hp = 0;
    ko.fainted = true;
    const ok = battleMonFor(set('Rillaboom'), 0);
    st.sides[0].team = [a, ko, ok];
    st.sides[0].active = [0];
    st.sides[1].team = [battleMonFor(set('Salamence'), 1)];
    st.sides[1].active = [0];
    const switches = evaluateOptions(st, a).filter((o) => o.action.type === 'switch');
    expect(switches.map((o) => o.label)).not.toContain('Cambiar a Kingambit');
    expect(rankSwitchIns(st, 0).map((o) => o.label)).toEqual(['Sacar a Rillaboom']);
  });
});
