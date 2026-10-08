/**
 * Copia de seguridad completa (colección, equipos, objetos y formato) en un archivo JSON,
 * para guardarla fuera de la base de datos o pasarla a otro PC.
 */
import type { Format } from '../data/meta';
import { getSpecies } from '../domain/dex';
import type { PokemonSet } from '../domain/sets';
import { normalizeBox, type BoxEntry, type TeamIds } from './store';

export const BACKUP_VERSION = 1;

export interface Backup {
  app: 'champions-coach';
  version: number;
  exportedAt: string;
  format: Format;
  box: BoxEntry[];
  teams: TeamIds;
  inventory: string[];
}

export function createBackup(data: { format: Format; box: BoxEntry[]; teamIds: TeamIds; inventory: string[] }): Backup {
  return {
    app: 'champions-coach', version: BACKUP_VERSION, exportedAt: new Date().toISOString(),
    format: data.format, box: data.box, teams: data.teamIds, inventory: data.inventory,
  };
}

/** Nombre de archivo sugerido: champions-coach-2026-10-08.json */
export const backupFileName = () => `champions-coach-${new Date().toISOString().slice(0, 10)}.json`;

/** Lee y valida una copia. Lanza un error en español si el archivo no es válido. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('El archivo no es un JSON válido.'); }
  const b = raw as Partial<Backup>;
  if (!b || b.app !== 'champions-coach') throw new Error('Este archivo no es una copia de Champions Coach.');
  if ((b.version ?? 0) > BACKUP_VERSION) throw new Error('La copia es de una versión más nueva de la app.');
  const box = normalizeBox(b.box ?? []).filter((e) => getSpecies(e.species));
  const known = new Set(box.map((e) => e.species));
  const teams: TeamIds = {
    singles: (b.teams?.singles ?? []).filter((s) => known.has(s)).slice(0, 6),
    doubles: (b.teams?.doubles ?? []).filter((s) => known.has(s)).slice(0, 6),
  };
  return {
    app: 'champions-coach', version: BACKUP_VERSION, exportedAt: b.exportedAt ?? '',
    format: b.format === 'singles' ? 'singles' : 'doubles', box, teams,
    inventory: Array.isArray(b.inventory) ? b.inventory.filter((x) => typeof x === 'string') : [],
  };
}

/** Combina una copia con lo que ya tienes: añade los Pokémon nuevos y los objetos; tus sets actuales se mantienen. */
export function mergeBackup(current: { box: BoxEntry[]; inventory: string[] }, incoming: Backup) {
  const have = new Set(current.box.map((b) => b.species));
  return {
    box: [...current.box, ...incoming.box.filter((b) => !have.has(b.species))],
    inventory: [...new Set([...current.inventory, ...incoming.inventory])].sort(),
  };
}

/** Pokémon importados en formato Showdown → colección (su set pasa a ser el tuyo). */
export function importSets(box: BoxEntry[], sets: PokemonSet[]): BoxEntry[] {
  let b = box;
  for (const s of sets) {
    const i = b.findIndex((x) => x.species === s.species);
    b = i < 0 ? [...b, { species: s.species, set: s }] : b.map((x, j) => (j === i ? { ...x, set: s } : x));
  }
  return b;
}
