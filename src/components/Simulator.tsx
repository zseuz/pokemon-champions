import { useEffect, useMemo, useRef, useState } from 'react';
import { metaTop, metaWeight } from '../data/meta';
import { chooseActions, evaluateOptions, type Option } from '../lib/ai';
import {
  benchOf, canMegaNow, createBattle, legalMoves, legalTargets, monAt, moveTargetKind, needsReplacement,
  replaceFainted, resolveTurn, type Action, type BattleMon, type BattleState, type SideActions,
} from '../lib/battle';
import { getMove, STAT_ES } from '../lib/dex';
import { effectiveSpecies, type PokemonSet } from '../lib/sets';
import { HpBar, Sprite, TypeBadge, Types } from './common';

// equipos rivales con los 60 más usados de dobles
const metaSets = metaTop('doubles', 60).filter((m) => m.set);

/** Equipo rival aleatorio del meta: ponderado por uso, sin especies ni objetos repetidos y con máx. 1 Mega. */
function randomMetaTeam(n = 6): PokemonSet[] {
  const pool = [...metaSets];
  const team: PokemonSet[] = [];
  let hasMega = false;
  while (team.length < n && pool.length) {
    const total = pool.reduce((t, e) => t + metaWeight(e), 0);
    let r = Math.random() * total;
    const idx = pool.findIndex((e) => (r -= metaWeight(e)) <= 0);
    const [e] = pool.splice(idx < 0 ? 0 : idx, 1);
    const isMega = effectiveSpecies(e.set!, true) !== e.set!.species;
    if ((isMega && hasMega) || team.some((t) => t.item === e.set!.item)) continue;
    hasMega ||= isMega;
    team.push(structuredClone(e.set!));
  }
  return team;
}

const STATUS_ES: Record<string, string> = { brn: 'QUE', par: 'PAR', psn: 'ENV', tox: 'TOX', slp: 'DOR' };

export function Simulator({ team }: { team: PokemonSet[] }) {
  const [rival, setRival] = useState<PokemonSet[]>(() => randomMetaTeam());
  const [picks, setPicks] = useState<number[]>([0, 1, 2, 3]);
  const [rivalPicks, setRivalPicks] = useState<number[] | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [difficulty, setDifficulty] = useState(0.15);

  if (team.length < 4) {
    return <div className="empty-state">Necesitas al menos 4 Pokémon en <b>Mi equipo</b> para simular combates (se eligen 4 de 6, como en VGC).</div>;
  }

  if (!battle) {
    const togglePick = (i: number) => {
      if (picks.includes(i)) setPicks(picks.filter((x) => x !== i));
      else if (picks.length < 4) setPicks([...picks, i]);
    };
    const start = () => {
      // IA: elige sus 4 mejores contra tu equipo (los de mayor uso, con algo de azar)
      const rp = rival.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 4);
      setRivalPicks(rp);
      setBattle(createBattle(picks.map((i) => team[i]), rp.map((i) => rival[i]), ['Tú', 'Rival']));
    };
    return (
      <div>
        <div className="section-head">
          <div>
            <h2>Simulador de combate</h2>
            <p className="muted">Vista previa del equipo: elige 4 Pokémon (los 2 primeros salen de inicio). El rival usa un equipo aleatorio del meta.</p>
          </div>
          <div className="filters">
            <label>Dificultad
              <select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
                <option value={0.6}>Fácil</option><option value={0.15}>Normal</option><option value={0}>Difícil</option>
              </select>
            </label>
          </div>
        </div>
        <div className="preview-grid">
          <div className="side-box mine">
            <h3>Tu equipo <span className="muted">({picks.length}/4 elegidos)</span></h3>
            <div className="preview-list">
              {team.map((s, i) => {
                const order = picks.indexOf(i);
                return (
                  <button key={i} className={`preview-mon${order >= 0 ? ' picked' : ''}`} onClick={() => togglePick(i)}>
                    {order >= 0 && <span className="pick-num">{order < 2 ? `Inicio ${order + 1}` : `${order + 1}`}</span>}
                    <Sprite species={effectiveSpecies(s, true)} size={56} />
                    <span>{s.species}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="side-box foe">
            <h3>Equipo rival <button className="small-btn" onClick={() => setRival(randomMetaTeam())}>🎲 Otro</button></h3>
            <div className="preview-list">
              {rival.map((s, i) => (
                <div key={i} className="preview-mon">
                  <Sprite species={effectiveSpecies(s, true)} size={56} />
                  <span>{s.species}</span>
                  <Types species={s.species} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <button className="primary big" disabled={picks.length !== 4} onClick={start}>¡Combatir!</button>
      </div>
    );
  }

  return (
    <BattleView
      battle={battle} setBattle={setBattle} difficulty={difficulty}
      onExit={() => { setBattle(null); setRivalPicks(null); }}
      onRematch={() => setBattle(createBattle(picks.map((i) => team[i]), (rivalPicks ?? [0, 1, 2, 3]).map((i) => rival[i])))}
    />
  );
}

function MonPanel({ m, side }: { m: BattleMon | null; side: 0 | 1 }) {
  if (!m) return <div className="mon-panel empty">—</div>;
  const hp = (m.hp / m.maxHP) * 100;
  const boosts = (['atk', 'def', 'spa', 'spd', 'spe'] as const).filter((k) => m.boosts[k] !== 0);
  return (
    <div className={`mon-panel ${side === 0 ? 'mine' : 'foe'}`}>
      <Sprite species={m.species} size={72} />
      <div className="mon-panel-info">
        <div className="mon-name">
          {m.species} {m.status && <span className={`status s-${m.status}`}>{STATUS_ES[m.status]}</span>}
        </div>
        <Types species={m.species} />
        <HpBar pct={hp} />
        <div className="small">{side === 0 ? `${m.hp}/${m.maxHP} PS` : `${Math.round(hp)}%`} {side === 0 && m.item && <span className="muted">· {m.item}</span>}</div>
        {boosts.length > 0 && (
          <div className="small boosts-line">
            {boosts.map((k) => <span key={k} className={m.boosts[k] > 0 ? 'up' : 'down'}>{STAT_ES[k]} {m.boosts[k] > 0 ? '+' : ''}{m.boosts[k]}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

function BattleView({ battle, setBattle, difficulty, onExit, onRematch }: {
  battle: BattleState; setBattle: (b: BattleState) => void; difficulty: number; onExit: () => void; onRematch: () => void;
}) {
  const [choices, setChoices] = useState<(Action | null)[]>([null, null]);
  const [hint, setHint] = useState<Option[][] | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [battle.log.length]);

  const mine = [0, 1].map((slot) => monAt(battle, { side: 0, slot }));
  const foes = [0, 1].map((slot) => monAt(battle, { side: 1, slot }));
  const needed = mine.map((m) => !!m);
  const ready = battle.phase === 'choose' && needed.every((n, i) => {
    const c = choices[i];
    if (!n) return true;
    if (!c) return false;
    return c.type === 'switch' || moveTargetKind(c.move) !== 'foe' || !!c.target;
  });
  const megaClaimed = (i: number) => choices.some((c, j) => j !== i && c?.type === 'move' && c.mega);

  const submit = () => {
    const ai = chooseActions(battle, 1, difficulty);
    const next = resolveTurn(battle, [choices as SideActions, ai]);
    setBattle(next);
    setChoices([null, null]);
    setHint(null);
  };

  const showHint = () => setHint(mine.map((m) => (m ? evaluateOptions(battle, m).slice(0, 3) : [])));
  const applyHint = () => {
    if (!hint) return;
    let megaTaken = false;
    setChoices(hint.map((opts, i) => {
      const a = opts[0]?.action;
      if (!a || !mine[i]) return null;
      if (a.type === 'move') {
        const mega = !megaTaken && !!a.mega;
        megaTaken ||= mega;
        return { ...a, mega };
      }
      return a;
    }));
  };

  const replaceSlots = battle.phase === 'replace' ? needsReplacement(battle) : [];
  const side0 = battle.sides[0];
  const side1 = battle.sides[1];

  const fieldTags = useMemo(() => {
    const t: string[] = [];
    if (battle.weather) t.push(`${{ Sun: '☀ Sol', Rain: '🌧 Lluvia', Sand: '🌪 Arena', Snow: '❄ Nieve' }[battle.weather.type]} (${battle.weather.turns})`);
    if (battle.terrain) t.push(`${{ Grassy: '🌿 Hierba', Psychic: '🔮 Psíquico', Electric: '⚡ Eléctrico', Misty: '🌫 Niebla' }[battle.terrain.type]} (${battle.terrain.turns})`);
    if (battle.trickRoom) t.push(`🌀 Espacio Raro (${battle.trickRoom})`);
    return t;
  }, [battle]);
  const sideTags = (s: typeof side0) => [
    s.tailwind && `💨 Viento Afín (${s.tailwind})`, s.reflect && `Reflejo (${s.reflect})`,
    s.lightScreen && `Pantalla Luz (${s.lightScreen})`, s.auroraVeil && `Velo Aurora (${s.auroraVeil})`,
  ].filter(Boolean) as string[];

  return (
    <div className="battle">
      <div className="battle-top">
        <h2>Turno {battle.turn}</h2>
        <div className="tags">{fieldTags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
        <button onClick={onExit}>Salir</button>
      </div>

      <div className="arena">
        <div className="arena-side foe">
          <div className="team-dots">
            {side1.team.map((m) => <span key={m.uid} className={`dot ${m.fainted ? 'out' : ''}`} title={m.species} />)}
            {sideTags(side1).map((t) => <span key={t} className="tag">{t}</span>)}
          </div>
          <div className="arena-row">{foes.map((m, i) => <MonPanel key={i} m={m} side={1} />)}</div>
        </div>
        <div className="arena-side mine">
          <div className="arena-row">{mine.map((m, i) => <MonPanel key={i} m={m} side={0} />)}</div>
          <div className="team-dots">
            {side0.team.map((m) => <span key={m.uid} className={`dot mine ${m.fainted ? 'out' : ''}`} title={m.species} />)}
            {sideTags(side0).map((t) => <span key={t} className="tag">{t}</span>)}
          </div>
        </div>
      </div>

      <div className="battle-bottom">
        <div className="controls">
          {battle.phase === 'end' && (
            <div className={`result ${battle.winner === 0 ? 'win' : 'lose'}`}>
              <h3>{battle.winner === 0 ? '🏆 ¡Victoria!' : battle.winner === 'draw' ? 'Empate' : '💀 Derrota'}</h3>
              <button className="primary" onClick={onRematch}>Revancha</button>
              <button onClick={onExit}>Nuevo combate</button>
            </div>
          )}

          {battle.phase === 'replace' && (
            <div className="replace">
              <h3>Elige un reemplazo</h3>
              {replaceSlots.slice(0, 1).map((slot) => (
                <div key={slot} className="bench-list">
                  {benchOf(battle, 0).map((i) => {
                    const b = side0.team[i];
                    return (
                      <button key={i} className="bench-btn" onClick={() => setBattle(replaceFainted(battle, slot, i))}>
                        <Sprite species={b.species} size={40} /> {b.species} ({Math.round((b.hp / b.maxHP) * 100)}%)
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {battle.phase === 'choose' && (
            <>
              {mine.map((m, i) => m && (
                <ActionPicker
                  key={m.uid} battle={battle} mon={m} choice={choices[i]} megaBlocked={megaClaimed(i)}
                  otherSwitch={choices[1 - i]?.type === 'switch' ? (choices[1 - i] as { to: number }).to : null}
                  onChange={(a) => setChoices(choices.map((c, j) => (j === i ? a : c)))}
                />
              ))}
              <div className="row">
                <button onClick={showHint}>💡 Consejo</button>
                {hint && <button onClick={applyHint}>Aplicar consejo</button>}
                <button className="primary big" disabled={!ready} onClick={submit}>Ejecutar turno ▶</button>
              </div>
              {hint && (
                <div className="hint-box">
                  {hint.map((opts, i) => mine[i] && (
                    <div key={i}>
                      <b>{mine[i]!.species}:</b>
                      <ol>{opts.map((o, k) => <li key={k}>{o.label}{o.action.type === 'move' && o.action.mega ? ' + Mega' : ''} — <span className="muted">{o.reasons.slice(0, 2).join('; ')}</span></li>)}</ol>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="log" ref={logRef}>
          {battle.log.map((l, i) => (
            <div key={i} className={`log-${l.kind}${l.side === 1 ? ' log-foe' : l.side === 0 ? ' log-mine' : ''}`}>{l.text}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionPicker({ battle, mon, choice, onChange, megaBlocked, otherSwitch }: {
  battle: BattleState; mon: BattleMon; choice: Action | null; onChange: (a: Action | null) => void; megaBlocked: boolean; otherSwitch: number | null;
}) {
  const [mega, setMega] = useState(false);
  const canMega = canMegaNow(battle, mon) && !megaBlocked;
  const bench = benchOf(battle, 0).filter((i) => i !== otherSwitch);
  const selectedMove = choice?.type === 'move' ? choice.move : null;

  const pickMove = (mv: string) => {
    const targets = legalTargets(battle, mon, mv);
    const foeTargets = targets.filter((t) => t.side === 1);
    onChange({ type: 'move', move: mv, target: foeTargets.length === 1 ? foeTargets[0] : undefined, mega: mega && canMega });
  };

  const needsTarget = selectedMove && moveTargetKind(selectedMove) === 'foe' && choice?.type === 'move' && !choice.target;

  return (
    <div className="picker">
      <div className="picker-head">
        <b>{mon.species}</b>
        {canMega && (
          <label className="mega-toggle">
            <input type="checkbox" checked={mega} onChange={(e) => {
              setMega(e.target.checked);
              if (choice?.type === 'move') onChange({ ...choice, mega: e.target.checked });
            }} /> Megaevolucionar
          </label>
        )}
        {choice && <span className="chosen">✔ {choice.type === 'move' ? choice.move : `Cambio a ${battle.sides[0].team[choice.to].species}`}</span>}
      </div>
      <div className="move-buttons">
        {legalMoves(mon).map((mv) => {
          const info = getMove(mv);
          const first = (mv === 'Fake Out' || mv === 'First Impression') && mon.turnsOnField > 0;
          return (
            <button key={mv} className={`move-btn${selectedMove === mv ? ' selected' : ''}${first ? ' dim' : ''}`} onClick={() => pickMove(mv)}>
              <TypeBadge type={info?.type ?? 'Normal'} small />
              <span>{mv}</span>
              <span className="muted small">{info?.basePower ? info.basePower : ''}{['spread', 'all'].includes(moveTargetKind(mv)) ? ' · área' : ''}</span>
            </button>
          );
        })}
      </div>
      {needsTarget && (
        <div className="targets">
          Objetivo:
          {legalTargets(battle, mon, selectedMove!).map((t) => {
            const tm = monAt(battle, t)!;
            return (
              <button key={`${t.side}${t.slot}`} className={t.side === 0 ? 'ally-target' : ''} onClick={() => onChange({ ...(choice as Extract<Action, { type: 'move' }>), target: t })}>
                {tm.species}{t.side === 0 ? ' (aliado)' : ''}
              </button>
            );
          })}
        </div>
      )}
      {choice?.type === 'move' && choice.target && moveTargetKind(choice.move) === 'foe' && (
        <div className="small muted">→ {monAt(battle, choice.target)?.species} <button className="link" onClick={() => onChange({ ...choice, target: undefined })}>cambiar</button></div>
      )}
      {bench.length > 0 && (
        <div className="switches">
          Cambiar a:
          {bench.map((i) => {
            const b = battle.sides[0].team[i];
            return (
              <button key={i} className={choice?.type === 'switch' && choice.to === i ? 'selected' : ''} onClick={() => onChange({ type: 'switch', to: i })}>
                <Sprite species={b.species} size={24} /> {b.species} {Math.round((b.hp / b.maxHP) * 100)}%
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
