import { useAssistantController, type SlotState, type Status } from '../../controllers/useAssistantController';
import { FORMAT_ES, type Format } from '../../models/data/meta';
import { type Option } from '../../models/engine/ai';
import { isStatusMove, moveTargetKind, type BattleMon, type BattleState, type Terrain, type Weather } from '../../models/engine/battle';
import { getMove, getSpecies, STAT_ES } from '../../models/domain/dex';
import { moveLabel, speciesEs } from '../../models/domain/es';
import { canMega, type PokemonSet } from '../../models/domain/sets';
import { DamageBar, HpBar, Sprite, TypeBadge, Types } from '../components/common';
import { SetEditor } from '../components/SetEditor';
import { SpeciesSelect } from '../components/SpeciesSelect';
import type { DoublesBrief, Hit } from '../../models/analysis/doublesBrief';

const STATUS_OPTS: [Status, string][] = [['', 'Sano'], ['brn', 'Quemado'], ['par', 'Paralizado'], ['psn', 'Envenenado'], ['tox', 'Tóxico'], ['slp', 'Dormido']];

/**
 * Asistente de turno.
 * - Individuales: llevas 3 Pokémon y el rival 3; uno de cada lado en combate (1 contra 1).
 * - Dobles: cada uno lleva 4 de sus 6; 2 contra 2 en combate y 2 en reserva por lado.
 */
export function Assistant({ team, format }: { team: PokemonSet[]; format: Format }) {
  const { foeSetFor, damage, singles, N, onField, mineIdx, setMineIdx, mine, setMine, theirs, setTheirs, actives, toggleActive, weather, setWeather, terrain, setTerrain, trickRoom, setTrickRoom, tw, setTw, screens, setScreens, editingFoe, setEditingFoe, mineSlots, state, slotsN, myMons, foeMons, rawActive, foesAlive, advice, foeAdvice, plan, brief, myReplace, foeReplace, alive, order } = useAssistantController(team, format);
  if (team.length === 0) {
    return <div className="empty-state">Primero arma tu equipo de {FORMAT_ES[format]} en <b>Mi equipo</b> o <b>Mi colección</b> para usar el asistente.</div>;
  }

  const slotEditor = (side: 0 | 1, i: number) => {
    const slots = side === 0 ? mineSlots : theirs;
    const sl = slots[i];
    const set = (patch: Partial<SlotState>) => {
      if (side === 0) setMine(mine.map((x, j) => (j === i ? { ...x, ...patch } : x)));
      else setTheirs(theirs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    };
    const isActive = actives[side].includes(i);
    const species = sl.set?.species;
    const valid = !!species && !!getSpecies(species);
    const fainted = valid && sl.hp <= 0;
    return (
      <div className={`slot${isActive ? ' active-slot' : ' bench-slot'}${fainted ? ' fainted-slot' : ''}`} key={`${side}-${i}`}>
        <label className="active-pick" title={singles ? 'El que está en combate' : 'Marca los 2 que están en combate'}>
          <input type={singles ? 'radio' : 'checkbox'} name={`active-${side}`} checked={isActive} onChange={() => toggleActive(side as 0 | 1, i)} />
          {isActive ? '⚔️ En combate' : 'Reserva'}{fainted && ' · 💀 debilitado'}
        </label>
        <div className="slot-head">
          {valid ? <Sprite species={species!} size={isActive ? 56 : 40} /> : <div className="sprite-fallback" style={{ width: 48, height: 48 }}>—</div>}
          <div className="slot-pick">
            {side === 0 ? (
              <select value={mineIdx[i]} onChange={(e) => setMineIdx(mineIdx.map((x, j) => (j === i ? Number(e.target.value) : x)))}>
                <option value={-1}>(vacío)</option>
                {team.map((t, k) => <option key={k} value={k} disabled={mineIdx.includes(k) && mineIdx[i] !== k}>{speciesEs(t.species)}</option>)}
              </select>
            ) : (
              <div className="row">
                <SpeciesSelect
                  value={species ?? ''} format={format} placeholder="Pokémon rival…"
                  exclude={theirs.map((x, j) => (j !== i ? x.set?.species ?? '' : '')).filter(Boolean)}
                  onChange={(sp) => set({ set: foeSetFor(sp), mega: false })}
                />
                <button className="small-btn" onClick={() => setEditingFoe(i)} disabled={!valid} title="Ver o cambiar su set (por defecto, el más usado del meta)">Set</button>
              </div>
            )}
            {valid && <Types species={species!} />}
          </div>
        </div>
        {valid && (
          <>
            <div className="row small hp-row">
              <span className="hp-label">{fainted ? '💀 0%' : `PS ${sl.hp}%`}</span>
              <input type="range" min={0} max={100} value={sl.hp} onChange={(e) => set({ hp: Number(e.target.value) })} />
              {fainted
                ? <button className="small-btn" onClick={() => set({ hp: 100, status: '' })} title="Volver a ponerlo con toda la vida">↺ 100%</button>
                : <button className="small-btn ko-btn" onClick={() => set({ hp: 0, status: '' })} title="Marcar como debilitado (0 PS)">💀 Debilitado</button>}
            </div>
            <HpBar pct={sl.hp} />
            {fainted ? (
              <div className="fainted-note small">Debilitado: no se tiene en cuenta para atacar, cambiar ni en las tablas.</div>
            ) : <>
            <div className="row small wrap">
              <select value={sl.status} onChange={(e) => set({ status: e.target.value as Status })}>
                {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {isActive && sl.set && canMega(sl.set) && (
                <label><input type="checkbox" checked={sl.mega} onChange={(e) => set({ mega: e.target.checked })} /> Ya es Mega</label>
              )}
              {isActive && <label title="Fake Out / First Impression solo funcionan el primer turno"><input type="checkbox" checked={sl.fresh} onChange={(e) => set({ fresh: e.target.checked })} /> Recién salido</label>}
            </div>
            {isActive && (
              <div className="boosts">
                {(['atk', 'def', 'spa', 'spd', 'spe'] as const).map((k) => (
                  <label key={k}>{STAT_ES[k]}
                    <select value={sl.boosts[k]} onChange={(e) => set({ boosts: { ...sl.boosts, [k]: Number(e.target.value) } })}>
                      {[-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n > 0 ? `+${n}` : n}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
            </>}
          </>
        )}
      </div>
    );
  };

  const sideIdx = Array.from({ length: N }, (_, i) => i);

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Asistente de turno · {FORMAT_ES[format]}</h2>
          <p className="muted">
            {singles
              ? 'Individuales: elige los 3 Pokémon que llevas y los 3 del rival, y marca cuál está en combate. Te digo si atacar o cambiar, con el daño exacto de Champions.'
              : 'Dobles: cada uno lleva 4 de sus 6 Pokémon. Marca los 2 que están en combate de cada lado (los otros 2 quedan en reserva para cambiar). Te digo qué ataque usar con cada uno y contra quién, con el daño exacto de Champions.'}
          </p>
        </div>
      </div>

      <div className={singles ? 'field-grid' : 'field-grid doubles-field'}>
        <div className="side-box mine">
          <h3>{singles ? 'Tus 3 Pokémon' : 'Tus 4 Pokémon'} <span className="muted small">· te quedan {alive(0)}{!singles && ` · en combate ${actives[0].length}/${onField}`}</span></h3>
          <div className={singles ? 'slots slots-3' : 'slots slots-4'}>{sideIdx.map((i) => slotEditor(0, i))}</div>
        </div>
        <div className="side-box foe">
          <h3>{singles ? 'Los 3 del rival' : 'Los 4 del rival'} <span className="muted small">· le quedan {alive(1)}{!singles && ` · en combate ${actives[1].length}/${onField}`}</span></h3>
          <div className={singles ? 'slots slots-3' : 'slots slots-4'}>{sideIdx.map((i) => slotEditor(1, i))}</div>
        </div>
      </div>
      {!singles && (actives[0].length < 2 || actives[1].length < 2) && (
        <p className="notice small">Marca <b>2 Pokémon «En combate»</b> en cada lado (salvo que a alguien solo le quede uno).</p>
      )}

      <div className="panel field-controls">
        <label>Clima
          <select value={weather} onChange={(e) => setWeather(e.target.value as Weather)}>
            <option value="">Ninguno</option><option value="Sun">Sol</option><option value="Rain">Lluvia</option>
            <option value="Sand">Arena</option><option value="Snow">Nieve</option>
          </select>
        </label>
        <label>Campo
          <select value={terrain} onChange={(e) => setTerrain(e.target.value as Terrain)}>
            <option value="">Ninguno</option><option value="Grassy">Hierba</option><option value="Psychic">Psíquico</option>
            <option value="Electric">Eléctrico</option><option value="Misty">Niebla</option>
          </select>
        </label>
        <label><input type="checkbox" checked={trickRoom} onChange={(e) => setTrickRoom(e.target.checked)} /> Espacio Raro</label>
        <label><input type="checkbox" checked={tw[0]} onChange={(e) => setTw([e.target.checked, tw[1]])} /> Tu Viento Afín</label>
        <label><input type="checkbox" checked={tw[1]} onChange={(e) => setTw([tw[0], e.target.checked])} /> Viento Afín rival</label>
        {[0, 1].map((side) => (
          <label key={side}>{side === 0 ? 'Tus pantallas' : 'Pantallas rivales'}
            <select value={screens[side]} onChange={(e) => setScreens(side === 0 ? [e.target.value, screens[1]] : [screens[0], e.target.value])}>
              <option value="">Ninguna</option><option value="reflect">Reflejo</option><option value="lightScreen">Pantalla Luz</option><option value="auroraVeil">Velo Aurora</option>
            </select>
          </label>
        ))}
      </div>

      <section className="panel">
        <h3>🧠 Recomendación</h3>
        {alive(0) === 0 && <div className="errors">No te quedan Pokémon: el combate está perdido.</div>}
        {alive(1) === 0 && <div className="good-msg">Al rival no le quedan Pokémon: ¡has ganado!</div>}
        {myMons.some(Boolean) && !foesAlive && alive(1) > 0 && (
          <p className="notice small">El rival tiene que sacar otro Pokémon antes de seguir. Mira abajo a quién es probable que saque.</p>
        )}
        {plan && (
          <div className="plan-line">
            🔮 <b>Jugada recomendada {singles ? '' : 'para los dos'} (mirando un turno adelante)</b>
            <span className={plan.value >= plan.now ? 'up' : 'down'}> · ventaja {Math.round(plan.now)} → {Math.round(plan.value)}</span>
            <div className="plan-actions">
              {plan.actions.map((a, i) => myMons[i] && a && (
                <div key={i} className="plan-action">
                  <Sprite species={myMons[i]!.species} size={36} />
                  <b>{speciesEs(myMons[i]!.species)}</b>
                  <span>→ {plan.labels[i]}{a.type === 'move' && a.mega ? ' + Megaevolucionar' : ''}</span>
                </div>
              ))}
            </div>
            <div className="muted small">Simula el turno contra la mejor respuesta del rival y valora cómo quedaríais (PS, Pokémon vivos, mejoras y estados).</div>
          </div>
        )}
        {brief && <DoublesBriefView brief={brief} />}
        <div className={singles ? 'advice-grid single' : 'advice-grid'}>
          {slotsN.map((slot) => {
            const raw = rawActive(0, slot);
            return raw?.fainted ? <ReplaceBox key={`r${slot}`} who={raw.species} opts={myReplace} mine /> : null;
          })}
          {myMons.map((m, i) => m && foesAlive && (
            <div key={i} className="advice">
              <div className="advice-head"><Sprite species={m.species} size={40} /><b>{speciesEs(m.species)}</b></div>
              {advice[i].map((o, k) => (
                <div key={k} className={`option${k === 0 ? ' best' : ''}${o.action.type === 'switch' ? ' switch-opt' : ''}`}>
                  <div className="option-head">
                    <span>{k === 0 ? '★ ' : ''}{o.action.type === 'switch' ? '🔄 ' : ''}{o.label}{o.action.type === 'move' && o.action.mega ? ' + Megaevolucionar' : ''}</span>
                    <span className="score">{Math.round(o.score)}</span>
                  </div>
                  <ul className="reasons">{o.reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
              ))}
            </div>
          ))}
        </div>
        <h4>Lo que probablemente haga el rival</h4>
        <div className={singles ? 'advice-grid single' : 'advice-grid'}>
          {slotsN.map((slot) => {
            const raw = rawActive(1, slot);
            return raw?.fainted ? <ReplaceBox key={`r${slot}`} who={raw.species} opts={foeReplace} mine={false} /> : null;
          })}
          {foeMons.map((m, i) => m && myMons.some(Boolean) && (
            <div key={i} className="advice foe-advice">
              <div className="advice-head"><Sprite species={m.species} size={40} /><b>{speciesEs(m.species)}</b></div>
              {foeAdvice[i].map((o, k) => (
                <div key={k} className="option">
                  <div className="option-head"><span>{o.action.type === 'switch' ? '🔄 ' : ''}{o.label}</span><span className="score">{Math.round(o.score)}</span></div>
                  <ul className="reasons">{o.reasons.slice(0, 2).map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Orden de velocidad {trickRoom && <span className="muted">(Espacio Raro: los lentos primero)</span>}</h3>
        <ol className="speed-order">
          {order.map(({ mon, speed }) => (
            <li key={mon.uid} className={mon.side === 0 ? 'mine' : 'foe'}>
              <Sprite species={mon.species} size={32} /> {speciesEs(mon.species)} <span className="muted">{mon.side === 0 ? '(tuyo)' : '(rival)'}</span> <b>{speed}</b>
            </li>
          ))}
        </ol>
        <p className="muted small">No incluye prioridad (Fake Out +3, Protección +4, Velocidad Extrema +2, Bromista +1…).</p>
      </section>

      <section className="panel">
        <h3>Tabla de daños</h3>
        {singles && <p className="muted small">Tu Pokémon en combate contra los 3 del rival, y el rival en combate contra tus 3: útil para decidir a quién cambiar.</p>}
        <div className="dmg-tables">
          <DamageTable state={state} damage={damage} attackers={myMons} defenders={singles ? state.sides[1].team.filter((m) => !m.fainted) : foeMons} title="Tus ataques" />
          <DamageTable state={state} damage={damage} attackers={foeMons} defenders={singles ? state.sides[0].team.filter((m) => !m.fainted) : myMons} title="Ataques del rival (su set del meta)" />
        </div>
      </section>

      {editingFoe != null && theirs[editingFoe].set && (
        <SetEditor
          set={theirs[editingFoe].set!} format={format}
          onCancel={() => setEditingFoe(null)}
          onSave={(s) => { setTheirs(theirs.map((x, j) => (j === editingFoe ? { ...x, set: s } : x))); setEditingFoe(null); }}
        />
      )}
    </div>
  );
}

/** Pokémon en combate debilitado: a quién sacar (tú) o a quién sacará probablemente (rival). */
function ReplaceBox({ who, opts, mine }: { who: string; opts: Option[]; mine: boolean }) {
  return (
    <div className={`advice replace-box${mine ? '' : ' foe-advice'}`}>
      <div className="advice-head">💀 <b>{speciesEs(who)} está debilitado</b></div>
      {opts.length === 0 ? (
        <p className="muted small">{mine ? 'No te quedan Pokémon en reserva.' : 'Al rival no le quedan Pokémon en reserva.'}</p>
      ) : (
        <>
          <div className="muted small">{mine ? 'Saca a:' : 'Probablemente sacará a:'}</div>
          {opts.map((o, k) => (
            <div key={k} className={`option${k === 0 && mine ? ' best' : ''}`}>
              <div className="option-head"><span>{k === 0 && mine ? '★ ' : ''}{o.label}</span><span className="score">{Math.round(o.score)}</span></div>
              <ul className="reasons">{o.reasons.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function DamageTable({ state, damage, attackers, defenders, title }: { state: BattleState; damage: (a: BattleMon, d: BattleMon, move: string, spread: boolean) => { minPct: number; maxPct: number }; attackers: (BattleMon | null)[]; defenders: (BattleMon | null)[]; title: string }) {
  const defs = defenders.filter((d): d is BattleMon => !!d);
  const singles = state.format === 'singles';
  return (
    <div className="dmg-table">
      <h4>{title}</h4>
      {attackers.map((a) => a && (
        <div key={a.uid} className="table-scroll">
          <table>
            <thead>
              <tr><th>{speciesEs(a.species)}</th>{defs.map((d) => <th key={d.uid}>vs {speciesEs(d.species)}</th>)}</tr>
            </thead>
            <tbody>
              {a.set.moves.filter((m) => !isStatusMove(m)).map((mv) => {
                const spread = !singles && ['spread', 'all'].includes(moveTargetKind(mv)) && defs.length > 1;
                return (
                  <tr key={mv}>
                    <td><TypeBadge type={getMove(mv)?.type ?? 'Normal'} small /> {moveLabel(mv)}{spread && <span className="muted small"> (área)</span>}</td>
                    {defs.map((d) => {
                      const r = damage(a, d, mv, spread);
                      return <td key={d.uid}><DamageBar min={r.minPct} max={r.maxPct} /></td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

const koTag = (h: { ko: 'sure' | 'chance' | null; koChance?: number }) =>
  h.ko === 'sure' ? <span className="ko-tag sure">KO seguro</span>
    : h.ko === 'chance' ? <span className="ko-tag chance">{h.koChance != null ? `${Math.round(h.koChance * 100)}% KO` : 'KO posible'}</span> : null;

function HitCell({ h }: { h: Hit }) {
  return (
    <div className="hit-cell">
      <div className="hit-move"><TypeBadge type={getMove(h.move)?.type ?? 'Normal'} small /> {moveLabel(h.move)}{h.spread && <span className="muted small"> (área)</span>}</div>
      <DamageBar min={h.minPct} max={h.maxPct} />
      <div className="hit-tags small">
        {koTag(h)}
        <span className={h.faster ? 'up' : 'muted'}>{h.faster ? '⚡ atacas antes' : '🐢 el rival es más rápido'}</span>
        {h.charge && <span className="down">⏳ tarda 2 turnos (necesita {h.move.startsWith('Electro') ? 'lluvia' : h.move.startsWith('Solar') ? 'sol' : 'un turno de carga'})</span>}
      </div>
    </div>
  );
}

/** Dobles: qué ataque usar con cada uno contra cada rival, KOs entre los dos y quién está en peligro. */
function DoublesBriefView({ brief }: { brief: DoublesBrief }) {
  const foes = brief.attacks[0]?.vs.map((h) => h.target) ?? [];
  return (
    <div className="brief">
      <h4>🎯 Mejor ataque de cada uno contra cada rival</h4>
      <div className="table-scroll">
        <table className="brief-table">
          <thead>
            <tr><th>Tu Pokémon</th>{foes.map((f) => <th key={f.uid}><Sprite species={f.species} size={32} /> vs {speciesEs(f.species)} <span className="muted small">({Math.round((f.hp / f.maxHP) * 100)}% PS)</span></th>)}</tr>
          </thead>
          <tbody>
            {brief.attacks.map(({ mon, vs }) => (
              <tr key={mon.uid}>
                <td className="left"><Sprite species={mon.species} size={36} /> <b>{speciesEs(mon.species)}</b></td>
                {foes.map((f) => {
                  const h = vs.find((x) => x.target.uid === f.uid);
                  return <td key={f.uid}>{h ? <HitCell h={h} /> : <span className="muted small">sin daño</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {brief.attacks.some((a) => a.spread.length > 0) && (
        <div className="brief-spread small">
          <b>Ataques en área</b> (golpean a los dos rivales con un 25 % menos de daño):
          {brief.attacks.filter((a) => a.spread.length).map(({ mon, spread }) => {
            const byMove = [...new Set(spread.map((h) => h.move))];
            return byMove.map((mv) => (
              <div key={mon.uid + mv}>
                {speciesEs(mon.species)} · <b>{moveLabel(mv)}</b>: {spread.filter((h) => h.move === mv).map((h) => `${speciesEs(h.target.species)} ${h.minPct}–${h.maxPct}%${h.ko === 'sure' ? ' (KO)' : h.ko ? ' (puede KO)' : ''}`).join(' · ')}
              </div>
            ));
          })}
        </div>
      )}

      {brief.focus.length > 0 && (
        <>
          <h4>🤝 Si los dos atacáis al mismo rival</h4>
          <div className="focus-list">
            {brief.focus.map((f) => (
              <div key={f.target.uid} className={`focus-row${f.ko === 'sure' ? ' sure' : f.ko ? ' chance' : ''}`}>
                <Sprite species={f.target.species} size={32} />
                <div>
                  <b>{speciesEs(f.target.species)}</b> <span className="muted small">({Math.round(f.hpPct)}% PS)</span>: {' '}
                  {f.parts.map((h) => `${speciesEs(h.attacker.species)} con ${moveLabel(h.move)} (${h.minPct}–${h.maxPct}%)`).join(' + ')}
                  {' = '}<b>{Math.round(f.minPct)}–{Math.round(f.maxPct)}%</b> {koTag(f) ?? <span className="muted small">no cae</span>}
                  {f.ko && f.parts.some((h) => h.ko === 'sure') && <span className="muted small"> · con uno solo ya basta: el otro puede atacar al otro rival</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h4>⚠️ Lo que te pueden hacer</h4>
      <div className="danger-list">
        {brief.danger.map(({ mon, from, total }) => {
          const left = (mon.hp / mon.maxHP) * 100;
          const both = total >= left;
          return (
            <div key={mon.uid} className={`danger-row${from.some((h) => h.ko === 'sure') ? ' high' : both ? ' mid' : ''}`}>
              <Sprite species={mon.species} size={32} />
              <div>
                <b>{speciesEs(mon.species)}</b> <span className="muted small">({Math.round(left)}% PS)</span>
                {from.map((h) => (
                  <div key={h.attacker.uid} className="small">
                    {speciesEs(h.attacker.species)} con {moveLabel(h.move)}: {h.minPct}–{h.maxPct}% {koTag(h)} {h.faster && <span className="down">⚡ es más rápido</span>}
                  </div>
                ))}
                {from.some((h) => h.ko === 'sure')
                  ? <div className="small down">→ Corre peligro: Protección, cambiarlo o golpear antes a quien lo amenaza.</div>
                  : both ? <div className="small down">→ Si lo atacan los dos, cae: considera Protección.</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
