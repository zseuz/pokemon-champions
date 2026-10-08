import { useTeamReviewController } from '../../controllers/useTeamReviewController';
import { FORMAT_ES, type Format } from '../../models/data/meta';
import { type Level, type Observation } from '../../models/analysis/observations';
import type { PokemonSet } from '../../models/domain/sets';
import { Sprite } from './common';

const LEVEL: Record<Level, { icon: string; label: string }> = {
  alta: { icon: '🔴', label: 'Importante' },
  media: { icon: '🟠', label: 'A mejorar' },
  baja: { icon: '🟡', label: 'Detalle' },
  ok: { icon: '🟢', label: 'Bien' },
};

/** Panel de observaciones: qué mejorar en el equipo, con acciones directas. */
export function TeamReview({ team, collection, format, inventory, onEdit, onAdd, onSwap, teamFull }: {
  team: PokemonSet[];
  collection: PokemonSet[];
  format: Format;
  inventory: string[];
  onEdit: (species: string) => void;
  onAdd: (species: string) => void;
  onSwap: (out: string, inSpecies: string) => void;
  teamFull: boolean;
}) {
  const { obs, showLow, setShowLow, counts, visible, inTeam } = useTeamReviewController(team, collection, format, inventory);
  return (
    <section className="panel review">
      <div className="review-head">
        <h3>🩺 Observaciones de tu equipo de {FORMAT_ES[format]}</h3>
        <div className="review-counts">
          {counts.filter((c) => c.n).map((c) => (
            <span key={c.l} className={`rc rc-${c.l}`}>{LEVEL[c.l].icon} {c.n} {LEVEL[c.l].label.toLowerCase()}{c.n > 1 && c.l !== 'media' ? 's' : ''}</span>
          ))}
        </div>
      </div>
      {team.length > 0 && (
        <div className="review-team">
          {team.map((t) => <Sprite key={t.species} species={t.species} size={36} />)}
        </div>
      )}

      <div className="review-list">
        {visible.map((o, i) => <ObservationRow key={i} o={o} inTeam={inTeam} teamFull={teamFull} onEdit={onEdit} onAdd={onAdd} onSwap={onSwap} />)}
      </div>
      {obs.some((o) => o.level === 'baja') && (
        <button className="link" onClick={() => setShowLow(!showLow)}>
          {showLow ? 'Ocultar detalles menores ▴' : `Ver ${obs.filter((o) => o.level === 'baja').length} detalles menores ▾`}
        </button>
      )}
    </section>
  );
}

function ObservationRow({ o, inTeam, teamFull, onEdit, onAdd, onSwap }: {
  o: Observation; inTeam: (sp: string) => boolean; teamFull: boolean;
  onEdit: (species: string) => void; onAdd: (species: string) => void; onSwap: (out: string, inSpecies: string) => void;
}) {
  return (
    <div className={`obs obs-${o.level}`}>
      <span className="obs-icon" title={LEVEL[o.level].label}>{LEVEL[o.level].icon}</span>
      <div className="obs-body">
        <div className="obs-title"><span className="obs-area">{o.area}</span> <b>{o.title}</b></div>
        {o.detail && <div className="obs-detail">{o.detail}</div>}
        {o.points && <ul className="obs-points">{o.points.map((p) => <li key={p}>{p}</li>)}</ul>}
        {o.fix && <div className="obs-fix">↳ {o.fix}</div>}
        {o.suggest && o.suggest.length > 0 && (
          <div className="obs-suggest">
            {o.suggest.map((sg) => (
              <span key={sg.species} className="chip">
                <Sprite species={sg.species} size={28} /> {sg.species}{sg.why && <span className="muted small"> · {sg.why}</span>}
                {!inTeam(sg.species) && !teamFull && <button className="small-btn" onClick={() => onAdd(sg.species)}>+ Equipo</button>}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="obs-actions">
        {o.member && <button className="small-btn" onClick={() => onEdit(o.member!)}>Editar set</button>}
        {o.swap && <button className="small-btn primary" onClick={() => onSwap(o.swap!.out, o.swap!.in)}>Hacer cambio</button>}
      </div>
    </div>
  );
}
