/** Genera src/data/es.json con los nombres oficiales en español (PokeAPI) de movimientos, habilidades, objetos y naturalezas. */
import { writeFileSync } from 'node:fs';
import { toID } from '@smogon/calc';
import { ALL_ABILITIES, ALL_ITEMS, ALL_MOVES, NATURES } from '../src/lib/dex';

const ES = 7; // id de idioma español en PokeAPI
async function q(table: string, rel: string) {
  const res = await fetch('https://beta.pokeapi.co/graphql/v1beta', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `{ r: ${table}(where:{language_id:{_eq:${ES}}}){ name ${rel}{ name } } }` }),
  });
  const j = await res.json() as { data: { r: { name: string; [k: string]: { name: string } | string }[] } };
  const map = new Map<string, string>();
  for (const row of j.data.r) map.set(toID((row[rel] as { name: string }).name), row.name);
  return map;
}

const pick = (names: string[], map: Map<string, string>) => {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const n of names) { const es = map.get(toID(n)); if (es) out[n] = es; else missing.push(n); }
  return { out, missing };
};

const moves = pick(ALL_MOVES, await q('pokemon_v2_movename', 'pokemon_v2_move'));
const abilities = pick(ALL_ABILITIES, await q('pokemon_v2_abilityname', 'pokemon_v2_ability'));
const items = pick(ALL_ITEMS, await q('pokemon_v2_itemname', 'pokemon_v2_item'));
const natures = pick(NATURES.map((n) => n.name), await q('pokemon_v2_naturename', 'pokemon_v2_nature'));
writeFileSync('src/data/es.json', JSON.stringify({ moves: moves.out, abilities: abilities.out, items: items.out, natures: natures.out }));
console.log('sin traducción → movimientos:', moves.missing.length, moves.missing.slice(0, 15).join(', '));
console.log('habilidades:', abilities.missing.join(', ') || '0', '| objetos:', items.missing.join(', ') || '0', '| naturalezas:', natures.missing.join(', ') || '0');
