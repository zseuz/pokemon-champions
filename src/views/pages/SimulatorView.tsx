import { useEffect, useMemo, useRef } from 'react';
import { useBattleController } from '../../controllers/useBattleController';
import { useSimulatorController } from '../../controllers/useSimulatorController';
import type { BattleRecord } from '../../models/analysis/history';
import { useActionPickerController } from '../../controllers/useActionPickerController';
import { type Action, type BattleMon, type BattleState } from '../../models/engine/battle';
import { STAT_ES } from '../../models/domain/dex';
import { effectiveSpecies, type PokemonSet } from '../../models/domain/sets';
import { HpBar, Sprite, TypeBadge, Types } from '../components/common';

const STATUS_ES: Record<string, string> = { brn: 'QUE', par: 'PAR', psn: 'ENV', tox: 'TOX', slp: 'DOR' };

export function Simulator({ team, onFinish }: { team: PokemonSet[]; onFinish?: (b: BattleRecord) => void }) {
  const { recordEnd, rival, picks, togglePick, newRival, battle, setBattle, difficulty, setDifficulty, start, exit, rematch } = useSimulatorController(team, onFinish);

  if (team.length < 4) {
    return <div className="empty-state">Necesitas al menos 4 Pokémon en <b>Mi equipo</b> para simular combates (se eligen 4 de 6, como en VGC).</div>;
  }

  if (!battle) {
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
            <h3>Equipo rival <button className="small-btn" onClick={newRival}>🎲 Otro</button></h3>
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
      battle={battle} setBattle={(b) => { setBattle(b); recordEnd(b); }} difficulty={difficulty}
      onExit={exit}
      onRematch={rematch}
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
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [battle.log.length]);

  const { choices, setChoice, hint, mine, foes, ready, megaClaimed, submit, showHint, applyHint, replaceSlots, replacements, replace } =
    useBattleController(battle, setBattle, difficulty);
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
                  {replacements.map((b) => (
                    <button key={b.i} className="bench-btn" onClick={() => replace(slot, b.i)}>
                      <Sprite species={b.species} size={40} /> {b.species} ({b.hpPct}%)
                    </button>
                  ))}
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
                  onChange={(a) => setChoice(i, a)}
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
  const { mega, setMega, canMega, selectedMove, moves, pickMove, needsTarget, targets, pickTarget, chosenTarget, chosenLabel, bench, switchTo } =
    useActionPickerController(battle, mon, choice, onChange, megaBlocked, otherSwitch);

  return (
    <div className="picker">
      <div className="picker-head">
        <b>{mon.species}</b>
        {canMega && (
          <label className="mega-toggle">
            <input type="checkbox" checked={mega} onChange={(e) => setMega(e.target.checked)} /> Megaevolucionar
          </label>
        )}
        {choice && <span className="chosen">✔ {chosenLabel}</span>}
      </div>
      <div className="move-buttons">
        {moves.map((m) => (
          <button key={m.move} className={`move-btn${selectedMove === m.move ? ' selected' : ''}${m.dimmed ? ' dim' : ''}`} onClick={() => pickMove(m.move)}>
            <TypeBadge type={m.type} small />
            <span>{m.label}</span>
            <span className="muted small">{m.power || ''}{m.spread ? ' · área' : ''}</span>
          </button>
        ))}
      </div>
      {needsTarget && (
        <div className="targets">
          Objetivo:
          {targets.map(({ t, name, ally }) => (
            <button key={`${t.side}${t.slot}`} className={ally ? 'ally-target' : ''} onClick={() => pickTarget(t)}>
              {name}{ally ? ' (aliado)' : ''}
            </button>
          ))}
        </div>
      )}
      {chosenTarget && (
        <div className="small muted">→ {chosenTarget} <button className="link" onClick={() => pickTarget(undefined)}>cambiar</button></div>
      )}
      {bench.length > 0 && (
        <div className="switches">
          Cambiar a:
          {bench.map((b) => (
            <button key={b.i} className={choice?.type === 'switch' && choice.to === b.i ? 'selected' : ''} onClick={() => switchTo(b.i)}>
              <Sprite species={b.species} size={24} /> {b.species} {b.hpPct}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
