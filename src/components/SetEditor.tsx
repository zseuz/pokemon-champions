import { useMemo, useState } from 'react';
import { ALL_ABILITIES, ALL_ITEMS, ALL_MOVES, ALL_SPECIES, getMove, NATURES, STAT_ES, STATS } from '../lib/dex';
import { finalStats, SP_MAX_STAT, SP_MAX_TOTAL, spTotal, validateSet, type PokemonSet } from '../lib/sets';
import { FORMAT_ES, metaEntry, type Format } from '../data/meta';
import { Sprite, TypeBadge, Types } from './common';
import { Picker, type PickerOption } from './Picker';
import { abilityDesc, abilityName, legalAbilities, rankAbilities } from '../lib/abilities';
import { itemName, scoreItem } from '../lib/items';
import { learnable, rankMoves } from '../lib/build';
import { rankNatures } from '../lib/candidates';
import { moveLabel, moveSearch, natureEs } from '../lib/es';
import { BuildPanel, MatchupPanel } from './Insight';

const NATURE_ES: Record<string, string> = { atk: 'Ata', def: 'Def', spa: 'AtEsp', spd: 'DefEsp', spe: 'Vel' };

export function SetEditor({ set, onSave, onCancel, format = 'doubles', team = [] }: {
  set: PokemonSet; onSave: (s: PokemonSet) => void; onCancel: () => void; format?: Format; team?: PokemonSet[];
}) {
  const [s, setS] = useState<PokemonSet>(() => structuredClone(set));
  const errors = validateSet(s);
  const stats = errors.some((e) => e.startsWith('Especie')) ? null : finalStats(s);
  const total = spTotal(s.sp);
  const meta = metaEntry(s.species, format);

  const upd = (patch: Partial<PokemonSet>) => setS({ ...s, ...patch });
  const validSpecies = !errors.some((e) => e.startsWith('Especie'));
  const [tab, setTab] = useState<'edit' | 'build' | 'mu'>('edit');
  // Naturalezas: buscables en español/inglés o por stat ("+vel"), con la recomendada marcada
  const natureLabel = (name: string) => {
    const n = NATURES.find((x) => x.name === name);
    const mod = n?.plus && n.plus !== n.minus ? ` +${NATURE_ES[n.plus]} −${NATURE_ES[n.minus!]}` : ' (neutra)';
    return `${natureEs(name)} (${name})${mod}`;
  };
  const natureOptions = useMemo<PickerOption[]>(() => {
    if (!validSpecies) return NATURES.map((n) => ({ value: n.name, label: natureLabel(n.name), group: 'Naturalezas' }));
    const ranked = rankNatures(s);
    return ranked.map((r, i) => {
      const n = NATURES.find((x) => x.name === r.nature)!;
      const stat = (k?: string) => ({ atk: 'ataque', def: 'defensa', spa: 'ataque especial atesp', spd: 'defensa especial defesp', spe: 'velocidad vel' } as Record<string, string>)[k ?? ''] ?? '';
      return {
        value: r.nature, label: natureLabel(r.nature), score: r.pct, recommended: i === 0,
        group: r.pct >= 80 ? 'Recomendadas para este set' : r.pct >= 55 ? 'Aceptables' : 'Poco recomendables',
        detail: r.text,
        search: n.plus && n.plus !== n.minus ? `+${NATURE_ES[n.plus]} -${NATURE_ES[n.minus!]} mas ${stat(n.plus)} menos ${stat(n.minus)}` : 'neutra',
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.species, s.moves.join(), s.item, validSpecies]);
  const learn = useMemo(() => (validSpecies ? new Set(learnable(s.species)) : new Set<string>()), [s.species, validSpecies]);

  // Movimientos: para cada hueco, los que puede aprender puntuados junto a los otros 3
  const moveOptions = useMemo<PickerOption[][]>(() => [0, 1, 2, 3].map((slot) => {
    if (!validSpecies) return [];
    const others = s.moves.filter((m, i) => i !== slot && m);
    const ranked = rankMoves(s, format, others).filter((x) => !others.includes(x.move));
    const recSet = new Set(ranked.filter((x) => x.score > 0).slice(0, 6).map((x) => x.move));
    return [
      { value: '', label: '— vacío —', group: 'Recomendados para este hueco' },
      ...ranked.map((x) => {
        const isRec = recSet.has(x.move);
        const mv = getMove(x.move);
        return {
          value: x.move, label: `${moveLabel(x.move)}${mv?.basePower ? ` · ${mv.basePower}` : ''}`, search: moveSearch(x.move), score: x.score, recommended: isRec,
          group: isRec ? 'Recomendados para este hueco' : `Puede aprenderlos (${ranked.length})`,
          detail: `${mv ? `[${mv.category === 'Physical' ? 'Físico' : mv.category === 'Special' ? 'Especial' : 'Estado'}] ` : ''}${x.reasons.slice(0, 3).join(' · ')}`,
        };
      }),
      ...ALL_MOVES.filter((m) => !learn.has(m)).map((m) => ({ value: m, label: moveLabel(m), search: moveSearch(m), disabled: true, group: 'No puede aprenderlos' })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [s.species, s.moves.join(), s.ability, s.item, format, validSpecies, learn]);
  const mates = useMemo(() => team.filter((t) => t.species !== set.species), [team, set.species]);

  // Habilidades: las que puede tener (ordenadas por recomendación) y luego el resto, deshabilitadas
  const abilityOptions = useMemo<PickerOption[]>(() => {
    if (!validSpecies) return [];
    const ranked = rankAbilities(s, format, [...mates, s]);
    const legal = new Set(legalAbilities(s.species));
    return [
      ...ranked.map((a, i) => ({
        value: a.ability, label: abilityName(a.ability), score: a.score, recommended: i === 0, group: `Habilidades de ${s.species}`,
        detail: [abilityDesc(a.ability), ...a.reasons].filter(Boolean).join(' · '),
      })),
      ...ALL_ABILITIES.filter((a) => !legal.has(a)).map((a) => ({
        value: a, label: abilityName(a), disabled: true, group: 'Otras habilidades (este Pokémon no puede tenerlas)', detail: abilityDesc(a),
      })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.species, s.item, s.moves.join(), format, mates, validSpecies]);

  // Objetos: todos, puntuados para este set; los 5 mejores se marcan como recomendados
  const itemOptions = useMemo<PickerOption[]>(() => {
    if (!validSpecies) return [];
    const scored = ALL_ITEMS.map((it) => scoreItem(s, it, [...mates, s], format)).sort((a, b) => b.score - a.score);
    const usedByMates = new Set(mates.map((m) => m.item).filter(Boolean));
    return [
      { value: '', label: '— Sin objeto —', group: 'Recomendados para este set' },
      ...scored.map((x, i) => {
        const rec = i < 5 && x.score > 0;
        return {
          value: x.item, label: itemName(x.item), score: x.score, recommended: rec,
          group: rec ? 'Recomendados para este set' : x.score > 0 ? 'Útiles' : 'Poco útiles para este Pokémon',
          detail: x.reason + (usedByMates.has(x.item) ? ' · ⚠ ya lo lleva otro miembro del equipo' : ''),
        };
      }),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.species, s.ability, s.moves.join(), s.nature, format, mates, validSpecies]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="seg small editor-tabs">
          <button className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}>✏️ Editar</button>
          <button className={tab === 'build' ? 'active' : ''} disabled={!validSpecies} onClick={() => setTab('build')}>🛠 Build recomendado</button>
          <button className={tab === 'mu' ? 'active' : ''} disabled={!validSpecies} onClick={() => setTab('mu')}>⚔️ Fuerte / Débil</button>
        </div>
        {tab === 'edit' && <div className="editor-head">
          <Sprite species={s.species} size={80} />
          <div>
            <input
              className="species-input" list="dl-species" value={s.species}
              onChange={(e) => upd({ species: e.target.value })}
            />
            <div><Types species={s.species} /></div>
            {meta?.set && (
              <button className="link" onClick={() => setS(structuredClone(meta.set!))}>
                Usar set del meta ({FORMAT_ES[format]})
              </button>
            )}
          </div>
        </div>}

        {tab === 'build' && validSpecies && <BuildPanel set={s} format={format} team={team} onApply={(b) => { setS(b); setTab('edit'); }} />}
        {tab === 'mu' && validSpecies && <MatchupPanel set={s} format={format} />}
        {tab === 'edit' && <div className="editor-cols">
        <section className="editor-col">
          <h4>Set</h4>
          <label>Habilidad
            <Picker value={s.ability} options={abilityOptions} display={s.ability ? abilityName(s.ability) : undefined} onChange={(v) => upd({ ability: v })} placeholder="Elegir habilidad" />
            {s.ability && <span className="field-help">{abilityDesc(s.ability)}{validSpecies && !legalAbilities(s.species).includes(s.ability) && <b className="bad"> · {s.species} no puede tener esta habilidad</b>}</span>}
          </label>
          <label>Objeto
            <Picker value={s.item} options={itemOptions} display={s.item ? itemName(s.item) : undefined} onChange={(v) => upd({ item: v })} placeholder="Sin objeto" />
            {s.item && <span className="field-help">{itemOptions.find((o) => o.value === s.item)?.detail}</span>}
          </label>
          <label>Naturaleza
            <Picker value={s.nature} options={natureOptions} display={natureLabel(s.nature)} onChange={(v) => upd({ nature: v })} placeholder="Elegir naturaleza" />
            {validSpecies && <span className="field-help">{natureOptions.find((o) => o.value === s.nature)?.detail}</span>}
          </label>
        </section>

        <section className="editor-col">
        <h4>Movimientos</h4>
        <div className="moves-col">
          {[0, 1, 2, 3].map((i) => {
            const mv = getMove(s.moves[i] ?? '');
            return (
              <div key={i} className="move-slot">
                <div className="move-input">
                  <span className="move-num">{i + 1}</span>
                  <Picker
                    value={s.moves[i] ?? ''} options={moveOptions[i]} placeholder={`Movimiento ${i + 1}`} display={s.moves[i] ? moveLabel(s.moves[i]) : undefined}
                    onChange={(v) => {
                      const moves = [...s.moves];
                      while (moves.length < i) moves.push('');
                      moves[i] = v;
                      upd({ moves });
                    }}
                  />
                  {mv && <TypeBadge type={mv.type} small />}
                </div>
                {mv && <span className="field-help">{mv.category === 'Status' || !mv.basePower ? 'Estado' : `${mv.category === 'Physical' ? 'Físico' : 'Especial'} · ${mv.basePower}`}{validSpecies && !learn.has(mv.name) && <b className="bad"> · no puede aprenderlo</b>}</span>}
              </div>
            );
          })}
        </div>
        </section>

        <section className="editor-col">
        <h4>Stat Points <span className={total > SP_MAX_TOTAL ? 'bad' : 'muted'}>{total}/{SP_MAX_TOTAL}</span></h4>
        <div className="sp-grid">
          {STATS.map((st) => (
            <div key={st} className="sp-row">
              <span className="sp-label">{STAT_ES[st]}</span>
              <input
                type="range" min={0} max={SP_MAX_STAT} value={s.sp[st]}
                onChange={(e) => upd({ sp: { ...s.sp, [st]: Number(e.target.value) } })}
              />
              <input
                type="number" min={0} max={SP_MAX_STAT} value={s.sp[st]} className="sp-num"
                onChange={(e) => upd({ sp: { ...s.sp, [st]: Math.max(0, Math.min(SP_MAX_STAT, Number(e.target.value) || 0)) } })}
              />
              <span className="sp-final">{stats ? stats[st] : '–'}</span>
            </div>
          ))}
        </div>

        </section>
      </div>}


        {errors.length > 0 && <div className="errors">{errors.map((e) => <div key={e}>⚠ {e}</div>)}</div>}
        <div className="modal-actions">
          <button onClick={onCancel}>Cancelar</button>
          <button
            className="primary" disabled={errors.length > 0}
            onClick={() => onSave({ ...s, moves: s.moves.filter(Boolean) })}
          >Guardar</button>
        </div>
      </div>
    </div>
  );
}

/** Listas para autocompletar (se montan una vez en App). */
export function DataLists() {
  return (
    <>
      <datalist id="dl-species">{ALL_SPECIES.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dl-moves">{ALL_MOVES.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dl-items">{ALL_ITEMS.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dl-abilities">{ALL_ABILITIES.map((x) => <option key={x} value={x} />)}</datalist>
    </>
  );
}
