import type { PickerOption } from './viewModels';
/** Controlador de la vista SetEditor: estado y lógica, sin interfaz. */
import { useMemo, useState } from 'react';
import { ALL_ABILITIES, ALL_ITEMS, ALL_MOVES, getMove, NATURES } from '../models/domain/dex';
import { finalStats, spTotal, validateSet, type PokemonSet } from '../models/domain/sets';
import { metaEntry, type Format } from '../models/data/meta';
import { abilityDesc, abilityName, legalAbilities, rankAbilities } from '../models/domain/abilities';
import { itemName, scoreItem } from '../models/analysis/items';
import { learnable, rankMoves } from '../models/analysis/build';
import { rankNatures } from '../models/analysis/candidates';
import { moveLabel, moveSearch, natureEs } from '../models/domain/es';

export const NATURE_ES: Record<string, string> = { atk: 'Ata', def: 'Def', spa: 'AtEsp', spd: 'DefEsp', spe: 'Vel' };

export function useSetEditorController(set: PokemonSet, format: Format, team: PokemonSet[]) {
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

  return { s, setS, errors, stats, total, meta, upd, validSpecies, tab, setTab, natureLabel, natureOptions, learn, moveOptions, mates, abilityOptions, itemOptions };
}
