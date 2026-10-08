import { describe, expect, it } from 'vitest';
import { metaEntry } from '../src/models/data/meta';
import { createBattle } from '../src/models/engine/battle';
import { bestPlan, lookaheadPlans, positionValue } from '../src/models/engine/lookahead';

const set = (species: string, moves?: string[]) => {
  const s = structuredClone(metaEntry(species, 'doubles')!.set!);
  if (moves) s.moves = moves;
  return s;
};

describe('IA que mira un turno adelante', () => {
  it('la ventaja es simétrica y 0 al empezar con equipos iguales', () => {
    const b = createBattle([set('Garchomp')], [set('Garchomp')], ['Tú', 'Rival'], 'singles');
    expect(positionValue(b, 0)).toBe(0);
    b.sides[1].team[0].hp = 1;
    expect(positionValue(b, 0)).toBeGreaterThan(0);
    expect(positionValue(b, 1)).toBe(-positionValue(b, 0));
  });

  it('elige el ataque súper eficaz y espera ganar ventaja', () => {
    const b = createBattle([set('Garchomp', ['Earthquake', 'Swords Dance', 'Protect'])], [set('Raichu')], ['Tú', 'Rival'], 'singles');
    const plan = bestPlan(b, 0)!;
    expect(plan.actions[0]).toMatchObject({ type: 'move', move: 'Earthquake' });
    expect(plan.value).toBeGreaterThan(plan.now);
  });

  it('en dobles combina las jugadas de los dos Pokémon', () => {
    const b = createBattle([set('Incineroar'), set('Rillaboom')], [set('Garchomp'), set('Kingambit')]);
    const plans = lookaheadPlans(b, 0);
    expect(plans.length).toBeGreaterThan(1);
    expect(plans[0].actions).toHaveLength(2);
    for (const p of plans) expect(p.actions.filter((a) => a?.type === 'move' && a.mega).length).toBeLessThanOrEqual(1);
  });
});
