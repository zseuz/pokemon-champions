import { useTeamBuilderController } from '../../controllers/useTeamBuilderController';
import { FORMAT_ES, type Format } from '../../models/data/meta';
import { getMove, getSpecies, STAT_ES } from '../../models/domain/dex';
import { effectiveSpecies, finalStats, type PokemonSet } from '../../models/domain/sets';
import { Sprite, TypeBadge, Types, ItemIcon } from '../components/common';
import { tierColor } from '../theme';
import { SetEditor } from '../components/SetEditor';
import { abilityName } from '../../models/domain/abilities';
import { itemName } from '../format';

const multLabel = (x: number) => (x === 0 ? '0' : x === 0.25 ? '¼' : x === 0.5 ? '½' : x === 1 ? '' : x === 2 ? '2' : x === 4 ? '4' : String(x));

export function TeamBuilder({ team, setTeam, format, onRecruit, teamName, ownItems = [], resetItem }: {
  team: PokemonSet[]; setTeam: (t: PokemonSet[]) => void; format: Format; onRecruit: (s: PokemonSet) => void;
  teamName?: string; ownItems?: string[]; resetItem?: (species: string) => void;
}) {
  const { editing, setEditing, adding, setAdding, chart, coverage, roles, warns, threatRows, recs, add } = useTeamBuilderController({ team, setTeam, format, onRecruit });
  return (
    <div>
      <div className="section-head">
        <div>
          <h2>{teamName ?? 'Mi equipo'} · {FORMAT_ES[format]} <span className="muted">({team.length}/6)</span></h2>
          <p className="muted">Recluta desde el Ranking o busca cualquier Pokémon de Champions. Se guarda automáticamente. Los <b>objetos</b> que cambies aquí son solo de este equipo; el resto del set se guarda en tu colección.</p>
        </div>
        <div className="filters">
          <input
            list="dl-species" placeholder="Añadir Pokémon…" value={adding} disabled={team.length >= 6}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add(adding)}
          />
          <button className="primary" disabled={!getSpecies(adding) || team.length >= 6} onClick={() => add(adding)}>Añadir</button>
          {team.length > 0 && <button onClick={() => confirm('¿Vaciar el equipo?') && setTeam([])}>Vaciar</button>}
        </div>
      </div>

      <div className="team-grid">
        {team.map((s, i) => {
          const mega = effectiveSpecies(s, true);
          const st = finalStats(s, mega !== s.species);
          return (
            <div key={i} className="team-card">
              <div className="team-card-head">
                <Sprite species={mega} size={64} />
                <div>
                  <b>{s.species}</b>{mega !== s.species && <span className="mega-tag">Mega</span>}
                  <div><Types species={mega} /></div>
                  <div className="muted small">{abilityName(s.ability)}</div>
                  <div className="small team-item">
                    {s.item ? <><ItemIcon item={s.item} /> {itemName(s.item)}</> : <span className="muted">Sin objeto</span>}
                    {ownItems.includes(s.species) && (
                      <span className="own-item" title="Objeto solo de este equipo (en tu colección lleva otro)">
                        solo en este equipo{resetItem && <button className="link" onClick={() => resetItem(s.species)} title="Usar el objeto de tu colección">↺</button>}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ul className="moves">
                {s.moves.map((m) => <li key={m}><TypeBadge type={getMove(m)?.type ?? 'Normal'} small /> {m}</li>)}
              </ul>
              <div className="stat-line small muted">
                {(['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const).map((k) => `${STAT_ES[k]} ${st[k]}`).join(' · ')}
              </div>
              <div className="card-actions">
                <button onClick={() => setEditing(i)}>Editar</button>
                {i > 0 && <button onClick={() => { const t = [...team]; [t[i - 1], t[i]] = [t[i], t[i - 1]]; setTeam(t); }}>↑</button>}
                <button className="danger" onClick={() => setTeam(team.filter((_, j) => j !== i))}>Quitar</button>
              </div>
            </div>
          );
        })}
        {Array.from({ length: 6 - team.length }).map((_, i) => <div key={`e${i}`} className="team-card empty">Hueco libre</div>)}
      </div>

      {warns.length > 0 && <div className="errors">{warns.map((w) => <div key={w}>⚠ {w}</div>)}</div>}

      {team.length < 6 && (
        <section className="panel">
          <h3>🎯 Recomendaciones para reclutar</h3>
          <p className="muted small">Basadas en el meta actual: cubren tus debilidades, aportan roles que faltan y frenan las mayores amenazas.</p>
          <div className="rec-grid">
            {recs.map((r) => (
              <div key={r.entry.species} className="rec-card">
                <div className="rec-head">
                  <Sprite species={r.entry.set ? effectiveSpecies(r.entry.set, true) : r.entry.species} size={48} />
                  <div>
                    <b>{r.entry.species}</b> <span className="tier-chip" style={{ background: tierColor[r.entry.tier] }}>{r.entry.tier}</span>
                    <div><Types species={r.entry.species} /></div>
                  </div>
                  <button className="primary" onClick={() => add(r.entry.species)}>Reclutar</button>
                </div>
                <ul className="reasons">{r.reasons.slice(1).map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {team.length > 0 && (
        <>
          <section className="panel">
            <h3>Roles del equipo</h3>
            <div className="roles">
              {roles.map((r) => (
                <div key={r.id} className={`role ${r.members.length ? 'ok' : 'missing'}`}>
                  <b>{r.name}</b>
                  <span>{r.members.length ? r.members.join(', ') : 'Falta'}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h3>Tabla defensiva</h3>
            <div className="table-scroll">
              <table className="type-table">
                <thead>
                  <tr>
                    <th>Ataque</th>
                    {team.map((s, i) => <th key={i}><Sprite species={effectiveSpecies(s, true)} size={32} /></th>)}
                    <th>Débiles</th><th>Resisten</th>
                  </tr>
                </thead>
                <tbody>
                  {chart.map((row) => (
                    <tr key={row.type} className={row.weak >= 3 || (row.weak >= 2 && row.resist === 0) ? 'row-bad' : ''}>
                      <td><TypeBadge type={row.type} small /></td>
                      {row.mults.map((m, i) => <td key={i} className={`mult m${String(m).replace('.', '')}`}>{multLabel(m)}</td>)}
                      <td className={row.weak >= 3 ? 'bad' : ''}>{row.weak}</td>
                      <td>{row.resist}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h3>Cobertura ofensiva</h3>
            <div className="coverage">
              {coverage.map((c) => (
                <div key={c.type} className={`cov ${c.best >= 2 ? 'good' : c.best >= 1 ? 'neutral' : 'bad'}`} title={c.by}>
                  <TypeBadge type={c.type} small />
                  <span>{c.best >= 2 ? '✔ súper eficaz' : c.best >= 1 ? 'neutro' : c.best === 0 ? '✖ sin daño' : '✖ poco eficaz'}</span>
                </div>
              ))}
            </div>
            <p className="muted small">Pasa el ratón para ver qué ataque lo cubre.</p>
          </section>

          <section className="panel">
            <h3>Mayores amenazas del meta</h3>
            <div className="table-scroll">
              <table className="threat-table">
                <thead>
                  <tr>
                    <th>Amenaza</th>
                    {team.map((s, i) => <th key={i}>{s.species}</th>)}
                    <th>Tu mejor respuesta</th>
                  </tr>
                </thead>
                <tbody>
                  {threatRows.map((t) => (
                    <tr key={t.entry.species}>
                      <td className="threat-name">
                        <Sprite species={effectiveSpecies(t.entry.set!, true)} size={32} /> {t.entry.species}
                      </td>
                      {t.toUs.map((x, i) => (
                        <td key={i} className={x.pct >= 100 ? 'bad' : x.pct >= 60 ? 'warn' : 'okc'} title={x.move}>
                          {Math.round(x.pct)}%
                        </td>
                      ))}
                      <td className={t.fromUs.pct >= 100 ? 'okc' : ''}>
                        {t.fromUs.species}: {t.fromUs.move} ({Math.round(t.fromUs.pct)}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small">Daño máximo que te hace cada amenaza con su set del meta (sin Intimidación ni clima). Rojo = KO directo.</p>
          </section>
          <p className="muted small">Los multiplicadores consideran la forma Mega y habilidades como Levitación o Absorbe Agua.</p>
        </>
      )}

      {editing != null && team[editing] && (
        <SetEditor
          set={team[editing]} format={format} team={team}
          onCancel={() => setEditing(null)}
          onSave={(s) => { const t = [...team]; t[editing] = s; setTeam(t); setEditing(null); }}
          itemNote={`El objeto se guarda solo para «${teamName ?? 'este equipo'}». Habilidad, movimientos, naturaleza y Stat Points se guardan en tu colección.`}
        />
      )}
    </div>
  );
}
