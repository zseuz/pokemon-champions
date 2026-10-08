/** Controlador de la vista BuildPanel: estado y lógica, sin interfaz. */
import { useMemo } from 'react';
import { type Format } from '../models/data/meta';
import { abilityName } from '../models/domain/abilities';
import { recommendBuild } from '../models/analysis/build';
import { STAT_ES, STATS } from '../models/domain/dex';
import { itemName } from '../models/analysis/items';
import { finalStats, type PokemonSet } from '../models/domain/sets';

export const spText = (s: PokemonSet) => STATS.filter((k) => s.sp[k]).map((k) => `${s.sp[k]} ${STAT_ES[k]}`).join(' / ') || '—';

export function useBuildController(set: PokemonSet, format: Format, team: PokemonSet[]) {
  const build = useMemo(() => recommendBuild(set.species, format, team), [set.species, format, team]);
  // ordenar los movimientos recomendados para que coincidan fila a fila con los del set actual
  const rec = useMemo(() => {
    const pending = [...build.set.moves];
    const ordered: string[] = [];
    set.moves.forEach((m, i) => { const k = pending.indexOf(m); if (k >= 0) { ordered[i] = m; pending.splice(k, 1); } });
    for (let i = 0; i < build.set.moves.length; i++) if (!ordered[i]) ordered[i] = pending.shift()!;
    return { ...build.set, moves: ordered.filter(Boolean) };
  }, [build, set.moves]);
  const stats = finalStats(rec, true);
  const rows: { label: string; current: string; recommended: string; meta?: string; reasons: string[] }[] = [
    ...rec.moves.map((m, i) => ({
      label: `Movimiento ${i + 1}`, current: set.moves[i] ?? '—', recommended: m, meta: build.metaSet?.moves[i],
      reasons: build.parts.find((p) => p.value === m)?.reasons ?? [],
    })),
    { label: 'Habilidad', current: abilityName(set.ability), recommended: abilityName(rec.ability), meta: build.metaSet && abilityName(build.metaSet.ability), reasons: build.parts.find((p) => p.label === 'Habilidad')!.reasons },
    { label: 'Objeto', current: set.item ? itemName(set.item) : '—', recommended: rec.item ? itemName(rec.item) : '—', meta: build.metaSet && itemName(build.metaSet.item), reasons: build.parts.find((p) => p.label === 'Objeto')!.reasons },
    { label: 'Naturaleza', current: set.nature, recommended: rec.nature, meta: build.metaSet?.nature, reasons: build.parts.find((p) => p.label === 'Naturaleza')!.reasons },
    { label: 'Stat Points', current: spText(set), recommended: spText(rec), meta: build.metaSet && spText(build.metaSet), reasons: build.parts.find((p) => p.label === 'Stat Points')!.reasons },
  ];

  return { build, rec, stats, rows };
}
