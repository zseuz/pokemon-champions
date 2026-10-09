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
interface BoxEntryLike { species: string; set?: PokemonSetLike; sets?: Record<string, PokemonSetLike>; trialUntil?: string }

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
    CREATE TABLE IF NOT EXISTS battles (
      id         TEXT PRIMARY KEY,
      played_at  TEXT NOT NULL,
      format     TEXT NOT NULL,          -- 'singles' | 'doubles'
      result     TEXT NOT NULL,          -- 'win' | 'loss' | 'draw'
      source     TEXT NOT NULL,          -- 'real' (apuntado a mano) | 'sim' (simulador)
      mine_json  TEXT NOT NULL,          -- especies de tu equipo
      rival_json TEXT NOT NULL,          -- especies del rival
      notes      TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS saved_teams (
      id           TEXT PRIMARY KEY,
      format       TEXT NOT NULL,          -- 'singles' | 'doubles'
      position     INTEGER NOT NULL,
      name         TEXT NOT NULL,
      members_json TEXT NOT NULL,          -- [{ species, item? }]: item = objeto propio de este equipo
      active       INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // bases de datos anteriores: añadir la columna del reclutamiento de prueba
  const cols = db.prepare('PRAGMA table_info(collection)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'trial_until')) db.exec('ALTER TABLE collection ADD COLUMN trial_until TEXT');
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
  history: 'pkmn-champions-history',
  teamBook: 'pkmn-champions-teambook',
} as const;

export function readAll(): Record<string, Json> {
  const d = open();
  const out: Record<string, Json> = {};
  const box = d.prepare('SELECT species, sets_json, trial_until FROM collection ORDER BY position').all() as { species: string; sets_json: string; trial_until: string | null }[];
  if (box.length) out[KEYS.box] = box.map((r) => {
    const v = JSON.parse(r.sets_json) as PokemonSetLike | Record<string, PokemonSetLike> | null;
    // formato actual: el set directamente; formato antiguo: { singles, doubles }
    const set = v && 'species' in v ? v : v ? ((v as Record<string, PokemonSetLike>).singles ?? (v as Record<string, PokemonSetLike>).doubles) : undefined;
    const entry = set ? { species: r.species, set } : { species: r.species };
    return r.trial_until ? { ...entry, trialUntil: r.trial_until } : entry;
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
  const battles = d.prepare('SELECT * FROM battles ORDER BY played_at').all() as { id: string; played_at: string; format: string; result: string; source: string; mine_json: string; rival_json: string; notes: string }[];
  if (battles.length) out[KEYS.history] = battles.map((b) => ({ id: b.id, date: b.played_at, format: b.format, result: b.result, source: b.source, mine: JSON.parse(b.mine_json), rival: JSON.parse(b.rival_json), notes: b.notes }));
  const saved = d.prepare('SELECT * FROM saved_teams ORDER BY format, position').all() as { id: string; format: string; name: string; members_json: string; active: number }[];
  if (saved.length) {
    out[KEYS.teamBook] = {
      teams: saved.map((t) => ({ id: t.id, name: t.name, format: t.format, members: JSON.parse(t.members_json) })),
      active: Object.fromEntries(saved.filter((t) => t.active).map((t) => [t.format, t.id])),
    };
  }
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
        const ins = d.prepare('INSERT INTO collection (species, position, sets_json, trial_until, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'))');
        (value as BoxEntryLike[]).forEach((b, i) => ins.run(b.species, i, JSON.stringify(b.set ?? b.sets?.singles ?? b.sets?.doubles ?? null), b.trialUntil ?? null));
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
      case KEYS.history: {
        d.exec('DELETE FROM battles');
        const ins = d.prepare('INSERT INTO battles (id, played_at, format, result, source, mine_json, rival_json, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const b of value as { id: string; date: string; format: string; result: string; source: string; mine: string[]; rival: string[]; notes?: string }[]) {
          ins.run(b.id, b.date, b.format, b.result, b.source, JSON.stringify(b.mine), JSON.stringify(b.rival), b.notes ?? '');
        }
        break;
      }
      case KEYS.teamBook: {
        const book = value as { teams: { id: string; format: string; name: string; members: Json[] }[]; active: Record<string, string> };
        d.exec('DELETE FROM saved_teams');
        const ins = d.prepare('INSERT INTO saved_teams (id, format, position, name, members_json, active) VALUES (?, ?, ?, ?, ?, ?)');
        book.teams.forEach((t, i) => ins.run(t.id, t.format, i, t.name, JSON.stringify(t.members), book.active[t.format] === t.id ? 1 : 0));
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
    battles: n('SELECT COUNT(*) AS n FROM battles'),
    savedTeams: n('SELECT COUNT(*) AS n FROM saved_teams'),
  };
}
