import { useRankingController, OPEN_BY_DEFAULT } from '../../controllers/useRankingController';
import { metaWeight, TIER_ORDER, type Format, type MetaEntry, type Tier } from '../../models/data/meta';
import { abilityName } from '../../models/domain/abilities';
import { getMove, getSpecies, STAT_ES, STATS, TYPE_ES, TYPES } from '../../models/domain/dex';
import { moveLabel, natureEs, speciesEs } from '../../models/domain/es';
import { itemName } from '../format';
import { defaultSet, effectiveSpecies } from '../../models/domain/sets';
import { Sprite, TypeBadge, Types } from '../components/common';
import { tierColor } from '../theme';
import { InsightModal } from '../components/Insight';

const TIER_DESC: Record<Tier, string> = {
  S: 'los más usados', A: 'muy usados', B: 'habituales', C: 'de nicho', D: 'poco usados', E: 'raros', F: 'casi nunca',
};

const pct = (n?: number) => (n != null ? <span className="pct">{n}%</span> : null);

export function Ranking({ onRecruit, teamSpecies, boxSpecies, format }: {
  onRecruit: (e: MetaEntry) => void; teamSpecies: string[]; boxSpecies: string[]; format: Format;
}) {
  const { META, META_INFO, q, setQ, type, setType, open, setOpen, insight, setInsight, expanded, setExpanded, list, maxUsage, filtering } = useRankingController(format);
  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Ranking del meta <span className="muted">({META.length} Pokémon)</span></h2>
          <p className="muted">
            {META_INFO.format} · actualizado {META_INFO.updated} · fuentes:{' '}
            {META_INFO.sources.map((s, i) => (
              <span key={s.url}>{i > 0 && ', '}<a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></span>
            ))}
          </p>
        </div>
        <div className="filters">
          <input placeholder="Buscar Pokémon…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Todos los tipos</option>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_ES[t]}</option>)}
          </select>
        </div>
      </div>

      {filtering && list.length === 0 && <div className="empty-state">Ningún Pokémon del ranking coincide con la búsqueda.</div>}

      {TIER_ORDER.map((tier) => {
        const entries = list.filter((e) => e.tier === tier).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
        if (!entries.length) return null;
        const isExpanded = filtering || expanded.includes(tier);
        return (
          <section key={tier} className="tier-section">
            <div className="tier-label" style={{ background: tierColor[tier] }}>
              {tier}
              <small>{entries.length}</small>
            </div>
            {!isExpanded ? (
              <button className="tier-collapsed" onClick={() => setExpanded([...expanded, tier])}>
                <span className="muted small">Tier {tier} · {TIER_DESC[tier]} · {entries.length} Pokémon</span>
                <span className="tier-peek">{entries.slice(0, 14).map((e) => <Sprite key={e.species} species={e.species} size={32} />)}</span>
                <span className="link">Mostrar ▾</span>
              </button>
            ) : (
              <div className="tier-list">
                {entries.map((e) => {
                  const isOpen = open === e.species;
                  const mega = e.set ? effectiveSpecies(e.set, true) : e.species;
                  const bs = getSpecies(mega)?.baseStats;
                  const inTeam = teamSpecies.includes(e.species);
                  const inBox = boxSpecies.includes(e.species);
                  return (
                    <div key={e.species} className={`rank-card${isOpen ? ' open' : ''}`}>
                      <div className="rank-main" onClick={() => setOpen(isOpen ? null : e.species)}>
                        <span className="rank-num">#{e.rank}</span>
                        <Sprite species={mega} size={56} />
                        <div className="rank-info">
                          <div className="rank-name">
                            {speciesEs(e.species)}{mega !== e.species && <span className="mega-tag">Mega</span>}
                            {inBox && <span className="owned-tag" title="Reclutado">✓</span>}
                          </div>
                          <Types species={mega} />
                          {e.role && <div className="muted small">{e.role}</div>}
                        </div>
                        <div className="usage">
                          <div className="usage-bar"><div style={{ width: `${(metaWeight(e) / maxUsage) * 100}%`, background: tierColor[tier] }} /></div>
                          {e.usage != null && <span>{e.usage}%</span>}
                          {e.trend && <span className={`trend ${e.trend.startsWith('↑') ? 'up' : e.trend.startsWith('↓') ? 'down' : e.trend.startsWith('★') ? 'new' : ''}`}>{e.trend}</span>}
                        </div>
                      </div>
                      {isOpen && (
                        <div className="rank-detail">
                          {e.set ? (
                            <div className="set-box">
                              <div className="muted small">Set más usado (y % de jugadores que lo llevan)</div>
                              <div><b>{speciesEs(e.set.species)}</b> @ {e.set.item ? itemName(e.set.item) : '—'} {pct(e.setPct?.item)}</div>
                              <div>Habilidad: {abilityName(e.set.ability)} {pct(e.setPct?.ability)}</div>
                              <div>Naturaleza: {natureEs(e.set.nature)} ({e.set.nature}) {pct(e.setPct?.nature)}</div>
                              <div className="muted small">SP: {STATS.filter((s) => e.set!.sp[s]).map((s) => `${e.set!.sp[s]} ${STAT_ES[s]}`).join(' / ')} {pct(e.setPct?.spread)}</div>
                              <ul className="moves">
                                {e.set.moves.map((m, i) => <li key={m}><TypeBadge type={getMove(m)?.type ?? 'Normal'} small /> {moveLabel(m)} {pct(e.setPct?.moves[i])}</li>)}
                              </ul>
                            </div>
                          ) : <p className="muted">Sin set registrado: al reclutarlo podrás configurarlo.</p>}
                          {bs && (
                            <div className="base-stats">
                              {STATS.map((s) => (
                                <div key={s} className="bs-row">
                                  <span>{STAT_ES[s]}</span>
                                  <div className="bs-bar"><div style={{ width: `${Math.min(100, (bs[s] / 200) * 100)}%` }} /></div>
                                  <b>{bs[s]}</b>
                                </div>
                              ))}
                            </div>
                          )}
                          {e.partners && <div className="small">Compañeros habituales: {e.partners.join(', ')}</div>}
                          <button onClick={() => setInsight(e)}>🛠 Build y fuerte / débil</button>
                          <button className="primary" disabled={inTeam} onClick={() => onRecruit(e)}>
                            {inTeam ? 'Ya está en tu equipo' : inBox ? 'Reclutado · añadir al equipo' : 'Reclutar'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {!filtering && !OPEN_BY_DEFAULT.includes(tier) && (
                  <button className="link tier-hide" onClick={() => setExpanded(expanded.filter((t) => t !== tier))}>Ocultar tier {tier} ▴</button>
                )}
              </div>
            )}
          </section>
        );
      })}
      {insight && <InsightModal set={insight.set ?? defaultSet(insight.species)} format={format} onClose={() => setInsight(null)} />}
    </div>
  );
}
