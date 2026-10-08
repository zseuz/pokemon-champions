import { useSelectionController } from '../../controllers/useSelectionController';
import { FORMAT_ES, type Format } from '../../models/data/meta';
import { getMove } from '../../models/domain/dex';
import { moveLabel } from '../../models/domain/es';
import { effectiveSpecies, type PokemonSet } from '../../models/domain/sets';
import { type BoxEntry } from '../../models/repository/store';
import { Sprite, TypeBadge, Types } from '../components/common';
import { SetEditor } from '../components/SetEditor';
import { SpeciesGrid } from '../components/SpeciesGrid';


const gradeClass = (p: number) => (p >= 80 ? 'g-hi' : p >= 55 ? 'g-mid' : 'g-lo');

interface Props {
  format: Format;
  team: PokemonSet[];
  setTeam: (t: PokemonSet[]) => void;
  box: BoxEntry[];
  setBox: (b: BoxEntry[]) => void;
}

/**
 * Selección del reclutamiento de Pokémon Champions: el juego ofrece varios Pokémon, cada uno con
 * su habilidad, movimientos, naturaleza y Stat Points. Aquí se registran tal cual y se ordenan.
 */
export function Selection({ format, team, setTeam, box, setBox }: Props) {
  const { cands, setCands, showGrid, setShowGrid, editing, setEditing, open, setOpen, recruited, setRecruited, ready, ranked, add, recruit, indexOf } = useSelectionController({ format, team, setTeam, box, setBox });
  return (
    <div>
      <div className="panel compact">
        <h3>🎲 ¿A quién recluto?</h3>
        <p className="muted small">
          Cuando el juego te ofrezca su selección de Pokémon, añade cada uno <b>tal como aparece</b>: su habilidad, sus 4 movimientos,
          la naturaleza ("Variación de características") y los Stat Points. Puedes buscar los nombres en español o en inglés.
          Te diré cuál conviene más para tu equipo de <b>{FORMAT_ES[format]}</b>, teniendo en cuenta que cada ejemplar trae una habilidad y un set distintos.
        </p>
        <div className="row wrap">
          <button onClick={() => setShowGrid(!showGrid)}>{showGrid ? '▲ Ocultar buscador' : '▼ + Añadir candidato'}</button>
          {cands.length > 0 && <button className="danger" onClick={() => { if (confirm('¿Borrar la selección actual?')) { setCands([]); setRecruited(null); } }}>Nueva selección</button>}
        </div>
        {showGrid && (
          <SpeciesGrid
            format={format} onPick={add} marked={cands.map((c) => c.species)} markLabel="En la selección"
            placeholder="Busca el Pokémon que te ofrece el juego (p. ej. Beedrill)…"
          />
        )}
        {cands.length > 0 && (
          <div className="sel-strip">
            {cands.map((c, i) => (
              <button key={i} className={`sel-thumb${c.moves.length ? '' : ' incomplete'}${ranked[0]?.set === c ? ' best' : ''}`} onClick={() => setEditing(i)} title={c.moves.length ? `Editar ${c.species}` : `Completa los datos de ${c.species}`}>
                <Sprite species={c.species} size={48} />
                {!c.moves.length && <span className="thumb-warn">!</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {recruited && (
        <div className="good-msg row wrap" style={{ marginBottom: 12 }}>
          ✔ {recruited} reclutado y guardado en tu colección con su set.
          <button className="small-btn" onClick={() => { setCands([]); setRecruited(null); }}>Empezar nueva selección</button>
        </div>
      )}

      {cands.length > ready.length && (
        <p className="notice small">Faltan datos de {cands.filter((c) => !c.moves.length).map((c) => c.species).join(', ')}: pulsa su imagen y añade al menos sus movimientos.</p>
      )}

      {ranked.length === 0 ? (
        cands.length === 0 && <div className="empty-state">Añade los Pokémon que te ofrece el juego para compararlos.</div>
      ) : (
        <div className="cand-list">
          {ranked.map((c, i) => {
            const isOpen = open === c.set.species || (i === 0 && !c.owned?.same);
            return (
              <div key={c.set.species + i} className={`cand-card${i === 0 ? ' top' : ''}`}>
                <div className="cand-head">
                  <span className="cand-rank">{i === 0 ? '★' : `#${i + 1}`}</span>
                  <Sprite species={effectiveSpecies(c.set, true)} size={64} />
                  <div className="cand-title">
                    <div>
                      <b>{c.set.species}</b> {i === 0 && <span className="pick-tag">Recomendado</span>}
                      {team.some((t) => t.species === c.set.species) && <span className="team-tag">En tu equipo</span>}
                    </div>
                    {c.owned?.same ? (
                      <div className="owned-compare">✔ Ya reclutaste este ejemplar: está en tu colección</div>
                    ) : c.owned ? (
                      <div className={`owned-compare ${c.owned.better ? 'better' : 'worse'}`}>
                        📦 Ya tienes uno (calidad {c.owned.quality}%): este es{' '}
                        {c.owned.better ? <b>mejor (+{c.owned.diff}%)</b> : c.owned.diff < -3 ? <b>peor ({c.owned.diff}%)</b> : <b>prácticamente igual</b>}
                        {!c.owned.better && ' — mejor elige otro Pokémon'}
                      </div>
                    ) : box.some((b) => b.species === c.set.species) && (
                      <div className="owned-compare">📦 Ya lo tienes en tu colección (sin set configurado): este ejemplar pasará a ser el tuyo</div>
                    )}
                    <Types species={c.set.species} />
                    <div className="muted small">{c.verdict} · {c.metaText}</div>
                  </div>
                  <div className="cand-scores">
                    <div className={`qual ${gradeClass(c.quality)}`}><b>{c.quality}%</b><span>calidad del ejemplar</span></div>
                    <div className={`qual ${c.teamFit > 15 ? 'g-hi' : c.teamFit > 0 ? 'g-mid' : 'g-lo'}`}>
                      <b>{c.teamFit > 0 ? '+' : ''}{Math.round(c.teamFit)}</b>
                      <span>{team.length >= 6 && !team.some((t) => t.species === c.set.species)
                        ? (c.teamFit > 0 && c.replaces ? `si sustituye a ${c.replaces}` : 'no mejora tu equipo actual')
                        : 'aporte a tu equipo'}</span>
                    </div>
                    <div className="qual g-neutral"><b><span className="w">{c.wins}</span>/<span className="l">{c.losses}</span></b><span>gana / pierde vs meta</span></div>
                  </div>
                </div>

                <div className="grade-chips">
                  {c.parts.map((p) => (
                    <span key={p.label} className={`grade-chip ${gradeClass(p.pct)}`} title={p.text}>{p.label} {p.pct}%</span>
                  ))}
                  <button className="link" onClick={() => setOpen(isOpen && i !== 0 ? null : c.set.species)}>{isOpen ? '' : 'ver detalle'}</button>
                </div>

                {isOpen && (
                  <div className="cand-detail">
                    <div className="cand-moves">
                      {c.set.moves.map((m) => <span key={m}><TypeBadge type={getMove(m)?.type ?? 'Normal'} small /> {moveLabel(m)}</span>)}
                    </div>
                    <ul className="grade-list">
                      {c.parts.map((p) => (
                        <li key={p.label}>
                          <b className={gradeClass(p.pct)}>{p.label} ({p.pct}%)</b>: {p.text}
                          {p.tips.map((t) => <div key={t} className="tip">↳ {t}</div>)}
                        </li>
                      ))}
                      <li><b>Encaje con tu equipo</b>: {c.fitReasons.length ? c.fitReasons.join(' · ') : 'no cubre carencias claras de tu equipo'}</li>
                    </ul>
                  </div>
                )}

                <div className="card-actions">
                  <button className="primary" onClick={() => recruit(c, true)}>
                    {c.owned || team.some((t) => t.species === c.set.species)
                      ? 'Reclutar y reemplazar el mío'
                      : team.length < 6 ? 'Reclutar y añadir al equipo' : c.replaces && c.teamFit > 0 ? `Reclutar y cambiar por ${c.replaces}` : 'Reclutar'}
                  </button>
                  {!c.owned && !team.some((t) => t.species === c.set.species) && (team.length < 6 || (c.replaces && c.teamFit > 0)) && <button onClick={() => recruit(c, false)}>Solo reclutar</button>}
                  <button className="small-btn" onClick={() => setEditing(indexOf(c.set))}>Editar datos</button>
                  <button className="small-btn danger" onClick={() => setCands(cands.filter((x) => x !== c.set))}>Quitar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing != null && cands[editing] && (
        <SetEditor
          set={cands[editing]} format={format} team={team}
          onCancel={() => { if (!cands[editing].moves.length) setCands(cands.filter((_, j) => j !== editing)); setEditing(null); }}
          onSave={(s) => { setCands(cands.map((c, j) => (j === editing ? { ...s, item: '' } : c))); setEditing(null); }}
        />
      )}
    </div>
  );
}
