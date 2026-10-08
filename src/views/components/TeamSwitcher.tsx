import type { AppController } from '../../controllers/useAppController';
import { FORMAT_ES, type Format } from '../../models/data/meta';
import { Sprite } from './common';

/** Barra para elegir entre tus equipos guardados del formato (como los equipos del juego). */
export function TeamSwitcher({ tm, format }: { tm: AppController['teamManager']; format: Format }) {
  const rename = () => {
    const name = prompt('Nombre del equipo:', tm.active.name);
    if (name != null) tm.rename(tm.active.id, name);
  };
  const remove = () => {
    if (tm.list.length < 2) return;
    if (confirm(`¿Borrar «${tm.active.name}»? Tus Pokémon siguen en tu colección.`)) tm.remove(tm.active.id);
  };
  return (
    <div className="team-switcher">
      <span className="muted small">Equipos de {FORMAT_ES[format]}:</span>
      <div className="team-tabs">
        {tm.list.map((t) => (
          <button key={t.id} className={`team-tab${t.id === tm.active.id ? ' active' : ''}`} onClick={() => tm.select(t.id)} title={t.members.map((m) => m.species).join(', ') || 'Vacío'}>
            <b>{t.name}</b>
            <span className="team-tab-mons">
              {t.members.slice(0, 6).map((m) => <Sprite key={m.species} species={m.species} size={24} />)}
              {!t.members.length && <span className="muted small">vacío</span>}
            </span>
          </button>
        ))}
      </div>
      <div className="team-switcher-actions">
        <button className="small-btn" onClick={() => tm.create(false)} title="Crear un equipo vacío">＋ Nuevo</button>
        <button className="small-btn" onClick={() => tm.create(true)} title="Copiar este equipo (mismos Pokémon y objetos)">⧉ Duplicar</button>
        <button className="small-btn" onClick={rename} title="Cambiar el nombre">✏️ Renombrar</button>
        <button className="small-btn danger" onClick={remove} disabled={tm.list.length < 2} title="Borrar este equipo">🗑</button>
      </div>
    </div>
  );
}
