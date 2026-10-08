/** Vista principal: cabecera, selector de formato, pestañas y la página activa. */
import { FORMAT_ES, META_INFOS, type Format } from '../models/data/meta';
import type { AppController, Tab } from '../controllers/useAppController';
import { DataLists } from './components/SetEditor';
import { MetaStatus } from './components/MetaStatus';
import { TeamSwitcher } from './components/TeamSwitcher';
import { lazy, Suspense } from 'react';

// cada pestaña se carga al abrirla (la primera carga de la app es más ligera)
const Assistant = lazy(() => import('./pages/AssistantView').then((m) => ({ default: m.Assistant })));
const Collection = lazy(() => import('./pages/CollectionView').then((m) => ({ default: m.Collection })));
const Ranking = lazy(() => import('./pages/RankingView').then((m) => ({ default: m.Ranking })));
const Recruit = lazy(() => import('./pages/RecruitView').then((m) => ({ default: m.Recruit })));
const Simulator = lazy(() => import('./pages/SimulatorView').then((m) => ({ default: m.Simulator })));
const TeamBuilder = lazy(() => import('./pages/TeamBuilderView').then((m) => ({ default: m.TeamBuilder })));
const History = lazy(() => import('./pages/HistoryView').then((m) => ({ default: m.History })));

const TABS: [Tab, string][] = [
  ['ranking', '🏆 Ranking'],
  ['recruit', '🤝 Reclutamiento'],
  ['collection', '📚 Mi colección'],
  ['team', '🧩 Mi equipo'],
  ['assistant', '🧠 Asistente'],
  ['sim', '⚔️ Simulador'],
  ['history', '📜 Historial'],
];

// pestañas que trabajan con un equipo: muestran el selector de equipos
const TEAM_TABS: Tab[] = ['collection', 'team', 'assistant', 'sim'];

export function AppView(c: AppController) {
  const { tab, setTab, format, setFormat, db, dbPath, box, setBox, teams, team, setTeam, inventory, setInventory } = c;
  // al cambiar de equipo, las pantallas con estado propio (asistente, simulador) empiezan de cero
  const teamKey = `${format}-${c.teamManager.active.id}`;
  const dbOk = db === 'db' || db === 'migrated';
  return (
    <div className="app">
      <DataLists />
      <header className="topbar">
        <div className="brand">
          <span className="logo">◓</span>
          <div>
            <h1>Champions Coach</h1>
            <span className="muted small">{META_INFOS[format].format}</span>
          </div>
        </div>
        <span
          className={`db-badge ${dbOk ? 'ok' : 'off'}`}
          title={db === 'offline' ? 'La API local no responde: los datos se guardan solo en este navegador' : db === 'error' ? 'Falló el último guardado en la base de datos' : `Base de datos: ${dbPath ?? 'data/champions.db'}`}
        >
          {dbOk ? '💾 Guardado en BD local' : db === 'error' ? '⚠ Error al guardar' : '⚠ Solo en el navegador'}
        </span>
        <MetaStatus />
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
              {id === 'history' && c.history.length > 0 && <span className="badge">{c.history.length}</span>}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {TEAM_TABS.includes(tab) && <TeamSwitcher tm={c.teamManager} format={format} />}
        <Suspense fallback={<p className="muted">Cargando…</p>}>
        {tab === 'ranking' && (
          <Ranking format={format} teamSpecies={team.map((s) => s.species)} boxSpecies={box.map((b) => b.species)} onRecruit={c.recruitFromRanking} />
        )}
        {tab === 'recruit' && (
          <Recruit format={format} team={team} setTeam={setTeam} box={box} setBox={setBox} inventory={inventory} setInventory={setInventory} onOpenCollection={() => setTab('collection')} />
        )}
        {tab === 'collection' && (
          <Collection format={format} team={team} setTeam={setTeam} box={box} setBox={setBox} inventory={inventory} onGoRecruit={() => setTab('recruit')} backup={c.backup} history={c.history} />
        )}
        {tab === 'team' && <TeamBuilder key={teamKey} format={format} team={team} setTeam={setTeam} onRecruit={c.recruit} teamName={c.teamManager.active.name} ownItems={c.teamManager.ownItems} resetItem={c.teamManager.resetItem} />}
        {tab === 'assistant' && <Assistant key={teamKey} team={teams[format]} format={format} />}
        {tab === 'sim' && <Simulator key={teamKey} team={teams[format]} format={format} onFinish={c.addBattle} />}
        {tab === 'history' && <History format={format} history={c.history} team={team} addBattle={c.addBattle} removeBattle={c.removeBattle} />}
        </Suspense>
      </main>
      <footer className="muted small">
        Daños calculados con @smogon/calc (mecánicas de Pokémon Champions). Proyecto de fans, sin afiliación con Nintendo / The Pokémon Company.
      </footer>
    </div>
  );
}
