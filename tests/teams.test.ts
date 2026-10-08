import { describe, expect, it } from 'vitest';
import { metaEntry } from '../src/models/data/meta';
import { createBackup, parseBackup } from '../src/models/repository/backup';
import type { BoxEntry } from '../src/models/repository/store';
import {
  activeTeam, bookFromIds, membersFromSets, newTeam, nextTeamName, normalizeBook, resolveTeam, withActiveMembers,
} from '../src/models/repository/teams';

const set = (species: string, item: string) => ({ ...structuredClone(metaEntry(species, 'doubles')!.set!), item });
const box: BoxEntry[] = [{ species: 'Garchomp', set: set('Garchomp', 'Life Orb') }, { species: 'Incineroar', set: set('Incineroar', 'Sitrus Berry') }];

describe('Varios equipos', () => {
  it('migra el equipo antiguo a «Equipo 1» de cada formato', () => {
    const book = bookFromIds({ singles: ['Garchomp'], doubles: ['Garchomp', 'Incineroar'] });
    expect(activeTeam(book, 'doubles')).toMatchObject({ name: 'Equipo 1', members: [{ species: 'Garchomp' }, { species: 'Incineroar' }] });
    expect(nextTeamName(book, 'doubles')).toBe('Equipo 2');
  });

  it('el objeto puede ser distinto en cada equipo sin tocar la colección', () => {
    let book = bookFromIds({ singles: [], doubles: ['Garchomp', 'Incineroar'] });
    // en el equipo 1 Garchomp lleva Pañuelo Elección
    const edited = resolveTeam(activeTeam(book, 'doubles'), box).map((s) => (s.species === 'Garchomp' ? { ...s, item: 'Choice Scarf' } : s));
    book = withActiveMembers(book, 'doubles', membersFromSets(edited, box, 'doubles'));
    expect(activeTeam(book, 'doubles').members).toEqual([{ species: 'Garchomp', item: 'Choice Scarf' }, { species: 'Incineroar' }]);
    expect(resolveTeam(activeTeam(book, 'doubles'), box)[0].item).toBe('Choice Scarf');
    // otro equipo con el mismo Garchomp usa el objeto de la colección
    const t2 = newTeam('doubles', 'Equipo 2', [{ species: 'Garchomp' }]);
    expect(resolveTeam(t2, box)[0].item).toBe('Life Orb');
    // y '' = sin objeto solo en ese equipo
    expect(resolveTeam({ ...t2, members: [{ species: 'Garchomp', item: '' }] }, box)[0].item).toBe('');
  });

  it('repara datos incompletos: un equipo por formato y activo válido', () => {
    const book = normalizeBook({ teams: [newTeam('doubles', 'Rain')], active: { doubles: 'nope' } }, { singles: [], doubles: [] });
    expect(book.teams.filter((t) => t.format === 'singles')).toHaveLength(1);
    expect(activeTeam(book, 'doubles').name).toBe('Rain');
  });

  it('la copia de seguridad guarda todos los equipos con sus objetos', () => {
    const book = bookFromIds({ singles: [], doubles: ['Garchomp'] });
    const withItem = withActiveMembers(book, 'doubles', [{ species: 'Garchomp', item: 'Choice Scarf' }]);
    const back = parseBackup(JSON.stringify(createBackup({ format: 'doubles', box, teamIds: { singles: [], doubles: ['Garchomp'] }, inventory: [], teamBook: withItem })));
    expect(activeTeam(back.teamBook!, 'doubles').members).toEqual([{ species: 'Garchomp', item: 'Choice Scarf' }]);
  });
});
