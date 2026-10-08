/** Vista principal: cabecera, selector de formato, pestañas y la página activa. */
import { FORMAT_ES, META_INFOS, type Format } from '../models/data/meta';
import type { AppController, Tab } from '../controllers/useAppController';
import { DataLists } from './components/SetEditor';
import { Assistant } from './pages/AssistantView';
import { Collection } from './pages/CollectionView';
import { Ranking } from './pages/RankingView';
import { Recruit } from './pages/RecruitView';
import { Simulator } from './pages/SimulatorView';
import { TeamBuilder } from './pages/TeamBuilderView';

const TABS: [Tab, string][] = [
  ['ranking', '🏆 Ranking'],
  ['recruit', '🤝 Reclutamiento'],
  ['collection', '📚 Mi colección'],
  ['team', '🧩 Mi equipo'],
  ['assistant', '🧠 Asistente'],
  ['sim', '⚔️ Simulador'],
];
const DOUBLES_ONLY: Tab[] = ['sim'];

export function AppView(c: AppController) {
  const { tab, setTab, format, setFormat, db, dbPath, box, setBox, teams, team, setTeam, inventory, setInventory } = c;
  const dbOk = db === 'db' || db === 'migrated';
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
          className={`db-badge ${dbOk ? 'ok' : 'off'}`}
          title={db === 'offline' ? 'La API local no responde: los datos se guardan solo en este navegador' : db === 'error' ? 'Falló el último guardado en la base de datos' : `Base de datos: ${dbPath ?? 'data/champions.db'}`}
        >
          {dbOk ? '💾 Guardado en BD local' : db === 'error' ? '⚠ Error al guardar' : '⚠ Solo en el navegador'}
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
          <Ranking format={format} teamSpecies={team.map((s) => s.species)} boxSpecies={box.map((b) => b.species)} onRecruit={c.recruitFromRanking} />
        )}
        {tab === 'recruit' && (
          <Recruit format={format} team={team} setTeam={setTeam} box={box} setBox={setBox} inventory={inventory} setInventory={setInventory} onOpenCollection={() => setTab('collection')} />
        )}
        {tab === 'collection' && (
          <Collection format={format} team={team} setTeam={setTeam} box={box} setBox={setBox} inventory={inventory} onGoRecruit={() => setTab('recruit')} />
        )}
        {tab === 'team' && <TeamBuilder key={format} format={format} team={team} setTeam={setTeam} onRecruit={c.recruit} />}
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
