/**
 * Controlador principal: estado global de la app (pestaña, formato, colección, equipos, inventario,
 * estado de la base de datos) y las acciones que lo modifican. Las vistas solo reciben esto.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Format, MetaEntry } from '../models/data/meta';
import { defaultSet, type PokemonSet } from '../models/domain/sets';
import {
  addSpecies, dbState, load, loadAppState, onDbStatus, resolveTeams, save, STORAGE_KEYS, syncTeamIntoBox,
  type BoxEntry, type DbStatus, type TeamIds,
} from '../models/repository/store';

export type Tab = 'ranking' | 'recruit' | 'collection' | 'team' | 'assistant' | 'sim';

export function useAppController() {
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'ranking');
  const [format, setFormat] = useState<Format>(() => load<Format>(STORAGE_KEYS.format, 'doubles'));
  const [initial] = useState(() => loadAppState(load<Format>(STORAGE_KEYS.format, 'doubles')));
  const [box, setBox] = useState<BoxEntry[]>(initial.box);
  const [teamIds, setTeamIds] = useState<TeamIds>(initial.teamIds);
  const [inventory, setInventory] = useState<string[]>(initial.inventory);
  const [db, setDb] = useState<DbStatus>(dbState.status);
  useEffect(() => onDbStatus(setDb), []);

  const teams = useMemo(() => resolveTeams(teamIds, box), [teamIds, box]);
  const team = teams[format];

  // persistencia (navegador + base de datos local)
  useEffect(() => save(STORAGE_KEYS.teams, teams), [teams]);
  useEffect(() => save(STORAGE_KEYS.box, box), [box]);
  useEffect(() => save(STORAGE_KEYS.inv, inventory), [inventory]);
  useEffect(() => save(STORAGE_KEYS.format, format), [format]);
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

  return {
    tab, setTab, format, setFormat, db, dbPath: dbState.path,
    box, setBox, teams, team, setTeam, inventory, setInventory,
    recruit, recruitFromRanking,
  };
}

export type AppController = ReturnType<typeof useAppController>;
