import { useState } from 'react';
import { useMatchupController } from '../../controllers/useMatchupController';
import { useBuildController } from '../../controllers/useBuildController';
import { FORMAT_ES, usageLabel, type Format } from '../../models/data/meta';
import type { Matchup } from '../../models/analysis/build';
import { koText } from '../format';
import { getMove, STAT_ES, STATS, TYPE_ES } from '../../models/domain/dex';
import { effectiveSpecies, type PokemonSet } from '../../models/domain/sets';
import { Sprite, TypeBadge, Types } from './common';
import { tierColor } from '../theme';


/** Build recomendado comparado con el set actual (y con el del meta). */
export function BuildPanel({ set, format, team = [], onApply }: { set: PokemonSet; format: Format; team?: PokemonSet[]; onApply?: (s: PokemonSet) => void }) {
  const { build, rec, stats, rows } = useBuildController(set, format, team);
  return (
    <div className="insight">
      <div className="build-head">
        <Sprite species={effectiveSpecies(rec, true)} size={72} />
        <div>
          <h3>Build recomendado · {FORMAT_ES[format]}</h3>
          <div className="row wrap"><span className="role-tag">{build.role}</span><Types species={effectiveSpecies(rec, true)} /></div>
          <div className="muted small">Stats finales (nivel 50): {STATS.map((k) => `${STAT_ES[k]} ${stats[k]}`).join(' · ')}</div>
        </div>
      </div>
      <div className="table-scroll">
        <table className="build-table">
          <thead>
            <tr><th></th><th>Tu set</th><th>★ Recomendado</th>{build.metaSet && <th>Set del meta</th>}<th>Por qué</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const moveInfo = r.label.startsWith('Movimiento') ? getMove(r.recommended) : undefined;
              const differs = r.current !== r.recommended;
              return (
                <tr key={r.label}>
                  <th className="left">{r.label}</th>
                  <td className="left muted">{r.current}</td>
                  <td className={`left ${differs ? 'changed' : ''}`}>
                    {moveInfo && <TypeBadge type={moveInfo.type} small />} <b>{r.recommended}</b>
                    {moveInfo?.basePower ? <span className="muted small"> {moveInfo.basePower}</span> : null}
                  </td>
                  {build.metaSet && <td className="left muted small">{r.meta ?? '—'}</td>}
                  <td className="left small wrap-cell">{r.reasons.slice(0, 3).join(' · ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {onApply && (
        <div className="card-actions">
          <button className="primary" onClick={() => onApply(rec)}>Aplicar build recomendado</button>
          {build.metaSet && <button onClick={() => onApply(structuredClone(build.metaSet!))}>Aplicar set del meta ({usageLabel(build.metaEntry!)})</button>}
        </div>
      )}
      <p className="muted small">
        El build se calcula con los movimientos que puede aprender, su habilidad, sus stats y el meta de {FORMAT_ES[format]}
        {team.length > 1 ? '; el objeto evita repetir los de tus compañeros de equipo' : ''}.
      </p>
    </div>
  );
}

function MatchRow({ m }: { m: Matchup }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`match-row ${m.verdict}`} onClick={() => setOpen(!open)}>
      <Sprite species={m.foe.species} size={40} />
      <div className="match-main">
        <div className="match-title">
          <b>{m.entry.species}</b>
          <span className="tier-chip" style={{ background: tierColor[m.entry.tier] }}>{m.entry.tier} · {usageLabel(m.entry)}</span>
          <Types species={m.foe.species} />
        </div>
        <div className="match-line small">
          <span className="you">Tú: {m.mine.move} <b>{m.mine.minPct}–{m.mine.maxPct}%</b> ({koText(m.mine)})</span>
          <span className="them">Él: {m.theirs.move} <b>{m.theirs.minPct}–{m.theirs.maxPct}%</b> ({koText(m.theirs)})</span>
          <span className="muted">{m.mySpeed > m.theirSpeed ? '⚡ eres más rápido' : m.mySpeed < m.theirSpeed ? '🐢 es más rápido' : '= misma velocidad'}</span>
        </div>
        {open && (
          <div className="small match-detail">
            {m.summary} Su set: {m.entry.set!.ability} @ {m.entry.set!.item} — {m.entry.set!.moves.join(', ')}.
          </div>
        )}
      </div>
    </div>
  );
}

/** Análisis de fortalezas y debilidades: tipos y enfrentamientos contra el meta. */
export function MatchupPanel({ set, format }: { set: PokemonSet; format: Format }) {
  const { hasAttacks, data, types } = useMatchupController(set, format);
  const [show, setShow] = useState({ weak: 8, strong: 8 });
  const t = (list: string[]) => (list.length ? list.map((x) => <TypeBadge key={x} type={x} small />) : <span className="muted small">ninguno</span>);
  const worst = data.weak.slice(0, 3);
  const best = data.strong.slice(0, 3);

  return (
    <div className="insight">
      {!hasAttacks && <p className="notice small">Tu set no tiene ataques: el análisis usa el build recomendado.</p>}
      <div className="mu-summary">
        <div className="mu-count win"><b>{data.strong.length}</b><span>le gana</span></div>
        <div className="mu-count even"><b>{data.even.length}</b><span>igualados</span></div>
        <div className="mu-count lose"><b>{data.weak.length}</b><span>pierde</span></div>
        <div className="mu-text small">
          {worst.length > 0 && <p>⚠ <b>Mayores amenazas:</b> {worst.map((w) => `${w.entry.species} (le hace ${w.theirs.minPct}–${w.theirs.maxPct}% con ${w.theirs.move})`).join('; ')}.</p>}
          {best.length > 0 && <p>✔ <b>Mejores objetivos:</b> {best.map((w) => `${w.entry.species} (${w.mine.minPct}–${w.mine.maxPct}% con ${w.mine.move})`).join('; ')}.</p>}
          <p className="muted">Contra los 100 Pokémon más usados de {FORMAT_ES[format]} con su set más común, 1 contra 1, sin clima ni cambios de stats. Pulsa una fila para ver el detalle.</p>
        </div>
      </div>

      <div className="type-grid">
        <div className="type-box bad"><h4>Débil a</h4>
          {types.x4.length > 0 && <div>x4: {t(types.x4)}</div>}
          <div>x2: {t(types.x2)}</div>
        </div>
        <div className="type-box good"><h4>Resiste</h4>
          <div>½: {t(types.half)}</div>
          {types.quarter.length > 0 && <div>¼: {t(types.quarter)}</div>}
          {types.immune.length > 0 && <div>Inmune: {t(types.immune)}</div>}
        </div>
        <div className="type-box"><h4>Sus ataques golpean súper eficaz a</h4>
          <div>{t(types.superEffective)}</div>
          {types.resisted.length > 0 && <div className="small muted">Le resisten todo: {types.resisted.map((x) => TYPE_ES[x]).join(', ')}</div>}
          {types.noDamage.length > 0 && <div className="small muted">No puede dañar a: {types.noDamage.map((x) => TYPE_ES[x]).join(', ')}</div>}
        </div>
      </div>

      <div className="mu-columns">
        <div>
          <h4 className="lose-h">💀 Débil contra ({data.weak.length})</h4>
          {data.weak.slice(0, show.weak).map((m) => <MatchRow key={m.entry.species} m={m} />)}
          {data.weak.length > show.weak && <button className="more" onClick={() => setShow({ ...show, weak: show.weak + 10 })}>Ver más</button>}
        </div>
        <div>
          <h4 className="win-h">💪 Fuerte contra ({data.strong.length})</h4>
          {data.strong.slice(0, show.strong).map((m) => <MatchRow key={m.entry.species} m={m} />)}
          {data.strong.length > show.strong && <button className="more" onClick={() => setShow({ ...show, strong: show.strong + 10 })}>Ver más</button>}
          {data.even.length > 0 && <>
            <h4 className="muted">⚖ Igualados ({data.even.length})</h4>
            {data.even.map((m) => <MatchRow key={m.entry.species} m={m} />)}
          </>}
        </div>
      </div>
    </div>
  );
}

/** Ventana de solo lectura con build y enfrentamientos (desde el catálogo o el ranking). */
export function InsightModal({ set, format, team, onClose, onRecruit }: {
  set: PokemonSet; format: Format; team?: PokemonSet[]; onClose: () => void; onRecruit?: (s: PokemonSet) => void;
}) {
  const [tab, setTab] = useState<'build' | 'mu'>('build');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="row wrap modal-top">
          <h2 style={{ margin: 0 }}>{set.species}</h2>
          <div className="seg small">
            <button className={tab === 'build' ? 'active' : ''} onClick={() => setTab('build')}>🛠 Build</button>
            <button className={tab === 'mu' ? 'active' : ''} onClick={() => setTab('mu')}>⚔️ Fuerte / Débil</button>
          </div>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        {tab === 'build'
          ? <BuildPanel set={set} format={format} team={team} onApply={onRecruit ? (s) => { onRecruit(s); onClose(); } : undefined} />
          : <MatchupPanel set={set} format={format} />}
        {onRecruit && <p className="muted small">"Aplicar" recluta al Pokémon con ese build.</p>}
      </div>
    </div>
  );
}
