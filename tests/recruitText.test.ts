import { describe, expect, it } from 'vitest';
import { editDistance, parseRecruitText, scanLine } from '../src/models/domain/recruitText';

describe('Lectura de capturas (OCR)', () => {
  it('distancia de edición', () => {
    expect(editDistance('garchomp', 'garchomp')).toBe(0);
    expect(editDistance('garchonp', 'garchomp')).toBe(1);
    expect(editDistance('abc', 'xyzxyzxyz', 2)).toBe(3);
  });

  it('reconoce nombres en español con errores de lectura', () => {
    expect(scanLine('Terremot0')).toEqual([{ kind: 'move', value: 'Earthquake', text: 'terremot0' }]);
    expect(scanLine('Garchonp')[0]).toMatchObject({ kind: 'species', value: 'Garchomp' });
    expect(scanLine('Naturaleza: Alegre')[0]).toMatchObject({ kind: 'nature', value: 'Jolly' });
  });

  it('agrupa varios candidatos con habilidad, movimientos, naturaleza y Stat Points', () => {
    const text = `Selección de reclutamiento
Beedrill
Enjambre
Golpe Venenoso   Ida y Vuelta
Taladradora      Protección
Alegre
Ataque 32
Velocidad 32
PS 2

Garchomp
Piel Tosca
Terremoto
Garra Dragón
Roca Afilada
Danza Espada
Firme`;
    const { sets, warnings } = parseRecruitText(text);
    expect(sets.map((s) => s.species)).toEqual(['Beedrill', 'Garchomp']);
    expect(sets[0]).toMatchObject({ ability: 'Swarm', nature: 'Jolly', moves: ['Poison Jab', 'U-turn', 'Drill Run', 'Protect'] });
    expect(sets[0].sp).toMatchObject({ atk: 32, spe: 32, hp: 2 });
    expect(sets[1]).toMatchObject({ ability: 'Rough Skin', nature: 'Adamant', moves: ['Earthquake', 'Dragon Claw', 'Stone Edge', 'Swords Dance'] });
    expect(warnings).toEqual([]);
  });

  it('avisa si no encuentra ningún Pokémon', () => {
    expect(parseRecruitText('hola mundo').warnings[0]).toContain('No se reconoció');
  });
});
