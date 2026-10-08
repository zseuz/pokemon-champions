import { useHistoryController, type SourceFilter } from '../../controllers/useHistoryController';
import { FORMAT_ES, type Format } from '../../models/data/meta';
import { speciesEs } from '../../models/domain/es';
import type { PokemonSet } from '../../models/domain/sets';
import type { BattleRecord, SpeciesStat } from '../../models/analysis/history';
import { Sprite } from '../components/common';
import { SpeciesSelect } from '../components/SpeciesSelect';

const RESULT = { win: { icon: '🏆', label: 'Victoria', cls: 'win' }, loss: { icon: '💀', label: 'Derrota', cls: 'loss' }, draw: { icon: '🤝', label: 'Empate', cls: 'draw' } };

/** Historial de combates: apuntar combates reales, ver estadísticas y contra quién pierdes. */
export function History({ format, history, team, addBattle, removeBattle }: {
  format: Format; history: BattleRecord[]; team: PokemonSet[];
  addBattle: (b: BattleRecord) => void; removeBattle: (id: string) => void;
}) {
  const { mine, toggleMine, rival, setRivalAt, removeRival, notes, setNotes, canSave, save, saved, source, setSource, filtered, stats } =
    useHistoryController(format, history, team, addBattle);

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Historial de combates · {FORMAT_ES[format]}</h2>
          <p className="muted">Apunta tus combates reales (los del simulador se guardan solos). Con ellos, las observaciones de <b>Mi colección</b> priorizan a los rivales que de verdad te ganan.</p>
        </div>
      </div>

      {/* Apuntar un combate */}
      <section className="panel">
        <h3>➕ Apuntar un combate</h3>
        <div className="hist-form">
          <div>
            <div className="muted small">Tu equipo (pulsa para quitar o poner)</div>
            <div className="hist-chips">
              {team.map((t) => (
                <button key={t.species} className={`hist-chip${mine.includes(t.species) ? ' on' : ''}`} onClick={() => toggleMine(t.species)}>
                  <Sprite species={t.species} size={32} /> {speciesEs(t.species)}
                </button>
              ))}
              {!team.length && <span className="muted small">Arma tu equipo de {FORMAT_ES[format]} primero.</span>}
            </div>
          </div>
          <div>
            <div className="muted small">Equipo del rival</div>
            <div className="hist-rivals">
              {rival.map((sp, i) => (
                <div key={i} className="row">
                  <SpeciesSelect value={sp} format={format} placeholder={i === 0 ? 'Primer Pokémon del rival…' : 'Otro Pokémon…'} exclude={rival.filter((x, j) => x && j !== i)} onChange={(v) => setRivalAt(i, v)} />
                  {sp && <button className="small-btn" onClick={() => removeRival(i)} title="Quitar">✕</button>}
                </div>
              ))}
            </div>
          </div>
          <input placeholder="Notas (opcional): qué pasó, qué falló…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="row wrap">
            <span className="muted small">Resultado:</span>
            <button className="res-btn win" disabled={!canSave} onClick={() => save('win')}>🏆 Victoria</button>
            <button className="res-btn loss" disabled={!canSave} onClick={() => save('loss')}>💀 Derrota</button>
            <button className="res-btn draw" disabled={!canSave} onClick={() => save('draw')}>🤝 Empate</button>
            {saved && <span className="good-msg small">{saved}</span>}
          </div>
        </div>
      </section>

      {/* Estadísticas */}
      <section className="panel">
        <div className="section-head">
          <h3>📊 Tus estadísticas</h3>
          <div className="seg small">
            {(['all', 'real', 'sim'] as SourceFilter[]).map((s) => (
              <button key={s} className={source === s ? 'active' : ''} onClick={() => setSource(s)}>{s === 'all' ? 'Todos' : s === 'real' ? 'Reales' : 'Simulador'}</button>
            ))}
          </div>
        </div>
        {stats.games === 0 ? (
          <p className="muted">Aún no hay combates de {FORMAT_ES[format]}{source !== 'all' ? ' con este filtro' : ''}.</p>
        ) : (
          <>
            <div className="coll-stats hist-stats">
              <div className="stat-tile"><b>{stats.games}</b><span>combates</span></div>
              <div className="stat-tile"><b className={stats.winRate >= 50 ? 'up' : 'down'}>{stats.winRate}%</b><span>de victorias ({stats.wins} V · {stats.losses} D)</span></div>
              <div className="stat-tile"><b>{stats.streak > 0 ? `🔥 ${stats.streak}` : stats.streak < 0 ? `❄ ${-stats.streak}` : '—'}</b><span>{stats.streak > 0 ? 'victorias seguidas' : stats.streak < 0 ? 'derrotas seguidas' : 'racha'}</span></div>
              <div className="stat-tile"><span>Últimos combates</span>
                <div className="recent">{stats.recent.map((r, i) => <span key={i} className={`dot-res ${RESULT[r].cls}`} title={RESULT[r].label} />)}</div>
              </div>
            </div>
            <div className="hist-grid">
              <StatList title="💀 Rivales que más te ganan" empty="Ninguno con 2 o más combates" list={stats.nemesis} bad />
              <StatList title="🏆 Rivales a los que más ganas" empty="Ninguno con 2 o más combates" list={stats.favorites} />
              <StatList title="⭐ Tus Pokémon" empty="—" list={stats.mine.slice(0, 8)} />
            </div>
          </>
        )}
      </section>

      {/* Lista */}
      <section className="panel">
        <h3>🗂 Combates ({filtered.length})</h3>
        <div className="hist-list">
          {filtered.map((b) => (
            <div key={b.id} className={`hist-row ${RESULT[b.result].cls}`}>
              <span className="hist-res">{RESULT[b.result].icon}</span>
              <div className="hist-teams">
                <span className="hist-side">{b.mine.map((s) => <Sprite key={s} species={s} size={30} />)}</span>
                <span className="muted small">vs</span>
                <span className="hist-side">{b.rival.map((s) => <Sprite key={s} species={s} size={30} />)}</span>
              </div>
              <div className="hist-meta small">
                <span>{new Date(b.date).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="muted">{b.source === 'sim' ? 'simulador' : 'real'}</span>
                {b.notes && <span className="muted">· {b.notes}</span>}
              </div>
              <button className="small-btn danger" onClick={() => confirm('¿Borrar este combate?') && removeBattle(b.id)}>✕</button>
            </div>
          ))}
          {!filtered.length && <p className="muted small">Sin combates todavía.</p>}
        </div>
      </section>
    </div>
  );
}

function StatList({ title, list, empty, bad }: { title: string; list: SpeciesStat[]; empty: string; bad?: boolean }) {
  return (
    <div className="stat-list">
      <h4>{title}</h4>
      {list.length === 0 && <p className="muted small">{empty}</p>}
      {list.map((s) => (
        <div key={s.species} className="stat-row">
          <Sprite species={s.species} size={30} />
          <span className="stat-name">{speciesEs(s.species)}</span>
          <div className="usage-bar"><div style={{ width: `${s.winRate}%`, background: bad ? 'var(--bad)' : 'var(--good)' }} /></div>
          <span className="small">{s.wins}V {s.losses}D · {s.winRate}%</span>
        </div>
      ))}
    </div>
  );
}
