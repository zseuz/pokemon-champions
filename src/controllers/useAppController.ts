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
  addSpecies, dbState, load, loadAppState, onDbStatus, resolveTeams, save, STORAGE_KEYS, syncTeamIntoBox,
  type BoxEntry, type DbStatus, type TeamIds,
} from '../models/repository/store';

export type Tab = 'ranking' | 'recruit' | 'collection' | 'team' | 'assistant' | 'sim' | 'history';

export function useAppController() {
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'ranking');
  const [format, setFormat] = useState<Format>(() => load<Format>(STORAGE_KEYS.format, 'doubles'));
  const [initial] = useState(() => loadAppState(load<Format>(STORAGE_KEYS.format, 'doubles')));
  const [box, setBox] = useState<BoxEntry[]>(initial.box);
  const [teamIds, setTeamIds] = useState<TeamIds>(initial.teamIds);
  const [inventory, setInventory] = useState<string[]>(initial.inventory);
  const [history, setHistory] = useState<BattleRecord[]>(() => load<BattleRecord[]>(STORAGE_KEYS.history, []));
  const [db, setDb] = useState<DbStatus>(dbState.status);
  useEffect(() => onDbStatus(setDb), []);

  const teams = useMemo(() => resolveTeams(teamIds, box), [teamIds, box]);
  const team = teams[format];

  // persistencia (navegador + base de datos local)
  useEffect(() => save(STORAGE_KEYS.teams, teams), [teams]);
  useEffect(() => save(STORAGE_KEYS.box, box), [box]);
  useEffect(() => save(STORAGE_KEYS.inv, inventory), [inventory]);
  useEffect(() => save(STORAGE_KEYS.format, format), [format]);
  useEffect(() => save(STORAGE_KEYS.history, history), [history]);
  useEffect(() => { location.hash = tab; }, [tab]);

  /** Cambia el equipo del formato actual; si editaste el set de algún miembro, se guarda en tu colección. */
  const setTeam = (t: PokemonSet[]) => {
    setBox((b) => syncTeamIntoBox(b, t, format));
    setTeamIds((prev) => ({ ...prev, [format]: t.map((s) => s.species) }));
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
    exportAll: () => createBackup({ format, box, teamIds, inventory }),
    /** Restaura una copia: 'replace' sustituye todo; 'merge' añade lo que no tengas. */
    importAll: (text: string, mode: 'replace' | 'merge'): string => {
      const b = parseBackup(text);
      if (mode === 'replace') {
        setBox(b.box); setTeamIds(b.teams); setInventory(b.inventory); setFormat(b.format);
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
        setTeamIds((prev) => ({ ...prev, [format]: [...new Set([...prev[format].filter((x) => !names.includes(x)), ...names])].slice(0, 6) }));
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
    box, setBox, teams, team, setTeam, inventory, setInventory,
    recruit, recruitFromRanking,
  };
}

export type AppController = ReturnType<typeof useAppController>;
