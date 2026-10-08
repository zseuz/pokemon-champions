import { useMemo, useState } from 'react';
import { FORMAT_ES, metaEntry, metaWeight, usageLabel, type Format } from '../data/meta';
import { abilityName } from '../lib/abilities';
import { getMove, getSpecies, STAT_ES, STATS, TYPE_ES, TYPES } from '../lib/dex';
import { assignItems, itemName } from '../lib/items';
import { effectiveSpecies, type PokemonSet } from '../lib/sets';
import { addSpecies, isCustom, setFor, upsertSet, type BoxEntry } from '../lib/store';
import { autoBuild, collectionAdvice, type BuiltTeam } from '../lib/synergy';
import { Sprite, TypeBadge, Types, tierColor } from './common';
import { SetEditor } from './SetEditor';
import { TeamReview } from './TeamReview';

interface Props {
  format: Format;
  team: PokemonSet[];
  setTeam: (t: PokemonSet[]) => void;
  box: BoxEntry[];
  setBox: (b: BoxEntry[]) => void;
  inventory: string[];
  onGoRecruit: () => void;
}

type Sort = 'fit' | 'meta' | 'name' | 'bst';

export function Collection({ format, team, setTeam, box, setBox, inventory, onGoRecruit }: Props) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState<Sort>('fit');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [locked, setLocked] = useState<string[]>([]);
  const [size, setSize] = useState(6);
  const [built, setBuilt] = useState<BuiltTeam[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState('');

  const sets = useMemo(() => box.map((b) => setFor(b, format)), [box, format]);
  const advice = useMemo(() => collectionAdvice(team, sets, format), [team, sets, format]);
  const fitOf = (species: string) => advice.fits.find((f) => f.set.species === species);

  // resumen de la colección
  const typeCount = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of sets) for (const t of getSpecies(effectiveSpecies(s, true))?.types ?? []) c[t] = (c[t] ?? 0) + 1;
    return c;
  }, [sets]);
  const megaCount = sets.filter((s) => effectiveSpecies(s, true) !== s.species).length;
  const metaCount = sets.filter((s) => metaEntry(s.species, format)).length;

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const bst = (s: PokemonSet) => Object.values(getSpecies(effectiveSpecies(s, true))?.baseStats ?? {}).reduce((t, v) => t + v, 0);
    return sets
      .filter((s) => (!needle || s.species.toLowerCase().includes(needle)) && (!type || getSpecies(effectiveSpecies(s, true))?.types.includes(type as never) || getSpecies(s.species)?.types.includes(type as never)))
      .sort((a, b) => {
        const inA = team.some((t) => t.species === a.species);
        const inB = team.some((t) => t.species === b.species);
        if (sort === 'fit') return (inB ? 1e6 : fitOf(b.species)?.fit ?? -1e6) - (inA ? 1e6 : fitOf(a.species)?.fit ?? -1e6);
        if (sort === 'name') return a.species.localeCompare(b.species);
        if (sort === 'bst') return bst(b) - bst(a);
        const w = (s: PokemonSet) => { const m = metaEntry(s.species, format); return m ? metaWeight(m) : -1; };
        return w(b) - w(a);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets, q, type, sort, advice, team, format]);

  const inTeam = (sp: string) => team.some((t) => t.species === sp);
  const addToTeam = (s: PokemonSet) => team.length < 6 && !inTeam(s.species) && setTeam([...team, structuredClone(s)]);
  const swap = (out: string, s: PokemonSet) => setTeam(team.map((t) => (t.species === out ? structuredClone(s) : t)));

  const build = () => {
    setBusy(true);
    setTimeout(() => {
      const lockIdx = sets.map((s, i) => (locked.includes(s.species) ? i : -1)).filter((i) => i >= 0);
      setBuilt(autoBuild(sets, format, size, lockIdx, 3));
      setBusy(false);
    }, 20);
  };
  const applyBuilt = (t: BuiltTeam, withItems: boolean) => {
    let members = t.members.map((m) => structuredClone(m));
    if (withItems && inventory.length) {
      const { assignments } = assignItems(members, inventory, format);
      members = members.map((m, i) => ({ ...m, item: assignments[i].item ?? '' }));
    }
    setTeam(members);
  };

  if (box.length === 0) {
    return (
      <div>
        <h2>Mi colección</h2>
        <div className="empty-state">
          Aún no has reclutado ningún Pokémon.<br /><br />
          <button className="primary" onClick={onGoRecruit}>🔍 Ir a reclutar</button>
        </div>
      </div>
    );
  }

  const editingEntry = box.find((b) => b.species === editing);

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Mi colección <span className="muted">({box.length} Pokémon)</span></h2>
          <p className="muted">Todo lo que has reclutado con tu set de cada uno (el mismo en individuales y dobles), y qué es lo mejor para tu equipo de {FORMAT_ES[format]}.</p>
        </div>
        <div className="filters">
          <input list="dl-species" placeholder="Reclutar otro…" value={adding} onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && getSpecies(adding)) { setBox(addSpecies(box, adding)); setAdding(''); } }} />
          <button onClick={onGoRecruit}>🔍 Buscar más</button>
        </div>
      </div>

      {/* Resumen */}
      <div className="coll-stats">
        <div className="stat-tile"><b>{box.length}</b><span>reclutados</span></div>
        <div className="stat-tile"><b>{team.length}/6</b><span>en tu equipo de {FORMAT_ES[format]}</span></div>
        <div className="stat-tile"><b>{metaCount}</b><span>usados en el meta</span></div>
        <div className="stat-tile"><b>{megaCount}</b><span>con Mega</span></div>
        <div className="stat-tile types-tile">
          <span>Tipos en tu colección</span>
          <div className="type-counts">
            {TYPES.filter((t) => typeCount[t]).sort((a, b) => typeCount[b] - typeCount[a]).map((t) => (
              <span key={t}><TypeBadge type={t} small /> {typeCount[t]}</span>
            ))}
          </div>
          {TYPES.some((t) => !typeCount[t]) && <span className="muted small">Sin: {TYPES.filter((t) => !typeCount[t]).map((t) => TYPE_ES[t]).join(', ')}</span>}
        </div>
      </div>

      {/* Observaciones: qué mejorar en el equipo */}
      <TeamReview
        team={team} collection={sets} format={format} inventory={inventory}
        onEdit={(species) => setEditing(species)}
        onAdd={(species) => { const c = sets.find((x) => x.species === species); if (c) addToTeam(c); }}
        onSwap={(out, species) => { const c = sets.find((x) => x.species === species); if (c) swap(out, c); }}
        teamFull={team.length >= 6}
      />

      {/* Lo mejor para tu equipo */}
      <section className="panel best-for-team">
        <h3>🎯 Lo mejor de tu colección para tu equipo</h3>
        {team.length === 0 ? (
          <p className="muted">Tu equipo de {FORMAT_ES[format]} está vacío: usa <b>Armar mi equipo</b> más abajo o añade Pokémon con "+ Equipo".</p>
        ) : team.length < 6 ? (
          <>
            <p className="muted small">Tu equipo tiene {6 - team.length} hueco(s). Estos son los que más lo mejoran:</p>
            <div className="advice-list">
              {advice.fits.slice(0, 5).map((f, i) => (
                <div key={f.set.species} className={`advice-row${i === 0 ? ' top' : ''}`}>
                  <Sprite species={effectiveSpecies(f.set, true)} size={44} />
                  <div className="advice-text">
                    <b>{i === 0 && '★ '}Añadir {f.set.species}</b> <span className="delta pos">+{Math.round(f.fit)}</span>
                    <ul className="reasons">{f.reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul>
                  </div>
                  <button className="primary" onClick={() => addToTeam(f.set)}>+ Equipo</button>
                </div>
              ))}
              {advice.fits.length === 0 && <p className="muted">Ya tienes en el equipo todos tus reclutados.</p>}
            </div>
          </>
        ) : advice.swaps.length ? (
          <>
            <p className="muted small">Tu equipo está completo. Estos cambios lo mejorarían:</p>
            <div className="advice-list">
              {advice.swaps.slice(0, 5).map((sw, i) => (
                <div key={sw.in.species} className={`advice-row${i === 0 ? ' top' : ''}`}>
                  <Sprite species={sw.out} size={40} /><span className="arrow">→</span><Sprite species={effectiveSpecies(sw.in, true)} size={44} />
                  <div className="advice-text">
                    <b>{i === 0 && '★ '}Cambia {sw.out} por {sw.in.species}</b> <span className="delta pos">+{Math.round(sw.delta)}</span>
                    <ul className="reasons">{sw.reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul>
                  </div>
                  <button className="primary" onClick={() => swap(sw.out, sw.in)}>Hacer cambio</button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="good-msg">✔ Tu equipo ya es la mejor combinación posible con lo que tienes: ningún cambio lo mejora.</p>
        )}
        {team.length > 1 && (
          <div className="contrib">
            <span className="muted small">Aporte de cada miembro (lo que pierde el equipo sin él):</span>
            <div className="contrib-bars">
              {[...advice.contribution].reverse().map((c) => {
                const max = Math.max(...advice.contribution.map((x) => Math.abs(x.value)), 1);
                return (
                  <div key={c.species} className="contrib-row">
                    <Sprite species={c.species} size={28} /><span className="contrib-name">{c.species}</span>
                    <div className="contrib-bar"><div style={{ width: `${Math.max(2, (Math.abs(c.value) / max) * 100)}%`, background: c.value < 15 ? 'var(--warn)' : 'var(--good)' }} /></div>
                    <span className="small">{Math.round(c.value)}</span>
                  </div>
                );
              })}
            </div>
            {advice.contribution[0] && advice.contribution[0].value < 15 && (
              <p className="muted small">⚠ <b>{advice.contribution[0].species}</b> es el que menos aporta: es el primero que cambiaría.</p>
            )}
          </div>
        )}
      </section>

      {/* Armado automático */}
      <section className="panel">
        <h3>⚙️ Armar mi equipo con mi colección</h3>
        <p className="muted small">
          Elige la mejor combinación entre tus {box.length} reclutados para {FORMAT_ES[format]}: fuerza en el meta, sinergia de habilidades,
          roles, debilidades y Megas. Marca 📌 en las tarjetas para obligar a que un Pokémon entre.
        </p>
        <div className="row wrap">
          <label className="row">Tamaño
            <select value={size} onChange={(e) => setSize(Number(e.target.value))}>{[6, 5, 4, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <button className="primary" disabled={box.length < 2 || busy} onClick={build}>{busy ? 'Calculando…' : 'Armar equipo'}</button>
          {locked.length > 0 && <span className="muted small">📌 {locked.join(', ')}</span>}
        </div>
        {built?.map((t, k) => (
          <div key={k} className={`built${k === 0 ? ' best' : ''}`}>
            <div className="built-head"><b>{k === 0 ? '★ Mejor equipo' : `Alternativa ${k}`}</b><span className="muted small">puntuación {Math.round(t.score)}</span></div>
            <div className="built-members">
              {t.members.map((m) => <div key={m.species} className="built-mon"><Sprite species={effectiveSpecies(m, true)} size={48} /><span>{m.species}</span></div>)}
            </div>
            <div className="breakdown">
              {t.breakdown.map((b) => <span key={b.label} className={b.points >= 0 ? 'pos' : 'neg'}>{b.label}: {b.points >= 0 ? '+' : ''}{Math.round(b.points)}</span>)}
            </div>
            <ul className="reasons">{t.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            <div className="card-actions">
              <button className="primary" onClick={() => applyBuilt(t, false)}>Usar este equipo</button>
              <button disabled={!inventory.length} title={inventory.length ? '' : 'Añade objetos en Reclutamiento → Mis objetos'} onClick={() => applyBuilt(t, true)}>Usar y asignar mis objetos</button>
            </div>
          </div>
        ))}
      </section>

      {/* Colección completa */}
      <section className="panel">
        <div className="section-head">
          <h3>📚 Todos mis Pokémon</h3>
          <div className="filters">
            <input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Todos los tipos</option>
              {TYPES.map((t) => <option key={t} value={t}>{TYPE_ES[t]} {typeCount[t] ? `(${typeCount[t]})` : ''}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="fit">Orden: mejores para mi equipo</option>
              <option value="meta">Orden: más usados en el meta</option>
              <option value="bst">Orden: stats totales</option>
              <option value="name">Orden: nombre</option>
            </select>
          </div>
        </div>
        <div className="coll-grid">
          {list.map((s) => {
            const mega = effectiveSpecies(s, true);
            const sp = getSpecies(mega)!;
            const metaS = metaEntry(s.species, 'singles');
            const metaD = metaEntry(s.species, 'doubles');
            const fit = fitOf(s.species);
            const isIn = inTeam(s.species);
            const isLocked = locked.includes(s.species);
            const open = expanded === s.species;
            const entry = box.find((b) => b.species === s.species)!;
            return (
              <div key={s.species} className={`coll-card${isIn ? ' in-team' : ''}${open ? ' open' : ''}`}>
                <button className={`pin${isLocked ? ' on' : ''}`} title="Fijar en el armado automático" onClick={() => setLocked(isLocked ? locked.filter((x) => x !== s.species) : [...locked, s.species])}>📌</button>
                <div className="coll-head" onClick={() => setExpanded(open ? null : s.species)}>
                  <Sprite species={mega} size={64} />
                  <div className="coll-info">
                    <b>{s.species}</b>{mega !== s.species && <span className="mega-tag">Mega</span>}
                    {isIn && <span className="team-tag">En equipo</span>}
                    <div><Types species={mega} /></div>
                    <div className="meta-tags">
                      {metaD && <span className="tier-chip" style={{ background: tierColor[metaD.tier] }} title="Dobles">👥 {metaD.tier} · {usageLabel(metaD)}</span>}
                      {metaS && <span className="tier-chip" style={{ background: tierColor[metaS.tier] }} title="Individuales">👤 {metaS.tier} · {usageLabel(metaS)}</span>}
                      {!metaD && !metaS && <span className="muted small">fuera del meta</span>}
                    </div>
                  </div>
                  {!isIn && fit && (
                    <div className={`fit ${fit.fit > 5 ? 'hi' : fit.fit > 0 ? 'mid' : 'lo'}`} title={fit.replaces ? `Mejor cambio: por ${fit.replaces}` : 'Mejora al añadirlo'}>
                      <span>{fit.fit > 0 ? '+' : ''}{Math.round(fit.fit)}</span><small>{fit.replaces ? `por ${fit.replaces}` : 'encaje'}</small>
                    </div>
                  )}
                </div>
                <div className="coll-set small">
                  <div><span className="muted">Habilidad:</span> {abilityName(s.ability)}</div>
                  <div><span className="muted">Objeto:</span> {s.item ? itemName(s.item) : '—'} · <span className="muted">{s.nature}</span></div>
                  <div className="coll-moves">{s.moves.map((m) => <span key={m}><TypeBadge type={getMove(m)?.type ?? 'Normal'} small /> {m}</span>)}</div>
                  {isCustom(entry)
                    ? <div className="custom-tag">✔ Tu set (se usa en individuales y dobles)</div>
                    : <div className="muted">Set del meta de {FORMAT_ES[format]} — pulsa "Set" para poner el de tu Pokémon</div>}
                </div>
                {open && (
                  <div className="coll-detail">
                    <div className="base-stats">
                      {STATS.map((st) => (
                        <div key={st} className="bs-row"><span>{STAT_ES[st]}</span><div className="bs-bar"><div style={{ width: `${Math.min(100, (sp.baseStats[st] / 200) * 100)}%` }} /></div><b>{sp.baseStats[st]}</b></div>
                      ))}
                    </div>
                    {fit && fit.reasons.length > 0 && <ul className="reasons">{fit.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                    {metaD?.role && <div className="small muted">Rol en dobles: {metaD.role}</div>}
                    {metaS?.role && <div className="small muted">Rol en individuales: {metaS.role}</div>}
                  </div>
                )}
                <div className="card-actions">
                  <button className="small-btn" onClick={() => setExpanded(open ? null : s.species)}>{open ? 'Menos' : 'Detalles'}</button>
                  <button className="small-btn" onClick={() => setEditing(s.species)}>Set</button>
                  {isIn
                    ? <button className="small-btn" onClick={() => setTeam(team.filter((t) => t.species !== s.species))}>Sacar del equipo</button>
                    : team.length < 6
                      ? <button className="small-btn primary" onClick={() => addToTeam(s)}>+ Equipo</button>
                      : fit?.replaces && fit.fit > 0 && <button className="small-btn primary" onClick={() => swap(fit.replaces!, s)}>Cambiar por {fit.replaces}</button>}
                  <button className="small-btn danger" title="Quitar de la colección" onClick={() => confirm(`¿Quitar a ${s.species} de tu colección?`) && setBox(box.filter((b) => b.species !== s.species))}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
        {list.length === 0 && <p className="muted">Ningún Pokémon coincide con el filtro.</p>}
      </section>

      {editingEntry && (
        <SetEditor
          set={setFor(editingEntry, format)} format={format} team={team}
          onCancel={() => setEditing(null)}
          onSave={(s) => {
            // tu set se guarda una sola vez y lo usan los equipos de los dos formatos
            setBox(upsertSet(box, s));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
