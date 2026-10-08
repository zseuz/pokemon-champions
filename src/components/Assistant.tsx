import { useMemo, useState } from 'react';
import { FORMAT_ES, metaEntry, metaFor, type Format } from '../data/meta';
import { evaluateOptions, rankSwitchIns, speedOrder, type Option } from '../lib/ai';
import {
  computeDamage, isStatusMove, monAt, moveTargetKind, type BattleMon, type BattleState, type Terrain, type Weather,
} from '../lib/battle';
import { getMove, getSpecies, STAT_ES } from '../lib/dex';
import { moveLabel, speciesEs } from '../lib/es';
import { canMega, defaultSet, type PokemonSet } from '../lib/sets';
import { battleMonFor, neutralState } from '../lib/teamAnalysis';
import { DamageBar, HpBar, Sprite, TypeBadge, Types } from './common';
import { SetEditor } from './SetEditor';
import { SpeciesSelect } from './SpeciesSelect';

type Status = '' | 'brn' | 'par' | 'psn' | 'tox' | 'slp';
interface SlotState {
  set: PokemonSet | null;
  hp: number;
  status: Status;
  mega: boolean;
  fresh: boolean;
  boosts: { atk: number; def: number; spa: number; spd: number; spe: number };
}
const newSlot = (set: PokemonSet | null): SlotState => ({
  set, hp: 100, status: '', mega: false, fresh: true, boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
});

const STATUS_OPTS: [Status, string][] = [['', 'Sano'], ['brn', 'Quemado'], ['par', 'Paralizado'], ['psn', 'Envenenado'], ['tox', 'Tóxico'], ['slp', 'Dormido']];

/**
 * Asistente de turno.
 * - Individuales: llevas 3 Pokémon y el rival 3; uno de cada lado en combate (1 contra 1).
 * - Dobles: 2 contra 2 (tus otros Pokémon del equipo cuentan como reserva para los cambios).
 */
export function Assistant({ team, format }: { team: PokemonSet[]; format: Format }) {
  const singles = format === 'singles';
  const N = singles ? 3 : 2;
  const [mineIdx, setMineIdx] = useState<number[]>(() => Array.from({ length: N }, (_, i) => (i < team.length ? i : -1)));
  const [mine, setMine] = useState<SlotState[]>(() => Array.from({ length: N }, () => newSlot(null)));
  const [theirs, setTheirs] = useState<SlotState[]>(() => {
    const foes = metaFor(format).filter((m) => m.set && !team.some((t) => t.species === m.species));
    return Array.from({ length: N }, (_, i) => newSlot(foes[i] ? structuredClone(foes[i].set!) : null));
  });
  const [activeMine, setActiveMine] = useState(0);
  const [activeFoe, setActiveFoe] = useState(0);
  const [weather, setWeather] = useState<'' | Weather>('');
  const [terrain, setTerrain] = useState<'' | Terrain>('');
  const [trickRoom, setTrickRoom] = useState(false);
  const [tw, setTw] = useState<[boolean, boolean]>([false, false]);
  const [screens, setScreens] = useState<[string, string]>(['', '']);
  const [editingFoe, setEditingFoe] = useState<number | null>(null);

  // los sets propios salen siempre del equipo
  const mineSlots = mine.map((s, i) => ({ ...s, set: team[mineIdx[i]] ?? null }));

  const state = useMemo<BattleState>(() => {
    const st = neutralState();
    st.format = format;
    st.trickRoom = trickRoom ? 5 : 0;
    if (weather) st.weather = { type: weather, turns: 5 };
    if (terrain) st.terrain = { type: terrain, turns: 5 };
    const build = (slots: SlotState[], side: 0 | 1, actives: number[], extraBench: PokemonSet[]) => {
      const s = st.sides[side];
      s.tailwind = tw[side] ? 3 : 0;
      if (screens[side]) s[screens[side] as 'reflect' | 'lightScreen' | 'auroraVeil'] = 3;
      const mons = slots.map((sl) => {
        if (!sl.set || !getSpecies(sl.set.species)) return null;
        const m = battleMonFor(sl.set, side, sl.mega);
        // 0 PS = debilitado: no cuenta para combatir, cambiar ni en las tablas
        m.hp = sl.hp <= 0 ? 0 : Math.max(1, Math.round((m.maxHP * sl.hp) / 100));
        if (sl.hp <= 0) m.fainted = true;
        m.status = sl.status;
        m.turnsOnField = sl.fresh ? 0 : 1;
        Object.assign(m.boosts, sl.boosts);
        if (sl.mega && m.isMega) s.megaUsed = true;
        return m;
      });
      // primero los que están en combate, luego la reserva
      const order = [...actives, ...slots.map((_, i) => i).filter((i) => !actives.includes(i))];
      const teamMons: BattleMon[] = [];
      const pos = new Map<number, number>();
      for (const i of order) if (mons[i]) { pos.set(i, teamMons.length); teamMons.push(mons[i]!); }
      s.team = [...teamMons, ...extraBench.map((b) => battleMonFor(b, side, false))];
      s.active = actives.map((i) => pos.get(i) ?? null);
    };
    if (singles) {
      build(mineSlots, 0, [activeMine], []);
      build(theirs, 1, [activeFoe], []);
    } else {
      build(mineSlots, 0, [0, 1], team.filter((_, i) => !mineIdx.includes(i)));
      build(theirs, 1, [0, 1], []);
    }
    return st;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(mineSlots), JSON.stringify(theirs), weather, terrain, trickRoom, tw, screens, team, mineIdx, activeMine, activeFoe, format]);

  const slotsN = singles ? [0] : [0, 1];
  const myMons = slotsN.map((slot) => monAt(state, { side: 0, slot }));
  const foeMons = slotsN.map((slot) => monAt(state, { side: 1, slot }));
  // Pokémon en combate aunque esté debilitado (monAt los oculta)
  const rawActive = (side: 0 | 1, slot: number): BattleMon | null => {
    const idx = state.sides[side].active[slot];
    return idx == null ? null : state.sides[side].team[idx] ?? null;
  };
  const foesAlive = foeMons.some(Boolean);
  const advice = useMemo(() => myMons.map((m) => (m && foesAlive ? evaluateOptions(state, m).slice(0, singles ? 5 : 4) : [])), [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const foeAdvice = useMemo(() => foeMons.map((m) => (m && myMons.some(Boolean) ? evaluateOptions(state, m).slice(0, singles ? 3 : 2) : [])), [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const myReplace = useMemo(() => rankSwitchIns(state, 0).slice(0, 3), [state]);
  const foeReplace = useMemo(() => rankSwitchIns(state, 1).slice(0, 3), [state]);
  const alive = (side: 0 | 1) => state.sides[side].team.filter((m) => !m.fainted).length;
  const order = useMemo(() => speedOrder(state), [state]);

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
    const isActive = !singles || (side === 0 ? activeMine : activeFoe) === i;
    const species = sl.set?.species;
    const valid = !!species && !!getSpecies(species);
    const fainted = valid && sl.hp <= 0;
    return (
      <div className={`slot${singles ? (isActive ? ' active-slot' : ' bench-slot') : ''}${fainted ? ' fainted-slot' : ''}`} key={`${side}-${i}`}>
        {singles && (
          <label className="active-pick">
            <input type="radio" name={`active-${side}`} checked={isActive} onChange={() => (side === 0 ? setActiveMine(i) : setActiveFoe(i))} />
            {isActive ? '⚔️ En combate' : 'Reserva'}{fainted && ' · 💀 debilitado'}
          </label>
        )}
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
                  onChange={(sp) => set({ set: structuredClone(metaEntry(sp, format)?.set ?? defaultSet(sp)), mega: false })}
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
              : 'Dobles: configura tus 2 Pokémon en combate y los 2 rivales. Te digo qué hacer este turno, con el daño exacto de Champions.'}
          </p>
        </div>
      </div>

      <div className="field-grid">
        <div className="side-box mine">
          <h3>{singles ? 'Tus 3 Pokémon' : 'Tus Pokémon'} <span className="muted small">· te quedan {alive(0)}</span></h3>
          <div className={singles ? 'slots slots-3' : 'slots'}>{sideIdx.map((i) => slotEditor(0, i))}</div>
        </div>
        <div className="side-box foe">
          <h3>{singles ? 'Los 3 del rival' : 'Rivales'} <span className="muted small">· le quedan {alive(1)}</span></h3>
          <div className={singles ? 'slots slots-3' : 'slots'}>{sideIdx.map((i) => slotEditor(1, i))}</div>
        </div>
      </div>

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
          <DamageTable state={state} attackers={myMons} defenders={singles ? state.sides[1].team.filter((m) => !m.fainted) : foeMons} title="Tus ataques" />
          <DamageTable state={state} attackers={foeMons} defenders={singles ? state.sides[0].team.filter((m) => !m.fainted) : myMons} title="Ataques del rival (su set del meta)" />
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

function DamageTable({ state, attackers, defenders, title }: { state: BattleState; attackers: (BattleMon | null)[]; defenders: (BattleMon | null)[]; title: string }) {
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
                      const r = computeDamage(state, a, d, mv, { spread });
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
