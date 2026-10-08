import { describe, expect, it } from 'vitest';
import { metaEntry } from '../src/models/data/meta';
import { doublesBrief } from '../src/models/analysis/doublesBrief';
import { createBattle } from '../src/models/engine/battle';

const set = (species: string, moves?: string[]) => {
  const s = structuredClone(metaEntry(species, 'doubles')!.set!);
  if (moves) s.moves = moves;
  return s;
};

describe('Plan detallado de dobles (2 vs 2)', () => {
  const b = createBattle(
    [set('Garchomp', ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect']), set('Incineroar')],
    [set('Raichu'), set('Gholdengo')],
  );
  const brief = doublesBrief(b, 0);

  it('da el mejor ataque de cada uno contra cada rival', () => {
    expect(brief.attacks).toHaveLength(2);
    expect(brief.attacks[0].vs.map((h) => h.target.species)).toEqual(['Raichu', 'Gholdengo']);
    // Terremoto (área) es lo mejor de Garchomp contra los dos
    expect(brief.attacks[0].vs.every((h) => h.move === 'Earthquake' && h.spread)).toBe(true);
    expect(brief.attacks[0].spread.some((h) => h.move === 'Rock Slide')).toBe(true);
  });

  it('suma el daño de los dos contra el mismo rival', () => {
    expect(brief.focus).toHaveLength(2);
    for (const f of brief.focus) {
      expect(f.parts).toHaveLength(2);
      expect(f.minPct).toBeCloseTo(f.parts[0].minPct + f.parts[1].minPct);
    }
  });

  it('avisa del daño que pueden recibir tus Pokémon', () => {
    expect(brief.danger.map((d) => d.from.length)).toEqual([2, 2]);
  });

  it('los ataques de carga sin su clima pasan al final', () => {
    const b2 = createBattle([set('Archaludon', ['Electro Shot', 'Flash Cannon']), set('Incineroar')], [set('Gyarados'), set('Rillaboom')]);
    const vsGyarados = doublesBrief(b2).attacks[0].vs[0];
    expect(vsGyarados.move).toBe('Flash Cannon');
    b2.weather = { type: 'Rain', turns: 5 };
    expect(doublesBrief(b2).attacks[0].vs[0]).toMatchObject({ move: 'Electro Shot', charge: false });
  });
});
