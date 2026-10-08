import { useState } from 'react';
import { useOcrController } from '../../controllers/useOcrController';
import { abilityName } from '../../models/domain/abilities';
import { STATS, STAT_ES } from '../../models/domain/dex';
import { moveEs, natureEs, speciesEs } from '../../models/domain/es';
import type { PokemonSet } from '../../models/domain/sets';
import { Sprite } from './common';

/** Añadir candidatos leyendo una captura de pantalla de la selección del juego. */
export function OcrImport({ onAdd }: { onAdd: (sets: PokemonSet[]) => void }) {
  const { status, progress, step, text, setText, result, selected, toggle, error, preview, read, interpret, add, reset } = useOcrController(onAdd);
  const [showText, setShowText] = useState(false);
  const busy = status === 'loading' || status === 'reading';

  return (
    <div className="ocr">
      <div className="row wrap">
        <label className={`file-btn${busy ? ' disabled' : ''}`}>
          📷 Leer captura…
          <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={(e) => { void read([...(e.target.files ?? [])]); e.target.value = ''; }} />
        </label>
        <span className="muted small">o pega una imagen con <kbd>Ctrl</kbd>+<kbd>V</kbd>. Funciona mejor recortando cada tarjeta del Pokémon (puedes subir varias).</span>
      </div>

      {busy && (
        <div className="ocr-progress">
          {status === 'loading' ? 'Cargando el lector de texto (la primera vez descarga ~15 MB)…' : `Leyendo la captura (pasada ${step} de 2)… ${progress}%`}
          <div className="usage-bar"><div style={{ width: `${status === 'loading' ? 5 : progress}%` }} /></div>
        </div>
      )}
      {error && <div className="errors">{error}</div>}

      {result && status === 'done' && (
        <div className="ocr-result">
          <div className="ocr-previews">{preview.map((p) => <img key={p} src={p} alt="captura" />)}</div>
          <h4>He reconocido {result.sets.length} candidato{result.sets.length === 1 ? '' : 's'}: revisa y desmarca los que sobren</h4>
          <div className="ocr-cands">
            {result.sets.map((s, i) => (
              <label key={i} className={`ocr-cand${selected.includes(i) ? ' on' : ''}`}>
                <input type="checkbox" checked={selected.includes(i)} onChange={() => toggle(i)} />
                <Sprite species={s.species} size={48} />
                <div>
                  <b>{speciesEs(s.species)}</b> <span className="muted small">· {abilityName(s.ability)} · {natureEs(s.nature)}</span>
                  <div className="small">{s.moves.map(moveEs).join(' · ') || <span className="muted">sin movimientos</span>}</div>
                  <div className="small muted">Stat Points: {STATS.filter((k) => s.sp[k]).map((k) => `${STAT_ES[k]} ${s.sp[k]}`).join(' · ') || 'sin leer'}</div>
                </div>
              </label>
            ))}
          </div>
          {result.warnings.length > 0 && <ul className="warn-list small">{result.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
          <div className="row wrap">
            <button className="primary" disabled={!selected.length} onClick={add}>Añadir {selected.length} a la selección</button>
            <button onClick={() => setShowText(!showText)}>{showText ? 'Ocultar' : 'Ver / corregir'} texto leído</button>
            <button onClick={reset}>Descartar</button>
          </div>
          {showText && (
            <div className="ocr-text">
              <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} />
              <button onClick={() => interpret(text)}>🔁 Volver a interpretar</button>
            </div>
          )}
          <p className="muted small">Después podrás completar lo que falte (Stat Points, movimientos) pulsando cada candidato.</p>
        </div>
      )}
    </div>
  );
}
