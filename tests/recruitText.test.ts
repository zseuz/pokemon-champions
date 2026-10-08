import { describe, expect, it } from 'vitest';
import { wordsToSegments } from '../src/models/domain/ocrLayout';
import { editDistance, parseRecruitText, parseStatRow, scanLine } from '../src/models/domain/recruitText';

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
    // solo avisa de lo que de verdad falta: el segundo candidato no trae Stat Points
    expect(warnings).toEqual(['Garchomp: no se leyeron los Stat Points']);
  });

  it('avisa si no encuentra ningún Pokémon', () => {
    expect(parseRecruitText('hola mundo').warnings[0]).toContain('No se reconoció');
  });
});

describe('Nombres de movimientos de 9.ª generación', () => {
  it('todos los movimientos de Champions tienen nombre en español', async () => {
    const { MOVES_ES, CHAMPIONS_MOVES } = await import('../src/models/domain/es');
    const learn = (await import('../src/models/data/learnsets.json')).default as { moves: string[] };
    expect(learn.moves.filter((m) => !MOVES_ES[m] && !CHAMPIONS_MOVES[m])).toEqual([]);
    expect(scanLine('Fiebre Dorada')[0]).toMatchObject({ kind: 'move', value: 'Make It Rain' });
  });
});

/** Texto leído de una captura real del juego en inglés (pantalla de estadísticas de Blastoise), dos pasadas. */
const GRAY = `15/30
7,153 VP Se
Moves ew
Blastoise
surf
16
WATER
Aqua Jet 20
Hp 154 0 u,
ME Attack $92 [NS
Fu
Defense 4 167 wm 32
Wave Crash 12
Ta
Sp. Atk 137 32
0
PR Muddy Water 12
Speed 100 2 AN
he
Ability
Stat Alignment Bold
Rain Dish
19`;
const WHITE = `me
15 30
7153 vr O
Blastoise o
WATER
Aqua Jet 2
HP 154 0
ME Attack
0
Le] Defense 167 32
Wave Crash 12
Sp. Atk 137 3?
Sp. Del 125 0
JE Muddy Water 12
Speed 100
Abit;
Stat Alignment
RanDish`;

describe('Captura real del juego (inglés)', () => {
  it('lee las filas de estadística aunque haya basura o el número esté en la línea siguiente', () => {
    expect(parseStatRow('Hp 154 0 u,')).toEqual({ stat: 'hp', sp: 0 });
    expect(parseStatRow('Defense 4 167 wm 32')).toEqual({ stat: 'def', sp: 32 });
    expect(parseStatRow('Speed 100 2 AN')).toEqual({ stat: 'spe', sp: 2 });
    expect(parseStatRow('Sp. Del 125 0')).toEqual({ stat: 'spd', sp: 0 });
    expect(parseStatRow('Sp. Atk 137 3?')).toEqual({ stat: 'spa', sp: null });
    expect(parseStatRow('ME Attack $92 [NS')).toEqual({ stat: 'atk', sp: null });
    expect(parseStatRow('Ataque 32')).toEqual({ stat: 'atk', sp: 32 });
    expect(parseStatRow('Speed 100')).toEqual({ stat: 'spe', sp: null });
    expect(parseStatRow('Rain Dish')).toBeNull();
  });

  it('no confunde «Ability» con el movimiento Agility ni lee la etiqueta de naturaleza', () => {
    expect(scanLine('Ability')).toEqual([]);
    expect(scanLine('Stat Alignment Bold')).toEqual([{ kind: 'nature', value: 'Bold', text: 'Stat Alignment Bold' }]);
  });

  it('une las dos pasadas en un solo candidato completo', () => {
    const { sets, warnings } = parseRecruitText([GRAY, WHITE]);
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      species: 'Blastoise', ability: 'Rain Dish', nature: 'Bold',
      moves: ['Surf', 'Aqua Jet', 'Wave Crash', 'Muddy Water'],
      sp: { hp: 0, atk: 0, def: 32, spa: 32, spd: 0, spe: 2 },
    });
    expect(warnings).toEqual([]);
  });

  it('separa las columnas del juego por el hueco entre palabras', () => {
    const w = (text: string, x0: number, x1: number, confidence = 90) => ({ text, x0, x1, confidence });
    const line = [w('Defense', 500, 640), w('167', 800, 860), w('=', 900, 910, 20), w('32', 1040, 1070), w('«', 1224, 1230, 10), w('Wave', 2084, 2160), w('Crash', 2170, 2250), w('12', 2700, 2740)];
    expect(wordsToSegments([line], 3200)).toEqual(['Defense 167 32', 'Wave Crash', '12']);
  });
});
