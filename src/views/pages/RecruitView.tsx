import { useRecruitController } from '../../controllers/useRecruitController';
import { useItemsController } from '../../controllers/useItemsController';
import { useSynergyController } from '../../controllers/useSynergyController';
import { FORMAT_ES, type Format } from '../../models/data/meta';
import { getSpecies } from '../../models/domain/dex';
import { itemName } from '../format';
import { effectiveSpecies, type PokemonSet } from '../../models/domain/sets';
import { type BoxEntry } from '../../models/repository/store';
import { Catalog } from '../components/Catalog';
import { Picker } from '../components/Picker';
import { Selection } from './SelectionView';
import { Sprite, Types, ItemIcon } from '../components/common';


interface Props {
  format: Format;
  team: PokemonSet[];
  setTeam: (t: PokemonSet[]) => void;
  box: BoxEntry[];
  setBox: (b: BoxEntry[]) => void;
  inventory: string[];
  setInventory: (i: string[]) => void;
  onOpenCollection?: () => void;
}

export function Recruit(props: Props) {
  const { sub, setSub, recruitSpecies, recruitSet } = useRecruitController(props.box, props.setBox);
  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Reclutamiento · {FORMAT_ES[props.format]}</h2>
          <p className="muted">Encuentra quién combina con tu equipo, busca Pokémon por nombre y tipo, y reparte tus objetos.</p>
        </div>
        <div className="seg">
          <button className={sub === 'selection' ? 'active' : ''} onClick={() => setSub('selection')}>🎲 Selección del juego</button>
          <button className={sub === 'catalog' ? 'active' : ''} onClick={() => setSub('catalog')}>🔍 Buscar Pokémon</button>
          <button className={sub === 'synergy' ? 'active' : ''} onClick={() => setSub('synergy')}>🤝 Sinergia por habilidad</button>
          <button onClick={props.onOpenCollection}>📚 Mi colección ({props.box.length}) →</button>
          <button className={sub === 'items' ? 'active' : ''} onClick={() => setSub('items')}>🎒 Mis objetos ({props.inventory.length})</button>
        </div>
      </div>
      {sub === 'selection' && <Selection format={props.format} team={props.team} setTeam={props.setTeam} box={props.box} setBox={props.setBox} />}
      {sub === 'catalog' && (
        <Catalog
          format={props.format} owned={props.box.map((b) => b.species)}
          onRecruit={recruitSpecies}
          team={props.team}
          onRecruitSet={recruitSet}
        />
      )}
      {sub === 'synergy' && <SynergyView {...props} />}
      {sub === 'items' && <ItemsView {...props} />}
    </div>
  );
}

// ───────────────────────── Sinergia ─────────────────────────

function SynergyView({ format, team, setTeam, box, setBox }: Props) {
  const { recruit, source, setSource, limit, setLimit, ranked } = useSynergyController({ format, team, setTeam, box, setBox });
  if (!team.length) {
    return <div className="empty-state">Añade al menos un Pokémon a tu equipo de {FORMAT_ES[format]} y te diré quién combina mejor con él según su habilidad.</div>;
  }


  return (
    <div>
      <div className="panel compact">
        <div className="row wrap">
          <span className="muted small">Tu equipo:</span>
          {team.map((s) => (
            <span key={s.species} className="chip"><Sprite species={effectiveSpecies(s, true)} size={28} />{s.species} <span className="muted small">({s.ability})</span></span>
          ))}
        </div>
        <div className="row wrap" style={{ marginTop: 8 }}>
          <span className="muted small">Buscar entre:</span>
          <div className="seg small">
            <button className={source === 'meta' ? 'active' : ''} onClick={() => setSource('meta')}>Meta de {FORMAT_ES[format]}</button>
            <button className={source === 'box' ? 'active' : ''} onClick={() => setSource('box')}>Mis reclutados</button>
            <button className={source === 'all' ? 'active' : ''} onClick={() => setSource('all')}>Todos los Pokémon</button>
          </div>
        </div>
        {source === 'all' && <p className="muted small">Los Pokémon sin set del meta usan su primera habilidad y no tienen movimientos configurados, así que solo puntúan por habilidad.</p>}
      </div>

      <div className="syn-grid">
        {ranked.slice(0, limit).map((c, i) => {
          const good = c.hits.filter((h) => h.points > 0).sort((a, b) => b.points - a.points);
          const bad = c.hits.filter((h) => h.points < 0);
          const inBox = box.some((b) => b.species === c.set.species);
          return (
            <div key={c.set.species} className="syn-card">
              <div className="syn-head">
                <span className="rank-num">#{i + 1}</span>
                <Sprite species={effectiveSpecies(c.set, true)} size={56} />
                <div className="syn-title">
                  <b>{c.set.species}</b>{inBox && <span className="owned-tag">✓</span>}
                  <div><Types species={c.set.species} /></div>
                  <div className="muted small">Habilidad: <b>{c.set.ability}</b>{effectiveSpecies(c.set, true) !== c.set.species && <> · Mega: {getSpecies(effectiveSpecies(c.set, true))?.abilities?.[0]}</>}</div>
                </div>
                <div className={`syn-score ${c.synergyOnly > 20 ? 'hi' : c.synergyOnly > 5 ? 'mid' : 'lo'}`}>
                  <span>{Math.round(c.synergyOnly)}</span><small>sinergia</small>
                </div>
              </div>
              {c.partners.length > 0 && (
                <div className="small">Combina mejor con: {c.partners.slice(0, 3).map((p) => <b key={p.species}>{p.species} </b>)}</div>
              )}
              <ul className="reasons good">{good.slice(0, 4).map((h, k) => <li key={k}>{h.text}</li>)}</ul>
              {good.length === 0 && <p className="muted small">Sin sinergias de habilidad destacables con tu equipo.</p>}
              {bad.length > 0 && <ul className="reasons warn">{bad.slice(0, 2).map((h, k) => <li key={k}>{h.text}</li>)}</ul>}
              <div className="card-actions">
                {!inBox && <button onClick={() => recruit(c.set, false)}>Reclutar</button>}
                <button className="primary" disabled={team.length >= 6} onClick={() => recruit(c.set, true)}>{inBox ? 'Añadir al equipo' : 'Reclutar y añadir al equipo'}</button>
              </div>
            </div>
          );
        })}
      </div>
      {ranked.length > limit && <button className="more" onClick={() => setLimit(limit + 12)}>Ver más</button>}
    </div>
  );
}

// ───────────────────────── Objetos ─────────────────────────

function ItemsView({ format, team, setTeam, box, inventory, setInventory }: Props) {
  const { addCommon, addMeta, options, result, addItems, stones } = useItemsController({ format, team, box, inventory, setInventory });
  return (
    <div>
      <div className="panel compact">
        <h3>Tu inventario</h3>
        <div className="row wrap">
          <div className="item-adder">
            <Picker value="" options={options} onChange={(v) => v && addItems([v])} placeholder="＋ Añadir objeto…" icon={(v) => <ItemIcon item={v} />} />
          </div>
          <button onClick={addCommon}>+ Objetos comunes</button>
          <button onClick={addMeta}>+ Objetos del meta</button>
          {stones.length > 0 && <button onClick={() => addItems(stones)}>+ Megapiedras de mis Pokémon</button>}
          {inventory.length > 0 && <button className="danger" onClick={() => setInventory([])}>Vaciar</button>}
        </div>
        <div className="chips">
          {inventory.length === 0 && <span className="muted small">Indica qué objetos tienes y te diré cuál ponerle a cada Pokémon.</span>}
          {inventory.map((i) => (
            <span key={i} className="chip"><ItemIcon item={i} size={20} /> {itemName(i)} <button className="link" onClick={() => setInventory(inventory.filter((x) => x !== i))}>✕</button></span>
          ))}
        </div>
      </div>

      {!team.length ? (
        <div className="empty-state">Arma tu equipo de {FORMAT_ES[format]} para repartir los objetos.</div>
      ) : !result ? null : (
        <section className="panel">
          <div className="section-head">
            <h3>🎯 Objeto recomendado para cada Pokémon</h3>
            <button className="primary" onClick={() => setTeam(team.map((s, i) => ({ ...s, item: result.assignments[i].item ?? s.item })))}>Aplicar a mi equipo</button>
          </div>
          <p className="muted small">Cada objeto se usa una sola vez (cláusula de objetos). Las megapiedras valen menos a partir de la segunda porque solo una Mega evoluciona por combate.</p>
          <div className="table-scroll">
            <table className="items-table">
              <thead>
                <tr><th>Pokémon</th><th>Ahora</th><th>Recomendado</th><th>Por qué</th><th>Otras opciones</th></tr>
              </thead>
              <tbody>
                {result.assignments.map((a, i) => {
                  const same = a.item === team[i].item;
                  return (
                    <tr key={a.species}>
                      <td className="left"><Sprite species={a.item ? effectiveSpecies({ ...team[i], item: a.item }, true) : a.species} size={36} /> {a.species}</td>
                      <td className="muted">{team[i].item ? <><ItemIcon item={team[i].item} size={20} /> {itemName(team[i].item)}</> : '—'}</td>
                      <td className={same ? '' : 'changed'}><b>{a.item ? <><ItemIcon item={a.item} size={20} /> {itemName(a.item)}</> : '— ninguno —'}</b>{same && <span className="muted small"> (igual)</span>}</td>
                      <td className="left small wrap-cell">{a.reason}</td>
                      <td className="left small wrap-cell">{a.alternatives.map((x) => `${x.item} (${Math.round(x.score)})`).join(', ') || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {result.assignments.some((a) => !a.item) && <p className="muted small">⚠ Algunos Pokémon se quedan sin objeto: añade más objetos a tu inventario.</p>}
        </section>
      )}
    </div>
  );
}
