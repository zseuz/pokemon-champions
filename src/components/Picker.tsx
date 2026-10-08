import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { normalize } from '../lib/es';

export interface PickerOption {
  value: string;
  label: string;
  /** explicación corta (por qué se recomienda / qué hace) */
  detail?: string;
  score?: number;
  recommended?: boolean;
  disabled?: boolean;
  group: string;
  /** texto extra para buscar (p. ej. nombre en español) */
  search?: string;
}

/** Desplegable con buscador que agrupa opciones y resalta las recomendadas. */
export function Picker({ value, options, onChange, placeholder, display }: {
  value: string;
  options: PickerOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  display?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({});

  // El desplegable flota sobre la pantalla (position: fixed) para no quedar cortado dentro del editor:
  // se abre hacia abajo si cabe y, si no, hacia arriba.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      const width = Math.min(Math.max(b.width, 360), window.innerWidth - 16);
      const left = Math.max(8, Math.min(b.left, window.innerWidth - width - 8));
      const below = window.innerHeight - b.bottom - 12;
      const above = b.top - 12;
      const up = below < 300 && above > below;
      const maxHeight = Math.min(440, Math.max(180, up ? above : below));
      setPos(up
        ? { position: 'fixed', left, width, right: 'auto', top: 'auto', bottom: window.innerHeight - b.top + 4, maxHeight }
        : { position: 'fixed', left, width, right: 'auto', bottom: 'auto', top: b.bottom + 4, maxHeight });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const groups = useMemo(() => {
    const needle = normalize(q.trim());
    const filtered = options.filter((o) => !needle || normalize(`${o.label} ${o.value} ${o.search ?? ''}`).includes(needle));
    const map = new Map<string, PickerOption[]>();
    for (const o of filtered) map.set(o.group, [...(map.get(o.group) ?? []), o]);
    return [...map.entries()];
  }, [options, q]);

  const current = options.find((o) => o.value === value);

  return (
    <div className="picker-field" ref={ref}>
      <button ref={btnRef} type="button" className="picker-btn" onClick={() => { setOpen(!open); setQ(''); }}>
        <span className={value ? '' : 'muted'}>{display ?? current?.label ?? (value || placeholder || 'Elegir…')}</span>
        {current?.recommended && <span className="star" title="Recomendado">★</span>}
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="picker-pop" style={pos}>
          <input autoFocus placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="picker-list">
            {groups.length === 0 && <div className="muted small picker-empty">Sin resultados</div>}
            {groups.map(([group, opts]) => (
              <div key={group}>
                <div className="picker-group">{group}</div>
                {opts.map((o) => (
                  <button
                    key={o.value} type="button" disabled={o.disabled}
                    className={`picker-opt${o.value === value ? ' selected' : ''}${o.recommended ? ' rec' : ''}`}
                    onClick={() => { onChange(o.value); setOpen(false); }}
                  >
                    <span className="picker-opt-main">
                      {o.recommended && <span className="star">★</span>}
                      <b>{o.label}</b>
                      {o.score != null && !o.disabled && <span className="picker-score">{Math.round(o.score)}</span>}
                    </span>
                    {o.detail && <span className="picker-detail">{o.detail}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
