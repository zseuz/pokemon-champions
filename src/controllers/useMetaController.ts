/**
 * Controlador del meta: al abrir la app comprueba (como mucho cada 6 h) si pokechamp.gg tiene datos
 * más nuevos y permite actualizarlos con un botón.
 */
import { useEffect, useState } from 'react';
import { checkMeta, updateMeta, type MetaCheck } from '../models/repository/metaApi';

const LAST_CHECK = 'pkmn-champions-meta-check';
const EVERY = 6 * 60 * 60 * 1000;

export function useMetaController() {
  const [check, setCheck] = useState<MetaCheck | null>(null);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const runCheck = async (force = false) => {
    const last = Number(localStorage.getItem(LAST_CHECK) ?? 0);
    if (!force && Date.now() - last < EVERY) return;
    const c = await checkMeta();
    if (c) { setCheck(c); localStorage.setItem(LAST_CHECK, String(Date.now())); }
    if (force) setMessage(c?.error ?? (c?.outdated ? 'Hay datos nuevos del meta.' : 'El meta ya está al día.'));
  };

  // comprobación en segundo plano al abrir la app (no bloquea el primer render)
  useEffect(() => {
    const t = setTimeout(() => { void runCheck(); }, 1500);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Descarga el meta nuevo; al terminar, la app se recarga sola con los datos nuevos. */
  const update = async () => {
    setUpdating(true);
    setMessage('Descargando el meta de pokechamp.gg…');
    const r = await updateMeta();
    setUpdating(false);
    setMessage(r.ok ? `Meta actualizado. ${r.log.filter((l) => /Individuales|Dobles/.test(l)).join(' · ')}` : `Error: ${r.error ?? 'no se pudo actualizar'}`);
    if (r.ok) setCheck((c) => (c ? { ...c, outdated: false, newSeason: false } : c));
  };

  return { check, updating, message, update, recheck: () => runCheck(true), dismiss: () => setMessage(null) };
}
