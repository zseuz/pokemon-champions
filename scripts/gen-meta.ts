/**
 * Descarga de pokechamp.gg el meta COMPLETO de Pokémon Champions (individuales y dobles):
 * - tier list (S → F, los 262 Pokémon del ladder) con puesto y tendencia;
 * - leaderboard con el set más usado de cada Pokémon (habilidad, objeto, naturaleza, Stat Points, movimientos y %).
 * Genera src/models/data/pokechamp.json. Uso: npm run gen:meta
 */
import { writeFileSync } from 'node:fs';
import { toID } from '@smogon/calc';
import { ALL_SPECIES, getItem, getMove, gen, NATURES } from '../src/models/domain/dex';

const BASE = 'https://pokechamp.gg';
const UA = { 'User-Agent': 'Mozilla/5.0 (Champions Coach; uso personal)' };

async function page(path: string) {
  const r = await fetch(BASE + path, { headers: UA });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.text();
}

const unescape = (s: string) => s.replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/’|�/g, "'").trim();
const strip = (s: string) => unescape(s.replace(/<!--.*?-->/gs, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));

/** "Hisuian Zoroark" → "Zoroark-Hisui", "Wash Rotom" → "Rotom-Wash", etc. (validado contra la lista de la app) */
const SPECIES_IDS = new Map(ALL_SPECIES.map((s) => [toID(s), s]));
function toSpecies(name: string): string | null {
  let n = name;
  let m: RegExpMatchArray | null;
  const special: Record<string, string> = {
    Aegislash: 'Aegislash-Shield', Floette: 'Floette-Eternal', 'Eternal Floette': 'Floette-Eternal',
    'Basculegion (Male)': 'Basculegion', 'Indeedee (Male)': 'Indeedee', 'Meowstic (Male)': 'Meowstic',
    'Gourgeist (Jumbo Variety)': 'Gourgeist-Super', 'Gourgeist (Average Variety)': 'Gourgeist',
  };
  if (special[n]) n = special[n];
  else if ((m = n.match(/^(Hisuian|Alolan|Galarian|Paldean) (.+?)(?: \((.+?)(?: Breed)?\))?$/))) {
    const reg = { Hisuian: 'Hisui', Alolan: 'Alola', Galarian: 'Galar', Paldean: 'Paldea' }[m[1]]!;
    n = `${m[2]}-${reg}${m[3] ? '-' + m[3] : m[1] === 'Paldean' ? '-Combat' : ''}`;
  } else if ((m = n.match(/^(Wash|Heat|Frost|Fan|Mow) Rotom$/))) n = `Rotom-${m[1]}`;
  else if ((m = n.match(/^(.+) \(Female\)$/))) n = `${m[1]}-F`;
  else if ((m = n.match(/^(.+) \((.+?)(?: Variety| Plumage)?\)$/))) n = `${m[1]}-${m[2]}`;
  return SPECIES_IDS.get(toID(n)) ?? null;
}

interface Pct { name: string; pct: number }
export interface Row {
  rank: number; name: string; species: string; tier: string; trend?: string;
  ability?: Pct; item?: Pct; nature?: Pct; spread?: { sp: Record<string, number>; pct: number }; moves: Pct[];
}

function parseTiers(html: string) {
  const out = new Map<string, { tier: string; rank: number; trend: string }>();
  const parts = html.split(/class="bg-tier-([a-z])\b/).slice(1);
  for (let i = 0; i < parts.length; i += 2) {
    const tier = parts[i].toUpperCase();
    const body = parts[i + 1];
    const re = /alt="([^"]+)"[\s\S]*?text-fg-subdued">#(\d+)<\/span>[\s\S]*?text-fg-muted">([\s\S]*?)<\/div>/g;
    let m;
    while ((m = re.exec(body))) out.set(unescape(m[1]), { tier, rank: Number(m[2]), trend: strip(m[3]) });
  }
  return out;
}

const pctOf = (cell: string): Pct[] => {
  const res: Pct[] = [];
  const re = /tabular-nums[^>]*>\s*(\d+)%\s*<\/span>([\s\S]*?)<\/span>/g;
  let m;
  while ((m = re.exec(cell))) res.push({ pct: Number(m[1]), name: strip(m[2]) });
  return res;
};

const STAT_KEY: Record<string, string> = { HP: 'hp', Atk: 'atk', Def: 'def', SpA: 'spa', SpD: 'spd', Spe: 'spe' };

function parseLeaderboard(html: string) {
  const rows = new Map<string, Omit<Row, 'tier' | 'trend' | 'species'>>();
  for (const tr of html.split('<tr').slice(1)) {
    const cells = tr.split('<td').slice(1);
    if (cells.length < 7) continue;
    const rank = Number(strip(cells[0].replace(/^[^>]*>/, '')));
    const name = unescape(cells[1].match(/alt="([^"]+)"/)?.[1] ?? '');
    if (!rank || !name) continue;
    const [ability] = pctOf(cells[2]);
    const [item] = pctOf(cells[3]);
    const [nature] = pctOf(cells[4]);
    const [spreadRaw] = pctOf(cells[5]);
    const moves = pctOf(cells[6]);
    let spread: Row['spread'];
    if (spreadRaw) {
      const sp: Record<string, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      for (const part of spreadRaw.name.split('/')) {
        const mm = part.trim().match(/^(\d+)\s+(\w+)$/);
        if (mm && STAT_KEY[mm[2]]) sp[STAT_KEY[mm[2]]] = Number(mm[1]);
      }
      spread = { sp, pct: spreadRaw.pct };
    }
    rows.set(name, { rank, name, ability, item, nature, spread, moves });
  }
  return rows;
}

const natureNames = new Set(NATURES.map((n) => n.name));
const warnings: string[] = [];

async function format(fmt: 'singles' | 'doubles') {
  const [tierHtml, lbHtml] = await Promise.all([page(`/tier-list/${fmt}/pokemon`), page(`/leaderboard/${fmt}/pokemon`)]);
  const updated = tierHtml.match(/Last updated:\s*(?:<!--.*?-->)?\s*([A-Z][a-z]+ \d{1,2}, \d{4})/)?.[1] ?? '';
  const season = strip(tierHtml.match(/(Season \d+ \(Current\))/)?.[1] ?? '');
  const tiers = parseTiers(tierHtml);
  const lb = parseLeaderboard(lbHtml);
  const rows: Row[] = [];
  for (const [name, t] of tiers) {
    const species = toSpecies(name);
    if (!species) { warnings.push(`${fmt}: especie no reconocida "${name}"`); continue; }
    const l = lb.get(name);
    const row: Row = { rank: t.rank, name, species, tier: t.tier, trend: t.trend, moves: [] };
    if (l) {
      if (l.ability && gen.abilities.get(toID(l.ability.name))) row.ability = l.ability;
      if (l.item && getItem(l.item.name)) row.item = l.item;
      else if (l.item) warnings.push(`${fmt}: objeto desconocido "${l.item.name}" (${name})`);
      if (l.nature && natureNames.has(l.nature.name)) row.nature = l.nature;
      row.spread = l.spread;
      row.moves = l.moves.filter((m) => { const ok = !!getMove(m.name); if (!ok) warnings.push(`${fmt}: movimiento desconocido "${m.name}" (${name})`); return ok; });
    }
    rows.push(row);
  }
  rows.sort((a, b) => a.rank - b.rank);
  return { updated, season, count: rows.length, withSets: rows.filter((r) => r.moves.length).length, rows };
}

const singles = await format('singles');
const doubles = await format('doubles');
writeFileSync('src/models/data/pokechamp.json', JSON.stringify({ source: BASE, fetched: new Date().toISOString().slice(0, 10), singles, doubles }));
console.log(`Individuales: ${singles.count} Pokémon (${singles.withSets} con set) · ${singles.season} · actualizado ${singles.updated}`);
console.log(`Dobles: ${doubles.count} Pokémon (${doubles.withSets} con set) · ${doubles.season} · actualizado ${doubles.updated}`);
if (warnings.length) console.log('Avisos:\n  ' + warnings.join('\n  '));
