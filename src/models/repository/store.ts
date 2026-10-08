import { metaEntry, type Format } from '../data/meta';
import { defaultSet, type PokemonSet } from '../domain/sets';

/**
 * Un Pokémon de tu colección. `set` es TU ejemplar (habilidad, objeto, naturaleza, Stat Points y movimientos)
 * y es el mismo en individuales y en dobles. Si no lo has configurado, se usa el set del meta del formato.
 */
export interface BoxEntry {
  species: string;
  set?: PokemonSet;
}

export type Teams = Record<Format, PokemonSet[]>;
/** Equipos guardados como lista de especies: el set de cada uno sale siempre de la colección. */
export type TeamIds = Record<Format, string[]>;

/** Set a usar para un Pokémon de la colección: el tuyo; si no, el del meta del formato; si no, uno por defecto. */
export function setFor(entry: BoxEntry, format: Format): PokemonSet {
  return structuredClone(entry.set ?? metaEntry(entry.species, format)?.set ?? defaultSet(entry.species));
}

export const isCustom = (entry?: BoxEntry) => !!entry?.set;

/** Añade una especie a la colección (sin set propio: usará el del meta hasta que lo configures). */
export function addSpecies(box: BoxEntry[], species: string): BoxEntry[] {
  return box.some((b) => b.species === species) ? box : [...box, { species }];
}

/** Añade un Pokémon con su set; si ya estaba y no tenía set propio, se lo pone. No pisa un set ya configurado. */
export function addToBox(box: BoxEntry[], set: PokemonSet): BoxEntry[] {
  const i = box.findIndex((b) => b.species === set.species);
  if (i < 0) return [...box, { species: set.species, set: structuredClone(set) }];
  if (box[i].set) return box;
  const copy = [...box];
  copy[i] = { ...copy[i], set: structuredClone(set) };
  return copy;
}

/** Guarda (o reemplaza) tu set de un Pokémon: se usa igual en individuales y en dobles. */
export function upsertSet(box: BoxEntry[], set: PokemonSet): BoxEntry[] {
  const i = box.findIndex((b) => b.species === set.species);
  if (i < 0) return [...box, { species: set.species, set: structuredClone(set) }];
  const copy = [...box];
  copy[i] = { ...copy[i], set: structuredClone(set) };
  return copy;
}

/**
 * Convierte datos de versiones anteriores, en las que cada Pokémon tenía un set por formato
 * ({ sets: { singles, doubles } }), al set único actual.
 */
export function normalizeBox(raw: unknown, prefer: Format = 'singles'): BoxEntry[] {
  if (!Array.isArray(raw)) return [];
  const other: Format = prefer === 'singles' ? 'doubles' : 'singles';
  return raw.filter((r) => r && typeof r === 'object' && 'species' in r).map((r) => {
    const e = r as { species: string; set?: PokemonSet; sets?: Partial<Record<Format, PokemonSet>> };
    const set = e.set ?? e.sets?.[prefer] ?? e.sets?.[other];
    return set ? { species: e.species, set } : { species: e.species };
  });
}

const same = (a?: PokemonSet, b?: PokemonSet) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Aplica a la colección los sets de un equipo: si un miembro trae un set distinto del que la colección
 * mostraría (lo has editado), pasa a ser tu set para ambos formatos.
 */
export function syncTeamIntoBox(box: BoxEntry[], team: PokemonSet[], format: Format): BoxEntry[] {
  let b = box;
  for (const s of team) {
    const entry = b.find((x) => x.species === s.species);
    if (!entry) b = same(s, setFor({ species: s.species }, format)) ? addSpecies(b, s.species) : upsertSet(b, s);
    else if (!same(s, setFor(entry, format))) b = upsertSet(b, s);
  }
  return b;
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Guarda en el navegador (copia inmediata) y en la base de datos local (con un pequeño retardo). */
export function save(key: string, value: unknown) {
  const json = JSON.stringify(value);
  try { localStorage.setItem(key, json); } catch { /* sin almacenamiento */ }
  if (dbState.status === 'offline') return;
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    fetch(`/api/state/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); setStatus('db'); })
      .catch(() => setStatus('error'));
  }, 400));
}

// ───────────────────────── Base de datos local (SQLite vía /api) ─────────────────────────

/** Claves que se sincronizan con la base de datos. */
export const DB_KEYS = ['pkmn-champions-box', 'pkmn-champions-teams', 'pkmn-champions-items', 'pkmn-champions-candidates', 'pkmn-champions-format', 'pkmn-champions-history'];

export type DbStatus = 'db' | 'migrated' | 'offline' | 'error';
export const dbState: { status: DbStatus; path?: string } = { status: 'offline' };
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<(s: DbStatus) => void>();
function setStatus(s: DbStatus) {
  if (dbState.status === s) return;
  dbState.status = s;
  listeners.forEach((l) => l(s));
}
export function onDbStatus(fn: (s: DbStatus) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Al arrancar: si la base de datos tiene datos, los copia al navegador para que la app los use;
 * si está vacía, sube lo que hubiera en el navegador (migración automática).
 * Si la API no responde, la app sigue funcionando solo con el navegador.
 */
export async function hydrateFromDb(): Promise<DbStatus> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch('/api/state', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { empty, data } = (await res.json()) as { empty: boolean; data: Record<string, unknown> };
    const health = await fetch('/api/health').then((r) => r.json()).catch(() => null) as { path?: string } | null;
    dbState.path = health?.path;
    if (empty) {
      dbState.status = 'migrated';
      for (const key of DB_KEYS) {
        const raw = localStorage.getItem(key);
        if (raw) await fetch(`/api/state/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: raw });
      }
      return 'migrated';
    }
    // la base de datos manda: lo que no tenga filas está vacío
    const emptyValue: Record<string, unknown> = { 'pkmn-champions-box': [], 'pkmn-champions-items': [], 'pkmn-champions-candidates': [], 'pkmn-champions-history': [] };
    for (const key of DB_KEYS) {
      if (key in data) localStorage.setItem(key, JSON.stringify(data[key]));
      else if (key in emptyValue) localStorage.setItem(key, JSON.stringify(emptyValue[key]));
    }
    dbState.status = 'db';
    return 'db';
  } catch {
    dbState.status = 'offline';
    return 'offline';
  }
}

// ───────────────────────── Carga del estado de la app ─────────────────────────

/** Claves de almacenamiento (navegador y base de datos). */
export const STORAGE_KEYS = {
  teams: 'pkmn-champions-teams', oldTeam: 'pkmn-champions-team', box: 'pkmn-champions-box',
  inv: 'pkmn-champions-items', format: 'pkmn-champions-format', history: 'pkmn-champions-history',
} as const;

function loadTeams(): Teams {
  const teams = load<Teams | null>(STORAGE_KEYS.teams, null);
  if (teams) return teams;
  // migración desde la versión anterior (un solo equipo, de dobles)
  return { doubles: load<PokemonSet[]>(STORAGE_KEYS.oldTeam, []), singles: [] };
}

/**
 * Carga la colección y los equipos. Cada Pokémon tiene UN set (el tuyo) para los dos formatos;
 * los datos antiguos con un set por formato se convierten aquí, y los sets de los equipos
 * (que podías haber editado en "Mi equipo") pasan a la colección.
 */
export function loadAppState(format: Format): { box: BoxEntry[]; teamIds: TeamIds; inventory: string[] } {
  const teams = loadTeams();
  let box = normalizeBox(load<unknown>(STORAGE_KEYS.box, []), format);
  const other: Format = format === 'singles' ? 'doubles' : 'singles';
  for (const f of [other, format]) box = syncTeamIntoBox(box, teams[f] ?? [], f);
  return {
    box,
    teamIds: { singles: (teams.singles ?? []).map((s) => s.species), doubles: (teams.doubles ?? []).map((s) => s.species) },
    inventory: load<string[]>(STORAGE_KEYS.inv, []),
  };
}

/** Equipos con el set de cada miembro sacado de la colección (siempre sincronizados). */
export function resolveTeams(teamIds: TeamIds, box: BoxEntry[]): Teams {
  const resolve = (f: Format) => teamIds[f]
    .map((sp) => box.find((b) => b.species === sp))
    .filter((b): b is BoxEntry => !!b)
    .map((b) => setFor(b, f));
  return { singles: resolve('singles'), doubles: resolve('doubles') };
}
