/** Genera src/data/learnsets.json: movimientos que puede aprender cada especie de Champions (índices sobre ALL_MOVES). */
import { Dex } from '@pkmn/dex';
import { writeFileSync } from 'node:fs';
import { ALL_MOVES, ALL_SPECIES } from '../src/lib/dex';
import { META, META_SINGLES } from '../src/data/meta';

const moveIndex = new Map(ALL_MOVES.map((m, i) => [Dex.moves.get(m).id as string, i]));

async function movesOf(name: string, seen = new Set<string>()): Promise<Set<number>> {
  const out = new Set<number>();
  const s = Dex.species.get(name);
  if (!s.exists || seen.has(s.id)) return out;
  seen.add(s.id);
  const ls = await Dex.learnsets.get(s.id);
  for (const id of Object.keys(ls?.learnset ?? {})) { const i = moveIndex.get(id); if (i != null) out.add(i); }
  // formas que heredan movimientos de la base (Rotom-Wash, Indeedee-F…) y preevoluciones
  const parents = [s.changesFrom, !ls?.learnset ? s.baseSpecies : undefined, s.prevo].filter(Boolean) as string[];
  for (const p of parents) for (const i of await movesOf(p, seen)) out.add(i);
  return out;
}

const species: Record<string, number[]> = {};
const empty: string[] = [];
for (const name of ALL_SPECIES) {
  const set = await movesOf(name);
  // garantizar que los movimientos de los sets del meta están incluidos
  for (const e of [...META, ...META_SINGLES]) if (e.species === name && e.set) for (const m of e.set.moves) { const i = ALL_MOVES.indexOf(m); if (i >= 0) set.add(i); }
  if (!set.size) empty.push(name);
  species[name] = [...set].sort((a, b) => a - b);
}
writeFileSync('src/data/learnsets.json', JSON.stringify({ moves: ALL_MOVES, species }));
console.log('especies', Object.keys(species).length, 'sin movimientos:', empty.join(', ') || 'ninguna');
