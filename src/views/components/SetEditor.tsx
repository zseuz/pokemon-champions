import { useSetEditorController } from '../../controllers/useSetEditorController';
import { ALL_ABILITIES, ALL_ITEMS, ALL_MOVES, ALL_SPECIES, getMove, STAT_ES, STATS } from '../../models/domain/dex';
import { SP_MAX_STAT, SP_MAX_TOTAL, type PokemonSet } from '../../models/domain/sets';
import { FORMAT_ES, type Format } from '../../models/data/meta';
import { Sprite, TypeBadge, Types } from './common';
import { Picker } from './Picker';
import { abilityDesc, abilityName, legalAbilities } from '../../models/domain/abilities';
import { itemName } from '../format';
import { moveLabel } from '../../models/domain/es';
import { BuildPanel, MatchupPanel } from './Insight';


export function SetEditor({ set, onSave, onCancel, format = 'doubles', team = [] }: {
  set: PokemonSet; onSave: (s: PokemonSet) => void; onCancel: () => void; format?: Format; team?: PokemonSet[];
}) {
  const { s, setS, errors, stats, total, meta, upd, validSpecies, tab, setTab, natureLabel, natureOptions, learn, moveOptions, abilityOptions, itemOptions } = useSetEditorController(set, format, team);
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
