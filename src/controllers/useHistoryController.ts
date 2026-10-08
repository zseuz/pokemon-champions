/** Controlador del historial: formulario para apuntar un combate, filtros y estadísticas. */
import { useMemo, useState } from 'react';
import type { Format } from '../models/data/meta';
import type { PokemonSet } from '../models/domain/sets';
import { historyStats, newBattle, type BattleRecord, type BattleResult } from '../models/analysis/history';

export type SourceFilter = 'all' | 'real' | 'sim';

export function useHistoryController(format: Format, history: BattleRecord[], team: PokemonSet[], addBattle: (b: BattleRecord) => void) {
  // formulario
  const [mine, setMine] = useState<string[]>(() => team.map((t) => t.species));
  const [rival, setRival] = useState<string[]>(['']);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  // filtros
  const [source, setSource] = useState<SourceFilter>('all');

  const toggleMine = (sp: string) => setMine(mine.includes(sp) ? mine.filter((x) => x !== sp) : [...mine, sp].slice(0, 6));
  const setRivalAt = (i: number, sp: string) => {
    const next = [...rival];
    next[i] = sp;
    // siempre un hueco vacío al final para añadir otro (máx. 6)
    if (next.every(Boolean) && next.length < 6) next.push('');
    setRival(next);
  };
  const removeRival = (i: number) => setRival(rival.filter((_, j) => j !== i).concat(rival.length === 1 ? [''] : []));
  const canSave = mine.length > 0 && rival.some(Boolean);

  /** Guarda el combate con el resultado indicado y deja el formulario listo para el siguiente. */
  const save = (result: BattleResult) => {
    if (!canSave) return;
    addBattle(newBattle({ format, source: 'real', result, mine, rival: rival.filter(Boolean), notes: notes.trim() || undefined }));
    setRival(['']);
    setNotes('');
    setSaved(result === 'win' ? '🏆 Victoria guardada' : result === 'loss' ? '💀 Derrota guardada' : 'Empate guardado');
  };

  const filtered = useMemo(
    () => history.filter((b) => b.format === format && (source === 'all' || b.source === source)).sort((a, b) => b.date.localeCompare(a.date)),
    [history, format, source],
  );
  const stats = useMemo(() => historyStats(history, format, source === 'all' ? undefined : source), [history, format, source]);

  return { mine, toggleMine, rival, setRivalAt, removeRival, notes, setNotes, canSave, save, saved, source, setSource, filtered, stats };
}
