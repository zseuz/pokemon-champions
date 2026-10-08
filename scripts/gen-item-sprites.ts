/**
 * Genera src/models/data/itemSprites.json: posición de cada objeto de Champions en la hoja de iconos
 * de Pokémon Showdown (itemicons-sheet.png, iconos de 24×24, 16 por fila).
 */
import { writeFileSync } from 'node:fs';
import { ALL_ITEMS } from '../src/models/domain/dex';

const src = await (await fetch('https://play.pokemonshowdown.com/data/items.js')).text();
const exp: { BattleItems?: Record<string, { spritenum?: number }> } = {};
new Function('exports', src)(exp);
const items = exp.BattleItems ?? {};
const id = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const out: Record<string, number> = {};
const missing: string[] = [];
for (const name of ALL_ITEMS) {
  const n = items[id(name)]?.spritenum;
  if (n == null) missing.push(name); else out[name] = n;
}
writeFileSync('src/models/data/itemSprites.json', JSON.stringify(out));
console.log(`${Object.keys(out).length} objetos con icono; sin icono: ${missing.length}`, missing.join(', '));
