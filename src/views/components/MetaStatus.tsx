import { useMetaController } from '../../controllers/useMetaController';

/** Indicador del meta en la cabecera: avisa si hay datos nuevos y permite actualizarlos. */
export function MetaStatus() {
  const { check, updating, message, update, recheck, dismiss } = useMetaController();
  const outdated = check?.outdated;
  return (
    <div className="meta-status">
      <button
        className={`meta-btn${outdated ? ' outdated' : ''}`} disabled={updating}
        onClick={outdated ? update : recheck}
        title={outdated ? 'Hay datos nuevos en pokechamp.gg: pulsa para actualizar' : 'Comprobar si hay datos nuevos del meta'}
      >
        {updating ? '⏳ Actualizando…' : outdated ? (check?.newSeason ? '🆕 ¡Temporada nueva! Actualizar meta' : '🔄 Meta nuevo disponible') : '🔄 Meta'}
      </button>
      {message && (
        <div className="meta-msg" onClick={dismiss} title="Cerrar">{message} ✕</div>
      )}
    </div>
  );
}
