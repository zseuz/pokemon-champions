/**
 * Controlador principal: estado global de la app (pestaña, formato, colección, equipos, inventario,
 * estado de la base de datos) y las acciones que lo modifican. Las vistas solo reciben esto.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Format, MetaEntry } from '../models/data/meta';
import { defaultSet, type PokemonSet } from '../models/domain/sets';
import { parseShowdown, teamToShowdown } from '../models/domain/showdown';
import type { BattleRecord } from '../models/analysis/history';
import { createBackup, importSets, mergeBackup, parseBackup } from '../models/repository/backup';
import {
  addSpecies, dbState, load, loadAppState, onDbStatus, save, STORAGE_KEYS, syncTeamIntoBox,
  type BoxEntry, type DbStatus, type Teams,
} from '../models/repository/store';
import {
  activeIds, activeTeam, collectionItem, membersFromSets, newTeam, nextTeamName, normalizeBook, resolveTeam, teamsOf, withActiveMembers,
  type TeamBook,
} from '../models/repository/teams';

export type Tab = 'ranking' | 'recruit' | 'collection' | 'team' | 'assistant' | 'sim' | 'history';

export function useAppController() {
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'ranking');
  const [format, setFormat] = useState<Format>(() => load<Format>(STORAGE_KEYS.format, 'doubles'));
  const [initial] = useState(() => loadAppState(load<Format>(STORAGE_KEYS.format, 'doubles')));
  const [box, setBox] = useState<BoxEntry[]>(initial.box);
  // varios equipos por formato; el activo es el que usan todas las pantallas
  const [book, setBook] = useState<TeamBook>(() => normalizeBook(load<unknown>(STORAGE_KEYS.teamBook, null), initial.teamIds));
  const [inventory, setInventory] = useState<string[]>(initial.inventory);
  const [history, setHistory] = useState<BattleRecord[]>(() => load<BattleRecord[]>(STORAGE_KEYS.history, []));
  const [db, setDb] = useState<DbStatus>(dbState.status);
  useEffect(() => onDbStatus(setDb), []);

  const teams: Teams = useMemo(() => ({ singles: resolveTeam(activeTeam(book, 'singles'), box), doubles: resolveTeam(activeTeam(book, 'doubles'), box) }), [book, box]);
  const team = teams[format];

  // persistencia (navegador + base de datos local)
  useEffect(() => save(STORAGE_KEYS.teams, teams), [teams]);
  useEffect(() => save(STORAGE_KEYS.teamBook, book), [book]);
  useEffect(() => save(STORAGE_KEYS.box, box), [box]);
  useEffect(() => save(STORAGE_KEYS.inv, inventory), [inventory]);
  useEffect(() => save(STORAGE_KEYS.format, format), [format]);
  useEffect(() => save(STORAGE_KEYS.history, history), [history]);
  useEffect(() => { location.hash = tab; }, [tab]);

  /** Cambia el equipo del formato actual; si editaste el set de algún miembro, se guarda en tu colección. */
  // El objeto es propio del equipo: si lo cambias aquí, tu colección conserva el suyo.
  const setTeam = (t: PokemonSet[]) => {
    setBook((bk) => withActiveMembers(bk, format, membersFromSets(t, box, format)));
    setBox((b) => syncTeamIntoBox(b, t.map((s) => ({ ...s, item: collectionItem(b, s.species, format) ?? s.item })), format));
  };

  // ── Varios equipos por formato ──
  const teamManager = {
    list: teamsOf(book, format),
    active: activeTeam(book, format),
    select: (id: string) => setBook((bk) => ({ ...bk, active: { ...bk.active, [format]: id } })),
    /** Crea un equipo vacío o copia del activo (mismos Pokémon y objetos). */
    create: (copy: boolean) => setBook((bk) => {
      const t = newTeam(format, nextTeamName(bk, format), copy ? structuredClone(activeTeam(bk, format).members) : []);
      return { teams: [...bk.teams, t], active: { ...bk.active, [format]: t.id } };
    }),
    rename: (id: string, name: string) => setBook((bk) => ({ ...bk, teams: bk.teams.map((t) => (t.id === id ? { ...t, name: name.trim() || t.name } : t)) })),
    /** Borra un equipo (siempre queda al menos uno por formato). */
    remove: (id: string) => setBook((bk) => {
      const rest = bk.teams.filter((t) => t.id !== id);
      if (!rest.some((t) => t.format === format)) return bk;
      const active = bk.active[format] === id ? rest.find((t) => t.format === format)!.id : bk.active[format];
      return { teams: rest, active: { ...bk.active, [format]: active } };
    }),
    /** Vuelve a usar el objeto de tu colección para un miembro del equipo activo. */
    resetItem: (species: string) => setBook((bk) => withActiveMembers(bk, format, activeTeam(bk, format).members.map((m) => (m.species === species ? { species } : m)))),
    /** Especies cuyo objeto es propio de este equipo. */
    ownItems: activeTeam(book, format).members.filter((m) => m.item !== undefined).map((m) => m.species),
  };

  /** Recluta un Pokémon con su set (si lo has editado, pasa a ser tu set). */
  const recruit = (set: PokemonSet) => setBox((b) => syncTeamIntoBox(b, [set], format));

  /** Recluta desde el ranking: lo añade a la colección y, si hay hueco, al equipo. */
  const recruitFromRanking = (e: MetaEntry) => {
    const set = structuredClone(e.set ?? defaultSet(e.species));
    setBox((b) => addSpecies(b, e.species));
    if (team.length < 6) setTeam([...team, set]);
    else alert(`${e.species} reclutado. Tu equipo ya tiene 6: lo tienes en Mi colección.`);
  };

  // ── Copia de seguridad y formato Showdown ──
  const backup = {
    /** Copia completa lista para descargar. */
    exportAll: () => createBackup({ format, box, teamIds: activeIds(book), inventory, teamBook: book }),
    /** Restaura una copia: 'replace' sustituye todo; 'merge' añade lo que no tengas. */
    importAll: (text: string, mode: 'replace' | 'merge'): string => {
      const b = parseBackup(text);
      if (mode === 'replace') {
        setBox(b.box); setBook(normalizeBook(b.teamBook ?? null, b.teams)); setInventory(b.inventory); setFormat(b.format);
        return `Copia restaurada: ${b.box.length} Pokémon, ${b.inventory.length} objetos.`;
      }
      const merged = mergeBackup({ box, inventory }, b);
      const added = merged.box.length - box.length;
      setBox(merged.box); setInventory(merged.inventory);
      return `Combinado: ${added} Pokémon nuevos añadidos (tus sets actuales se mantienen).`;
    },
    /** Tu equipo del formato actual en texto Showdown. */
    exportTeamText: () => teamToShowdown(team),
    /** Pega uno o varios sets Showdown: van a tu colección y, si quieres, al equipo. */
    importText: (text: string, toTeam: boolean): { message: string; warnings: string[] } => {
      const { sets, warnings } = parseShowdown(text);
      if (!sets.length) return { message: 'No se encontró ningún Pokémon en el texto.', warnings };
      setBox((b) => importSets(b, sets));
      if (toTeam) {
        const names = sets.map((s) => s.species);
        setBook((bk) => {
          const cur = activeTeam(bk, format).members.filter((m) => !names.includes(m.species));
          return withActiveMembers(bk, format, [...cur, ...names.map((species) => ({ species }))].slice(0, 6));
        });
      }
      return { message: `${sets.length} Pokémon importados${toTeam ? ' y añadidos al equipo' : ''}.`, warnings };
    },
  };

  // ── Historial de combates ──
  const addBattle = (b: BattleRecord) => setHistory((h) => [...h, b]);
  const removeBattle = (id: string) => setHistory((h) => h.filter((b) => b.id !== id));

  return {
    history, addBattle, removeBattle,
    backup,
    tab, setTab, format, setFormat, db, dbPath: dbState.path,
    box, setBox, teams, team, setTeam, teamManager, inventory, setInventory,
    recruit, recruitFromRanking,
  };
}

export type AppController = ReturnType<typeof useAppController>;
