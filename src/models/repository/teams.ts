/**
 * Varios equipos guardados por formato, como en el juego ("Equipo 1", "Equipo 2"…).
 * Cada miembro usa el set de tu colección, pero el OBJETO puede ser propio de cada equipo:
 * el mismo Garchomp puede llevar Vidasfera en un equipo y Pañuelo Elección en otro.
 */
import type { Format } from '../data/meta';
import type { PokemonSet } from '../domain/sets';
import { setFor, type BoxEntry, type TeamIds } from './store';

export interface TeamMember {
  species: string;
  /** objeto solo para este equipo; sin definir = el de tu colección ('' = sin objeto en este equipo) */
  item?: string;
}

export interface SavedTeam {
  id: string;
  name: string;
  format: Format;
  members: TeamMember[];
}

export interface TeamBook {
  teams: SavedTeam[];
  /** equipo activo de cada formato */
  active: Record<Format, string>;
}

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newTeam(format: Format, name: string, members: TeamMember[] = []): SavedTeam {
  return { id: newId(), name, format, members };
}

/** Siguiente nombre libre: "Equipo 1", "Equipo 2"… */
export function nextTeamName(book: TeamBook, format: Format): string {
  const names = new Set(book.teams.filter((t) => t.format === format).map((t) => t.name));
  let i = 1;
  while (names.has(`Equipo ${i}`)) i++;
  return `Equipo ${i}`;
}

/** Migración: un equipo por formato a partir de la versión con un solo equipo. */
export function bookFromIds(ids: TeamIds): TeamBook {
  const singles = newTeam('singles', 'Equipo 1', ids.singles.map((species) => ({ species })));
  const doubles = newTeam('doubles', 'Equipo 1', ids.doubles.map((species) => ({ species })));
  return { teams: [singles, doubles], active: { singles: singles.id, doubles: doubles.id } };
}

/** Garantiza que hay al menos un equipo por formato y que el activo existe. */
export function normalizeBook(raw: unknown, fallback: TeamIds): TeamBook {
  const b = raw as Partial<TeamBook> | null;
  if (!b || !Array.isArray(b.teams)) return bookFromIds(fallback);
  const teams = b.teams
    .filter((t) => t && (t.format === 'singles' || t.format === 'doubles') && Array.isArray(t.members))
    .map((t) => ({ ...t, name: String(t.name || 'Equipo'), members: t.members.filter((m) => m && typeof m.species === 'string').slice(0, 6) }));
  const active = { ...(b.active ?? {}) } as Record<Format, string>;
  for (const f of ['singles', 'doubles'] as Format[]) {
    if (!teams.some((t) => t.format === f)) teams.push(newTeam(f, 'Equipo 1'));
    if (!teams.some((t) => t.id === active[f] && t.format === f)) active[f] = teams.find((t) => t.format === f)!.id;
  }
  return { teams, active };
}

export const teamsOf = (book: TeamBook, format: Format) => book.teams.filter((t) => t.format === format);
export const activeTeam = (book: TeamBook, format: Format) => book.teams.find((t) => t.id === book.active[format])!;

/** Sets de un equipo: el de tu colección con el objeto propio del equipo si lo tiene. */
export function resolveTeam(team: SavedTeam, box: BoxEntry[]): PokemonSet[] {
  return team.members
    .map((m) => ({ m, entry: box.find((b) => b.species === m.species) }))
    .filter((x): x is { m: TeamMember; entry: BoxEntry } => !!x.entry)
    .map(({ m, entry }) => {
      const s = setFor(entry, team.format);
      return m.item === undefined ? s : { ...s, item: m.item };
    });
}

/** Objeto que el Pokémon lleva en tu colección (o en el set del meta si no lo has configurado). */
export function collectionItem(box: BoxEntry[], species: string, format: Format): string | undefined {
  const entry = box.find((b) => b.species === species);
  return entry ? setFor(entry, format).item : undefined;
}

/**
 * Miembros a partir de los sets editados en un equipo: el objeto solo se guarda como propio
 * del equipo si es distinto del que lleva en tu colección.
 */
export function membersFromSets(sets: PokemonSet[], box: BoxEntry[], format: Format): TeamMember[] {
  return sets.map((s) => {
    const base = collectionItem(box, s.species, format);
    return base === undefined || base === s.item ? { species: s.species } : { species: s.species, item: s.item };
  });
}

/** Sustituye los miembros del equipo activo del formato. */
export function withActiveMembers(book: TeamBook, format: Format, members: TeamMember[]): TeamBook {
  return { ...book, teams: book.teams.map((t) => (t.id === book.active[format] ? { ...t, members } : t)) };
}

/** Especies de los equipos activos (para la copia de seguridad antigua). */
export const activeIds = (book: TeamBook): TeamIds => ({
  singles: activeTeam(book, 'singles').members.map((m) => m.species),
  doubles: activeTeam(book, 'doubles').members.map((m) => m.species),
});
