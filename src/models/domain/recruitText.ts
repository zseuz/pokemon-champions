/**
 * Interpreta el texto reconocido (OCR) de una captura de la selección de reclutamiento:
 * busca Pokémon, habilidades, movimientos, naturalezas y Stat Points (en español o inglés),
 * tolerando pequeños errores de lectura, y los agrupa en candidatos.
 */
import { META, META_SINGLES } from '../data/meta';
import { legalAbilities } from './abilities';
import { STATS, type StatID } from './dex';
import { ABILITIES, MOVES, NATURE_IDX, SPECIES, key } from './showdown';
import { emptySP, type PokemonSet } from './sets';

type Kind = 'species' | 'ability' | 'move' | 'nature';

// Para corregir errores solo se compara con los Pokémon de Champions (menos falsos positivos)
const ROSTER = new Map([...META, ...META_SINGLES].map((m) => [key(m.species), m.species]));

/** Distancia de edición (Levenshtein) con corte temprano. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Errores tolerados según la longitud: nombres cortos deben leerse exactos. */
const tolerance = (len: number) => (len >= 11 ? 2 : len >= 5 ? 1 : 0);

function fuzzy(idx: Map<string, string>, k: string): string | undefined {
  const exact = idx.get(k);
  if (exact) return exact;
  const tol = tolerance(k.length);
  if (!tol) return undefined;
  let best: string | undefined;
  let bestD = tol + 1;
  for (const [name, value] of idx) {
    const d = editDistance(k, name, tol);
    if (d < bestD) { bestD = d; best = value; }
  }
  return best;
}

const LOOKUP: [Kind, Map<string, string>][] = [['species', ROSTER], ['ability', ABILITIES], ['move', MOVES]];

const STAT_WORDS: [RegExp, StatID][] = [
  [/\b(?:ps|hp)\b/, 'hp'], [/\b(?:at(?:aque)?|atk)\b(?!\s*esp)/, 'atk'], [/\bdef(?:ensa)?\b(?!\s*esp)/, 'def'],
  [/\b(?:at(?:aque)?\s*esp(?:ecial)?|spa)\b/, 'spa'], [/\b(?:def(?:ensa)?\s*esp(?:ecial)?|spd)\b/, 'spd'], [/\b(?:vel(?:ocidad)?|spe)\b/, 'spe'],
];

export interface Found { kind: Kind; value: string; text: string }

/** Busca nombres conocidos en una línea, probando grupos de 3, 2 y 1 palabras. */
export function scanLine(line: string): Found[] {
  const words = line.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const used = new Array(words.length).fill(false);
  const out: (Found & { at: number })[] = [];
  // naturaleza: solo si la línea es la naturaleza (o "Naturaleza X"), para no confundir palabras sueltas
  const whole = words.filter((w) => w !== 'naturaleza' && w !== 'nature').join('');
  const nature = whole.length >= 4 ? fuzzy(NATURE_IDX, whole) : undefined;
  if (nature && words.length <= 3) return [{ kind: 'nature', value: nature, text: line }];
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      if (used.slice(i, i + n).some(Boolean)) continue;
      const k = words.slice(i, i + n).join('');
      if (k.length < 3) continue;
      for (const [kind, idx] of LOOKUP) {
        // Pokémon fuera de Champions solo con el nombre exacto; movimientos/habilidades cortos sin corrección
        const v = kind === 'species' ? fuzzy(idx, k) ?? SPECIES.get(k) : idx.get(k) ?? (k.length >= 6 ? fuzzy(idx, k) : undefined);
        if (v) {
          out.push({ kind, value: v, text: words.slice(i, i + n).join(' '), at: i });
          used.fill(true, i, i + n);
          break;
        }
      }
    }
  }
  return out.sort((a, b) => a.at - b.at).map(({ kind, value, text }) => ({ kind, value, text }));
}

export interface RecruitParse {
  sets: PokemonSet[];
  /** avisos para revisar a mano */
  warnings: string[];
}

/** Agrupa lo encontrado en candidatos: cada Pokémon empieza uno nuevo y lo que sigue se le asigna. */
export function parseRecruitText(text: string): RecruitParse {
  const sets: PokemonSet[] = [];
  const warnings: string[] = [];
  let cur: PokemonSet | null = null;
  // lo leído antes del primer Pokémon (p. ej. si el nombre está debajo) se guarda para el siguiente
  let pending: Found[] = [];

  const apply = (s: PokemonSet, f: Found) => {
    if (f.kind === 'ability') {
      const legal = legalAbilities(s.species);
      if (legal.length && !legal.includes(f.value)) { warnings.push(`${s.species}: "${f.value}" no es una habilidad suya; revísala`); return; }
      s.ability = f.value;
    } else if (f.kind === 'move') {
      if (s.moves.includes(f.value)) return;
      if (s.moves.length >= 4) { warnings.push(`${s.species}: más de 4 movimientos leídos (se ignora ${f.value})`); return; }
      s.moves.push(f.value);
    } else if (f.kind === 'nature') s.nature = f.value;
  };

  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // Stat Points: "Ataque 32", "Vel. +12"…
    const low = line.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const num = low.match(/(\d{1,2})\s*$/);
    const stat = num && STAT_WORDS.find(([re]) => re.test(low))?.[1];
    if (cur && stat && Number(num![1]) <= 32) { cur.sp[stat] = Number(num![1]); continue; }

    for (const f of scanLine(line)) {
      if (f.kind === 'species') {
        // el mismo Pokémon repetido en líneas seguidas (nombre + especie) no crea otro candidato
        if (cur && cur.species === f.value && cur.moves.length === 0 && !pending.length) continue;
        cur = { species: f.value, ability: '', item: '', nature: 'Hardy', sp: emptySP(), moves: [] };
        sets.push(cur);
        for (const p of pending) apply(cur, p);
        pending = [];
      } else if (cur) apply(cur, f);
      else pending.push(f);
    }
  }

  for (const s of sets) {
    if (!s.ability) s.ability = legalAbilities(s.species)[0] ?? '';
    if (s.moves.length < 4) warnings.push(`${s.species}: solo se leyeron ${s.moves.length} movimientos; completa el resto`);
    const total = STATS.reduce((t, k) => t + s.sp[k], 0);
    if (total > 66) { warnings.push(`${s.species}: los Stat Points leídos suman ${total} (máx. 66); revísalos`); s.sp = emptySP(); }
  }
  if (!sets.length) warnings.push('No se reconoció ningún Pokémon. Prueba con una captura más nítida o recortada a una sola tarjeta.');
  return { sets, warnings };
}
