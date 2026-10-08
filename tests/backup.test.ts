/** Tests de exportar / importar: formato Showdown y copia de seguridad. */
import { describe, expect, it } from 'vitest';
import { metaEntry } from '../src/models/data/meta';
import { parseShowdown, setToShowdown, teamToShowdown } from '../src/models/domain/showdown';
import { createBackup, importSets, mergeBackup, parseBackup } from '../src/models/repository/backup';

const set = (s: string) => structuredClone(metaEntry(s, 'doubles')!.set!);

describe('Formato Showdown', () => {
  it('exportar e importar devuelve el mismo set', () => {
    const team = [set('Garchomp'), set('Incineroar'), set('Rotom-Wash') ?? set('Rillaboom')].filter(Boolean);
    const { sets, warnings } = parseShowdown(teamToShowdown(team));
    expect(warnings).toEqual([]);
    expect(sets).toEqual(team);
  });

  it('entiende apodos, género, nombres en español y EVs clásicos', () => {
    const text = `Tiburón (Garchomp) (F) @ Restos
Habilidad: Piel Tosca
Level: 50
EVs: 252 Atk / 4 SpD / 252 Spe
Alegre Nature
- Terremoto
- Garra Dragón
- Protección`;
    const { sets, warnings } = parseShowdown(text);
    expect(sets[0]).toMatchObject({ species: 'Garchomp', item: 'Leftovers', ability: 'Rough Skin', nature: 'Jolly', moves: ['Earthquake', 'Dragon Claw', 'Protect'] });
    expect(sets[0].sp).toMatchObject({ atk: 32, spe: 32, spd: 1 });
    expect(warnings.join()).toMatch(/convertidos/);
  });

  it('avisa de lo que no reconoce', () => {
    const { sets, warnings } = parseShowdown('Pikachu @ Objeto Raro\n- Ataque Inventado');
    expect(sets).toHaveLength(1);
    expect(warnings).toHaveLength(2);
  });

  it('incluye nivel 50 y los Stat Points', () => {
    expect(setToShowdown(set('Rillaboom'))).toMatch(/Level: 50\nEVs: /);
  });
});

describe('Copia de seguridad', () => {
  const data = { format: 'singles' as const, box: [{ species: 'Garchomp', set: set('Garchomp') }, { species: 'Rillaboom' }], teamIds: { singles: ['Garchomp'], doubles: [] }, inventory: ['Leftovers'] };

  it('crea y vuelve a leer la copia sin perder nada', () => {
    const b = parseBackup(JSON.stringify(createBackup(data)));
    expect(b.box).toEqual(data.box);
    expect(b.teams).toEqual(data.teamIds);
    expect(b.inventory).toEqual(['Leftovers']);
    expect(b.format).toBe('singles');
  });

  it('rechaza archivos que no son copias', () => {
    expect(() => parseBackup('{"hola":1}')).toThrow(/no es una copia/);
    expect(() => parseBackup('no json')).toThrow(/JSON/);
  });

  it('combinar mantiene tus sets y añade lo nuevo', () => {
    const incoming = parseBackup(JSON.stringify(createBackup({ ...data, box: [{ species: 'Garchomp' }, { species: 'Kingambit' }], inventory: ['Life Orb'] })));
    const merged = mergeBackup({ box: data.box, inventory: data.inventory }, incoming);
    expect(merged.box.map((b) => b.species)).toEqual(['Garchomp', 'Rillaboom', 'Kingambit']);
    expect(merged.box[0].set).toEqual(data.box[0].set);
    expect(merged.inventory).toEqual(['Leftovers', 'Life Orb']);
  });

  it('importar sets Showdown actualiza la colección', () => {
    const edited = { ...set('Garchomp'), item: 'Choice Scarf' };
    expect(importSets(data.box, [edited])[0].set?.item).toBe('Choice Scarf');
  });
});
