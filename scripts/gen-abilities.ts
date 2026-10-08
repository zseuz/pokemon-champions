/** Genera src/models/data/abilities.json: habilidades legales de cada especie de Champions + descripción corta. */
import { Dex } from '@pkmn/dex';
import { writeFileSync } from 'node:fs';
import { ALL_SPECIES, ALL_ABILITIES } from '../src/models/domain/dex';

const species: Record<string, string[]> = {};
const missing: string[] = [];
for (const name of ALL_SPECIES) {
  const s = Dex.species.get(name);
  if (!s.exists) { missing.push(name); continue; }
  species[name] = [...new Set(Object.values(s.abilities))].filter((a) => ALL_ABILITIES.includes(a));
}
const desc: Record<string, string> = {};
for (const a of ALL_ABILITIES) {
  const d = Dex.abilities.get(a);
  if (d.exists) desc[a] = d.shortDesc;
}
writeFileSync('src/models/data/abilities.json', JSON.stringify({ species, desc }));
console.log('especies', Object.keys(species).length, 'sin datos:', missing.join(', ') || 'ninguna');
