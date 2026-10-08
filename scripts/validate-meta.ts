import { META, META_SINGLES } from '../src/data/meta';
import { getSpecies, getMove, getItem, gen, megaForme } from '../src/lib/dex';
import { validateSet } from '../src/lib/sets';
import { toID } from '@smogon/calc';

let bad = 0;
for (const [fmt, list] of [['dobles', META], ['individuales', META_SINGLES]] as const) {
  const seen = new Set<string>();
  for (const m of list) {
    if (seen.has(m.species)) { console.log(fmt, 'DUPLICADO', m.species); bad++; }
    seen.add(m.species);
    if (!getSpecies(m.species)) { console.log(fmt, 'SPECIES', m.species); bad++; }
    const s = m.set;
    if (!s) continue;
    for (const e of validateSet(s)) { console.log(fmt, m.species, e); bad++; }
    if (!gen.abilities.get(toID(s.ability))) { console.log(fmt, 'ABILITY', m.species, s.ability); bad++; }
    if (s.item && !getItem(s.item)) { console.log(fmt, 'ITEM', m.species, s.item); bad++; }
    for (const mv of s.moves) if (!getMove(mv)) { console.log(fmt, 'MOVE', m.species, mv); bad++; }
    if (/ite( [XYZ])?$/.test(s.item) && !megaForme(s.species, s.item)) console.log(fmt, 'aviso: megapiedra que no le corresponde', m.species, s.item);
  }
}
console.log(bad ? `${bad} problemas` : 'OK');
