/**
 * Formato de texto de Pokémon Showdown para compartir equipos:
 *
 *   Garchomp @ Life Orb
 *   Ability: Rough Skin
 *   Level: 50
 *   EVs: 2 HP / 32 Atk / 32 Spe      ← en Champions son Stat Points (máx. 32 por stat, 66 en total)
 *   Jolly Nature
 *   - Earthquake
 *
 * Al importar también se aceptan los nombres en español (habilidades, objetos, naturalezas y movimientos).
 */
import { toID } from '@smogon/calc';
import es from '../data/es.json';
import { ALL_ABILITIES, ALL_ITEMS, ALL_MOVES, ALL_SPECIES, NATURES, STATS, type StatID } from './dex';
import { emptySP, type PokemonSet } from './sets';
import { CHAMPIONS_MOVES } from './es';

const STAT_NAMES: Record<StatID, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
const STAT_FROM: Record<string, StatID> = { hp: 'hp', ps: 'hp', atk: 'atk', ata: 'atk', def: 'def', spa: 'spa', atesp: 'spa', spd: 'spd', defesp: 'spd', spe: 'spe', vel: 'spe' };

/** Un set en formato Showdown. */
export function setToShowdown(s: PokemonSet): string {
  const lines = [`${s.species}${s.item ? ` @ ${s.item}` : ''}`];
  if (s.ability) lines.push(`Ability: ${s.ability}`);
  lines.push('Level: 50');
  const sp = STATS.filter((k) => s.sp[k]).map((k) => `${s.sp[k]} ${STAT_NAMES[k]}`);
  if (sp.length) lines.push(`EVs: ${sp.join(' / ')}`);
  if (s.nature) lines.push(`${s.nature} Nature`);
  for (const m of s.moves.filter(Boolean)) lines.push(`- ${m}`);
  return lines.join('\n');
}

export const teamToShowdown = (team: PokemonSet[]) => team.map(setToShowdown).join('\n\n');

// ── Lectura: busca nombres en inglés o en español sin importar mayúsculas, tildes ni guiones ──
const D = es as { moves: Record<string, string>; abilities: Record<string, string>; items: Record<string, string>; natures: Record<string, string> };
export const key = (s: string) => toID(s.normalize('NFD').replace(/[̀-ͯ]/g, ''));
function index(names: string[], esMap: Record<string, string> = {}) {
  const m = new Map<string, string>();
  for (const n of names) {
    m.set(key(n), n);
    if (esMap[n]) m.set(key(esMap[n]), n);
  }
  return m;
}
/** Índices nombre (inglés o español, normalizado) → nombre interno; también los usa el OCR. */
export const SPECIES = index(ALL_SPECIES);
const ITEMS = index(ALL_ITEMS, D.items);
export const ABILITIES = index(ALL_ABILITIES, D.abilities);
export const MOVES = index(ALL_MOVES, { ...D.moves, ...CHAMPIONS_MOVES });
export const NATURE_IDX = index(NATURES.map((n) => n.name), D.natures);

export interface ParseResult { sets: PokemonSet[]; warnings: string[] }

/** Lee uno o varios sets en formato Showdown (separados por una línea en blanco). */
export function parseShowdown(text: string): ParseResult {
  const sets: PokemonSet[] = [];
  const warnings: string[] = [];
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    // Primera línea: "Apodo (Especie) (M) @ Objeto" o "Especie @ Objeto"
    const [head, itemRaw] = lines[0].split(/\s@\s/);
    const parens = [...head.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]).filter((p) => !/^[MF]$/.test(p.trim()));
    const speciesRaw = (parens.length ? parens[parens.length - 1] : head.replace(/\((M|F)\)/g, '')).trim();
    const species = SPECIES.get(key(speciesRaw));
    if (!species) { warnings.push(`Pokémon no reconocido: "${speciesRaw}"`); continue; }
    const set: PokemonSet = { species, ability: '', item: '', nature: 'Hardy', sp: emptySP(), moves: [] };
    if (itemRaw) {
      const item = ITEMS.get(key(itemRaw));
      if (item) set.item = item; else warnings.push(`${species}: objeto no reconocido "${itemRaw.trim()}"`);
    }
    for (const line of lines.slice(1)) {
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^(?:Ability|Habilidad):\s*(.+)$/i))) {
        const a = ABILITIES.get(key(m[1]));
        if (a) set.ability = a; else warnings.push(`${species}: habilidad no reconocida "${m[1]}"`);
      } else if ((m = line.match(/^(?:EVs|SPs|Stat Points|PEs?):\s*(.+)$/i))) {
        for (const part of m[1].split('/')) {
          const mm = part.trim().match(/^(\d+)\s+(.+)$/);
          const stat = mm && STAT_FROM[key(mm[2])];
          if (stat) set.sp[stat] = Number(mm![1]);
        }
      } else if ((m = line.match(/^(.+?)\s+(?:Nature|Naturaleza)$/i)) || (m = line.match(/^(?:Naturaleza|Nature):\s*(.+)$/i))) {
        const n = NATURE_IDX.get(key(m[1]));
        if (n) set.nature = n; else warnings.push(`${species}: naturaleza no reconocida "${m[1]}"`);
      } else if ((m = line.match(/^[-–]\s*(.+)$/))) {
        const name = m[1].replace(/\s*\[.*\]$/, '');
        const mv = MOVES.get(key(name));
        if (mv) set.moves.push(mv); else warnings.push(`${species}: movimiento no reconocido "${name}"`);
      }
      // Level, Tera Type, IVs, Shiny… se ignoran (no aplican en Champions)
    }
    // EVs de juegos clásicos (0-252): convertir a Stat Points aproximados
    const total = STATS.reduce((t, k) => t + set.sp[k], 0);
    if (total > 66 || STATS.some((k) => set.sp[k] > 32)) {
      for (const k of STATS) set.sp[k] = Math.min(32, Math.round(set.sp[k] / 8));
      warnings.push(`${species}: EVs convertidos a Stat Points (÷8)`);
    }
    // nunca más de 66 en total: se recorta lo que sobre empezando por el stat menor
    let extra = STATS.reduce((t, k) => t + set.sp[k], 0) - 66;
    for (const k of [...STATS].sort((a, b) => set.sp[a] - set.sp[b])) {
      if (extra <= 0) break;
      const cut = Math.min(set.sp[k], extra);
      set.sp[k] -= cut;
      extra -= cut;
    }
    set.moves = set.moves.slice(0, 4);
    sets.push(set);
  }
  return { sets, warnings };
}
