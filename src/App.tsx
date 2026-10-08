import { useEffect, useMemo, useState } from 'react';
import { Assistant } from './components/Assistant';
import { Collection } from './components/Collection';
import { Ranking } from './components/Ranking';
import { Recruit } from './components/Recruit';
import { DataLists } from './components/SetEditor';
import { Simulator } from './components/Simulator';
import { TeamBuilder } from './components/TeamBuilder';
import { FORMAT_ES, META_INFOS, type Format } from './data/meta';
import { defaultSet, type PokemonSet } from './lib/sets';
import {
  addSpecies, dbState, load, normalizeBox, onDbStatus, save, setFor, syncTeamIntoBox,
  type BoxEntry, type DbStatus, type TeamIds, type Teams,
} from './lib/store';

type Tab = 'ranking' | 'recruit' | 'collection' | 'team' | 'assistant' | 'sim';
const TABS: [Tab, string][] = [
  ['ranking', '🏆 Ranking'],
  ['recruit', '🤝 Reclutamiento'],
  ['collection', '📚 Mi colección'],
  ['team', '🧩 Mi equipo'],
  ['assistant', '🧠 Asistente'],
  ['sim', '⚔️ Simulador'],
];
const DOUBLES_ONLY: Tab[] = ['sim'];

const KEYS = { teams: 'pkmn-champions-teams', oldTeam: 'pkmn-champions-team', box: 'pkmn-champions-box', inv: 'pkmn-champions-items', format: 'pkmn-champions-format' };

function loadTeams(): Teams {
  const teams = load<Teams | null>(KEYS.teams, null);
  if (teams) return teams;
  // migración desde la versión anterior (un solo equipo, de dobles)
  return { doubles: load<PokemonSet[]>(KEYS.oldTeam, []), singles: [] };
}

/**
 * Carga la colección y los equipos. Cada Pokémon tiene UN set (el tuyo) para los dos formatos;
 * los datos antiguos con un set por formato se convierten aquí, y los sets de los equipos
 * (que podías haber editado en "Mi equipo") pasan a la colección.
 */
function loadState(format: Format): { box: BoxEntry[]; teamIds: TeamIds } {
  const teams = loadTeams();
  let box = normalizeBox(load<unknown>(KEYS.box, []), format);
  const other: Format = format === 'singles' ? 'doubles' : 'singles';
  for (const f of [other, format]) box = syncTeamIntoBox(box, teams[f] ?? [], f);
  return { box, teamIds: { singles: (teams.singles ?? []).map((s) => s.species), doubles: (teams.doubles ?? []).map((s) => s.species) } };
}

export default function App() {
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'ranking');
  const [format, setFormat] = useState<Format>(() => load<Format>(KEYS.format, 'doubles'));
  const [initial] = useState(() => loadState(load<Format>(KEYS.format, 'doubles')));
  const [box, setBox] = useState<BoxEntry[]>(initial.box);
  const [teamIds, setTeamIds] = useState<TeamIds>(initial.teamIds);
  const [inventory, setInventory] = useState<string[]>(() => load<string[]>(KEYS.inv, []));
  const [db, setDb] = useState<DbStatus>(dbState.status);
  useEffect(() => onDbStatus(setDb), []);

  // Equipos con el set de cada miembro sacado de la colección (siempre sincronizados)
  const teams = useMemo<Teams>(() => {
    const resolve = (f: Format) => teamIds[f]
      .map((sp) => box.find((b) => b.species === sp))
      .filter((b): b is BoxEntry => !!b)
      .map((b) => setFor(b, f));
    return { singles: resolve('singles'), doubles: resolve('doubles') };
  }, [teamIds, box]);

  useEffect(() => save(KEYS.teams, teams), [teams]);
  useEffect(() => save(KEYS.box, box), [box]);
  useEffect(() => save(KEYS.inv, inventory), [inventory]);
  useEffect(() => save(KEYS.format, format), [format]);
  useEffect(() => { location.hash = tab; }, [tab]);

  const team = teams[format];
  /** Cambia el equipo del formato actual; si editaste el set de algún miembro, se guarda en tu colección. */
  const setTeam = (t: PokemonSet[]) => {
    setBox((b) => syncTeamIntoBox(b, t, format));
    setTeamIds((prev) => ({ ...prev, [format]: t.map((s) => s.species) }));
  };
  const recruit = (set: PokemonSet) => setBox((b) => syncTeamIntoBox(b, [set], format));

  return (
    <div className="app">
      <DataLists />
      <header className="topbar">
        <div className="brand">
          <span className="logo">◓</span>
          <div>
            <h1>Champions Coach</h1>
            <span className="muted small">{META_INFOS[DOUBLES_ONLY.includes(tab) ? 'doubles' : format].format}</span>
          </div>
        </div>
        <span
          className={`db-badge ${db === 'db' || db === 'migrated' ? 'ok' : 'off'}`}
          title={db === 'offline' ? 'La API local no responde: los datos se guardan solo en este navegador' : db === 'error' ? 'Falló el último guardado en la base de datos' : `Base de datos: ${dbState.path ?? 'data/champions.db'}`}
        >
          {db === 'db' || db === 'migrated' ? '💾 Guardado en BD local' : db === 'error' ? '⚠ Error al guardar' : '⚠ Solo en el navegador'}
        </span>
        <div className="seg format-switch" title="Formato del ranking, del reclutamiento y del equipo">
          {(['singles', 'doubles'] as Format[]).map((f) => (
            <button key={f} className={format === f ? 'active' : ''} onClick={() => setFormat(f)}>
              {f === 'singles' ? '👤' : '👥'} {FORMAT_ES[f]}
            </button>
          ))}
        </div>
        <nav className="tabs">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {label}
              {id === 'team' && team.length > 0 && <span className="badge">{team.length}</span>}
              {id === 'collection' && box.length > 0 && <span className="badge">{box.length}</span>}
              {DOUBLES_ONLY.includes(id) && format === 'singles' && <span className="badge alt">Dobles</span>}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'ranking' && (
          <Ranking
            format={format}
            teamSpecies={team.map((s) => s.species)}
            boxSpecies={box.map((b) => b.species)}
            onRecruit={(e) => {
              const set = structuredClone(e.set ?? defaultSet(e.species));
              setBox((b) => addSpecies(b, e.species));
              if (team.length < 6) setTeam([...team, set]);
              else alert(`${e.species} reclutado. Tu equipo ya tiene 6: lo tienes en Mi colección.`);
            }}
          />
        )}
        {tab === 'recruit' && (
          <Recruit format={format} team={team} setTeam={setTeam} box={box} setBox={setBox} inventory={inventory} setInventory={setInventory} onOpenCollection={() => setTab('collection')} />
        )}
        {tab === 'collection' && (
          <Collection format={format} team={team} setTeam={setTeam} box={box} setBox={setBox} inventory={inventory} onGoRecruit={() => setTab('recruit')} />
        )}
        {tab === 'team' && <TeamBuilder key={format} format={format} team={team} setTeam={setTeam} onRecruit={recruit} />}
        {DOUBLES_ONLY.includes(tab) && format === 'singles' && (
          <p className="notice">El simulador funciona en <b>Dobles</b> (VGC): usa tu equipo de dobles.</p>
        )}
        {tab === 'assistant' && <Assistant key={format} team={teams[format]} format={format} />}
        {tab === 'sim' && <Simulator team={teams.doubles} />}
      </main>
      <footer className="muted small">
        Daños calculados con @smogon/calc (mecánicas de Pokémon Champions). Proyecto de fans, sin afiliación con Nintendo / The Pokémon Company.
      </footer>
    </div>
  );
}
