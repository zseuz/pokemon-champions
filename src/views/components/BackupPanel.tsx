import { useRef, useState } from 'react';
import type { AppController } from '../../controllers/useAppController';
import { backupFileName } from '../../models/repository/backup';
import { copyText, downloadText } from '../download';

/** Panel de copia de seguridad (JSON) e importación / exportación en formato Showdown. */
export function BackupPanel({ backup, formatName }: { backup: AppController['backup']; formatName: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [toTeam, setToTeam] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; warnings?: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<'replace' | 'merge'>('merge');

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const mode = modeRef.current;
      if (mode === 'replace' && !confirm('Esto SUSTITUYE tu colección, equipos y objetos por los de la copia. ¿Continuar?')) return;
      setMsg({ ok: true, text: backup.importAll(await f.text(), mode) });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section className="panel backup">
      <button className="backup-toggle" onClick={() => setOpen(!open)}>
        💾 Copia de seguridad · Showdown <span className="muted small">{open ? '▴' : '▾ exportar e importar tu colección y equipos'}</span>
      </button>
      {open && (
        <div className="backup-body">
          <div className="backup-col">
            <h4>Copia completa (.json)</h4>
            <p className="muted small">Colección, equipos de los dos formatos, objetos y formato elegido. Guárdala o pásala a otro PC.</p>
            <div className="row wrap">
              <button className="primary" onClick={() => { downloadText(backupFileName(), JSON.stringify(backup.exportAll(), null, 2)); setMsg({ ok: true, text: 'Copia descargada.' }); }}>⬇ Exportar copia</button>
              <button onClick={() => { modeRef.current = 'merge'; fileRef.current?.click(); }} title="Añade los Pokémon y objetos que no tengas; tus sets se mantienen">⬆ Importar y combinar</button>
              <button className="danger" onClick={() => { modeRef.current = 'replace'; fileRef.current?.click(); }} title="Sustituye todo por la copia">⬆ Restaurar copia</button>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
          </div>
          <div className="backup-col">
            <h4>Formato Showdown</h4>
            <p className="muted small">Copia tu equipo de {formatName} como texto, o pega sets de Showdown (también con nombres en español).</p>
            <div className="row wrap">
              <button onClick={async () => { const t = backup.exportTeamText(); setText(t); const ok = await copyText(t); setMsg({ ok: true, text: ok ? 'Equipo copiado al portapapeles.' : 'Equipo listo abajo para copiar.' }); }}>📋 Exportar mi equipo</button>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={'Garchomp @ Life Orb\nAbility: Rough Skin\nEVs: 2 HP / 32 Atk / 32 Spe\nJolly Nature\n- Earthquake\n- Dragon Claw'} />
            <div className="row wrap">
              <label className="row small"><input type="checkbox" checked={toTeam} onChange={(e) => setToTeam(e.target.checked)} /> Añadir también al equipo de {formatName}</label>
              <button className="primary" disabled={!text.trim()} onClick={() => { const r = backup.importText(text, toTeam); setMsg({ ok: r.warnings.length === 0, text: r.message, warnings: r.warnings }); }}>Importar texto</button>
            </div>
          </div>
          {msg && (
            <div className={msg.ok ? 'good-msg' : 'errors'}>
              {msg.text}
              {msg.warnings && msg.warnings.length > 0 && <ul className="small">{msg.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
