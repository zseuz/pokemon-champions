/**
 * Base de datos local SQLite (archivo data/champions.db) con el SQLite que trae Node 22.
 * Guarda la colección, los equipos, el inventario de objetos, la selección de candidatos y los ajustes.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DB_PATH = resolve(process.cwd(), 'data', 'champions.db');

type Json = unknown;
interface PokemonSetLike { species: string; [k: string]: unknown }
/** Pokémon de la colección: `set` es el set del jugador (igual en ambos formatos). */
interface BoxEntryLike { species: string; set?: PokemonSetLike; sets?: Record<string, PokemonSetLike> }

let db: DatabaseSync | null = null;

function open(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS collection (
      species    TEXT PRIMARY KEY,
      position   INTEGER NOT NULL,
      sets_json  TEXT NOT NULL,          -- tu set (JSON) o null si usa el del meta; versiones antiguas: {"singles": {...}}
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS team_members (
      format     TEXT NOT NULL,          -- 'singles' | 'doubles'
      position   INTEGER NOT NULL,
      species    TEXT NOT NULL,
      set_json   TEXT NOT NULL,
      PRIMARY KEY (format, position)
    );
    CREATE TABLE IF NOT EXISTS inventory (
      item TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS candidates (
      position INTEGER PRIMARY KEY,
      species  TEXT NOT NULL,
      set_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

function tx(fn: (d: DatabaseSync) => void) {
  const d = open();
  d.exec('BEGIN');
  try { fn(d); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; }
}

/** Claves que usa la app (las mismas que en el navegador) y cómo se guardan en tablas. */
export const KEYS = {
  box: 'pkmn-champions-box',
  teams: 'pkmn-champions-teams',
  items: 'pkmn-champions-items',
  candidates: 'pkmn-champions-candidates',
  format: 'pkmn-champions-format',
} as const;

export function readAll(): Record<string, Json> {
  const d = open();
  const out: Record<string, Json> = {};
  const box = d.prepare('SELECT species, sets_json FROM collection ORDER BY position').all() as { species: string; sets_json: string }[];
  if (box.length) out[KEYS.box] = box.map((r) => {
    const v = JSON.parse(r.sets_json) as PokemonSetLike | Record<string, PokemonSetLike> | null;
    // formato actual: el set directamente; formato antiguo: { singles, doubles }
    const set = v && 'species' in v ? v : v ? ((v as Record<string, PokemonSetLike>).singles ?? (v as Record<string, PokemonSetLike>).doubles) : undefined;
    return set ? { species: r.species, set } : { species: r.species };
  });
  const team = d.prepare('SELECT format, set_json FROM team_members ORDER BY format, position').all() as { format: string; set_json: string }[];
  const hasTeams = (d.prepare("SELECT value FROM settings WHERE key = 'teams_saved'").get() as { value: string } | undefined);
  if (team.length || hasTeams) {
    const teams: Record<string, Json[]> = { singles: [], doubles: [] };
    for (const r of team) (teams[r.format] ??= []).push(JSON.parse(r.set_json));
    out[KEYS.teams] = teams;
  }
  const items = d.prepare('SELECT item FROM inventory ORDER BY item').all() as { item: string }[];
  if (items.length) out[KEYS.items] = items.map((r) => r.item);
  const cands = d.prepare('SELECT set_json FROM candidates ORDER BY position').all() as { set_json: string }[];
  if (cands.length) out[KEYS.candidates] = cands.map((r) => JSON.parse(r.set_json));
  const fmt = d.prepare("SELECT value FROM settings WHERE key = 'format'").get() as { value: string } | undefined;
  if (fmt) out[KEYS.format] = JSON.parse(fmt.value);
  return out;
}

export function isEmpty(): boolean {
  const d = open();
  const n = (sql: string) => (d.prepare(sql).get() as { n: number }).n;
  return n('SELECT COUNT(*) AS n FROM collection') + n('SELECT COUNT(*) AS n FROM team_members') +
    n('SELECT COUNT(*) AS n FROM inventory') + n('SELECT COUNT(*) AS n FROM settings') === 0;
}

/** Reemplaza lo guardado para una clave (en una transacción). */
export function write(key: string, value: Json) {
  tx((d) => {
    switch (key) {
      case KEYS.box: {
        d.exec('DELETE FROM collection');
        const ins = d.prepare('INSERT INTO collection (species, position, sets_json, updated_at) VALUES (?, ?, ?, datetime(\'now\'))');
        (value as BoxEntryLike[]).forEach((b, i) => ins.run(b.species, i, JSON.stringify(b.set ?? b.sets?.singles ?? b.sets?.doubles ?? null)));
        break;
      }
      case KEYS.teams: {
        d.exec('DELETE FROM team_members');
        const ins = d.prepare('INSERT INTO team_members (format, position, species, set_json) VALUES (?, ?, ?, ?)');
        for (const [format, members] of Object.entries(value as Record<string, PokemonSetLike[]>)) {
          members.forEach((s, i) => ins.run(format, i, s.species, JSON.stringify(s)));
        }
        d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('teams_saved', '1')").run();
        break;
      }
      case KEYS.items: {
        d.exec('DELETE FROM inventory');
        const ins = d.prepare('INSERT OR IGNORE INTO inventory (item) VALUES (?)');
        for (const it of value as string[]) ins.run(it);
        break;
      }
      case KEYS.candidates: {
        d.exec('DELETE FROM candidates');
        const ins = d.prepare('INSERT INTO candidates (position, species, set_json) VALUES (?, ?, ?)');
        (value as PokemonSetLike[]).forEach((s, i) => ins.run(i, s.species, JSON.stringify(s)));
        break;
      }
      case KEYS.format:
        d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('format', ?)").run(JSON.stringify(value));
        break;
      default:
        throw new Error(`Clave desconocida: ${key}`);
    }
  });
}

export function stats() {
  const d = open();
  const n = (sql: string) => (d.prepare(sql).get() as { n: number }).n;
  return {
    path: DB_PATH,
    collection: n('SELECT COUNT(*) AS n FROM collection'),
    teamMembers: n('SELECT COUNT(*) AS n FROM team_members'),
    items: n('SELECT COUNT(*) AS n FROM inventory'),
    candidates: n('SELECT COUNT(*) AS n FROM candidates'),
  };
}
