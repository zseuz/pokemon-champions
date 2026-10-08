/**
 * Interpreta el texto reconocido (OCR) de una captura de la selección de reclutamiento:
 * busca Pokémon, habilidades, movimientos, naturalezas y Stat Points (en español o inglés),
 * tolerando pequeños errores de lectura, y los agrupa en candidatos.
 * Acepta varias lecturas de la misma imagen (con distinto preprocesado) y las fusiona.
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

/**
 * Palabras de la interfaz del juego que nunca deben «corregirse» a un nombre parecido
 * (p. ej. «Ability» está a una letra de «Agility»).
 */
const UI_WORDS = new Set([
  'moves', 'move', 'ability', 'abilities', 'stat', 'stats', 'alignment', 'attack', 'defense', 'speed', 'level', 'nature',
  'movimientos', 'habilidad', 'ataque', 'defensa', 'velocidad', 'naturaleza', 'nivel', 'water', 'fire', 'grass',
]);

function fuzzy(idx: Map<string, string>, k: string): string | undefined {
  const exact = idx.get(k);
  if (exact) return exact;
  if (UI_WORDS.has(k)) return undefined;
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

/** Etiquetas de la fila de naturaleza («Stat Alignment: Bold»); se quitan antes de buscar la naturaleza. */
const NATURE_LABEL = new Set([
  'naturaleza', 'nature', 'stat', 'stats', 'alignment', 'alineacion', 'variacion', 'de', 'del', 'caracteristicas', 'estadisticas',
]);

/**
 * Nombre de cada estadística en inglés y español (también abreviado, como lo muestra el juego).
 * El orden importa: «Sp. Atk» debe probarse antes que «Atk».
 */
const STAT_WORDS: [RegExp, StatID][] = [
  [/\bsp\s*(?:atk|attack|a)\b|\bspa\b|\bat\w*\s*esp\w*|\batesp\b/, 'spa'],
  [/\bsp\s*(?:def|defense|d)\b|\bspd\b|\bdef\w*\s*esp\w*|\bdefesp\b/, 'spd'],
  [/\b(?:hp|ps)\b/, 'hp'],
  [/\b(?:attack|atk|ataque|ata)\b/, 'atk'],
  [/\b(?:defense|defence|defensa|def)\b/, 'def'],
  [/\b(?:speed|spe|velocidad|vel)\b/, 'spe'],
];

/** Palabras de estadística y cuánto se parece una lectura dudosa («Del» → «Def»). */
const STAT_LABELS = ['attack', 'atk', 'defense', 'defence', 'def', 'speed', 'ataque', 'defensa', 'velocidad'];
const canonLabel = (t: string) => (t.length >= 3 && STAT_LABELS.find((w) => w.length >= 3 && editDistance(t, w, 1) <= 1 && (w.length > 3 || editDistance(t, w, 1) === 1 && t.length === 3))) || t;

/**
 * Lee una fila de estadística del juego («Defense 167 32»): qué estadística es y sus Stat Points.
 * `sp` es null si la fila no trae el número (se leyó mal o está en la línea siguiente).
 * Devuelve null si la línea no es una fila de estadística.
 */
export function parseStatRow(line: string): { stat: StatID; sp: number | null } | null {
  const plain = line.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // etiquetas mal leídas («Sp. Del» → «Sp. Def»); los números se conservan tal cual
  const label = plain.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map((t) => (/^\d+$/.test(t) ? t : canonLabel(t))).join(' ');
  const stat = STAT_WORDS.find(([re]) => re.test(label))?.[1];
  if (!stat) return null;
  // números de la fila; «3?» (cifra dudosa) cuenta como número desconocido para no inventar un valor
  const nums: { v: number | null; digits: number }[] = [];
  for (const raw of plain.split(/\s+/).filter(Boolean)) {
    const t = raw.replace(/^[^a-z0-9?]+|[^a-z0-9?]+$/g, '');
    if (/^\d+$/.test(t)) nums.push({ v: Number(t), digits: t.length });
    else if (/^[\d?]+$/.test(t) && /\d/.test(t) && t.includes('?')) nums.push({ v: null, digits: t.length });
    else if (t === 'o') nums.push({ v: 0, digits: 1 });
  }
  if (!nums.length) return { stat, sp: null };
  // con un solo número: son los Stat Points si caben (≤ 32); si no, es la estadística final sin sus puntos
  if (nums.length === 1) return { stat, sp: nums[0].v != null && nums[0].v <= 32 ? nums[0].v : null };
  // con varios: el primero de 2+ cifras es la estadística final y los Stat Points son el primer número que le sigue
  const base = Math.max(0, nums.findIndex((n) => n.digits >= 2));
  const next = nums[base + 1];
  return { stat, sp: next && next.v != null && next.v <= 32 ? next.v : null };
}

export interface Found { kind: Kind; value: string; text: string }

/** Busca nombres conocidos en una línea, probando grupos de 3, 2 y 1 palabras. */
export function scanLine(line: string): Found[] {
  const words = line.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const used = new Array(words.length).fill(false);
  const out: (Found & { at: number })[] = [];
  // naturaleza: solo si la línea es la naturaleza (con o sin etiqueta), para no confundir palabras sueltas
  const rest = words.filter((w) => !NATURE_LABEL.has(w) && !/^\d+$/.test(w));
  const whole = rest.join('');
  const nature = whole.length >= 4 && rest.length === 1 ? fuzzy(NATURE_IDX, whole) : undefined;
  if (nature && words.some((w) => NATURE_LABEL.has(w) || words.length === 1)) return [{ kind: 'nature', value: nature, text: line }];
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      if (used.slice(i, i + n).some(Boolean)) continue;
      const k = words.slice(i, i + n).join('');
      if (k.length < 3) continue;
      for (const [kind, idx] of LOOKUP) {
        // Pokémon fuera de Champions solo con el nombre exacto; movimientos/habilidades cortos sin corrección
        const v = kind === 'species' ? fuzzy(idx, k) ?? SPECIES.get(k) : idx.get(k) ?? (k.length >= 7 ? fuzzy(idx, k) : undefined);
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

/** Candidato en construcción: qué datos se leyeron de verdad (y cuáles son valores por defecto). */
interface Draft {
  set: PokemonSet;
  hasAbility: boolean;
  hasNature: boolean;
  sp: Partial<Record<StatID, number>>;
}

const newDraft = (species: string): Draft => ({
  set: { species, ability: '', item: '', nature: 'Hardy', sp: emptySP(), moves: [] },
  hasAbility: false, hasNature: false, sp: {},
});

/** Una lectura: cada Pokémon empieza un candidato y lo que sigue se le asigna. */
function parseOne(text: string, warnings: string[]): Draft[] {
  const drafts: Draft[] = [];
  let cur: Draft | null = null;
  // lo leído antes del primer Pokémon (p. ej. si el nombre está debajo) se guarda para el siguiente
  let pending: Found[] = [];
  const pendingSP: Partial<Record<StatID, number>> = {};
  let lastStat: StatID | null = null;

  const apply = (d: Draft, f: Found) => {
    const s = d.set;
    if (f.kind === 'ability') {
      const legal = legalAbilities(s.species);
      if (legal.length && !legal.includes(f.value)) { warnings.push(`${s.species}: «${f.value}» no es una habilidad suya; revísala`); return; }
      s.ability = f.value; d.hasAbility = true;
    } else if (f.kind === 'move') {
      if (s.moves.includes(f.value)) return;
      if (s.moves.length >= 4) { warnings.push(`${s.species}: más de 4 movimientos leídos (se ignora ${f.value})`); return; }
      s.moves.push(f.value);
    } else if (f.kind === 'nature') { s.nature = f.value; d.hasNature = true; }
  };

  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // una fila de estadística no puede ser a la vez un movimiento (p. ej. «Speed Swap 10»)
    const row = scanLine(line).some((f) => f.kind === 'move') ? null : parseStatRow(line);
    if (row) {
      if (row.sp != null) { if (cur) cur.sp[row.stat] = row.sp; else pendingSP[row.stat] = row.sp; }
      // el número de la fila a veces sale en la línea siguiente: se espera
      lastStat = row.sp == null ? row.stat : null;
      continue;
    }
    // número suelto justo después de una fila de estadística sin su número
    if (lastStat && /^\d{1,2}$/.test(line) && Number(line) <= 32) {
      if (cur) cur.sp[lastStat] = Number(line); else pendingSP[lastStat] = Number(line);
      lastStat = null;
      continue;
    }
    lastStat = null;
    for (const f of scanLine(line)) {
      if (f.kind === 'species') {
        // el mismo Pokémon repetido en líneas seguidas (nombre + especie) no crea otro candidato
        if (cur && cur.set.species === f.value && cur.set.moves.length === 0 && !pending.length) continue;
        cur = newDraft(f.value);
        drafts.push(cur);
        for (const p of pending) apply(cur, p);
        Object.assign(cur.sp, pendingSP);
        pending = [];
      } else if (cur) apply(cur, f);
      else pending.push(f);
    }
  }
  return drafts;
}

/** Une lo leído en otra pasada sobre la misma imagen: completa lo que faltaba sin pisar lo ya leído. */
function mergeDraft(into: Draft, from: Draft) {
  for (const m of from.set.moves) if (!into.set.moves.includes(m) && into.set.moves.length < 4) into.set.moves.push(m);
  if (!into.hasAbility && from.hasAbility) { into.set.ability = from.set.ability; into.hasAbility = true; }
  if (!into.hasNature && from.hasNature) { into.set.nature = from.set.nature; into.hasNature = true; }
  for (const k of STATS) if (into.sp[k] === undefined && from.sp[k] !== undefined) into.sp[k] = from.sp[k];
}

/**
 * Interpreta una o varias lecturas (pasadas) de la misma captura y devuelve los candidatos.
 * Con varias pasadas, el mismo Pokémon se fusiona en un solo candidato.
 */
export function parseRecruitText(input: string | string[]): RecruitParse {
  const warnings: string[] = [];
  const passes = (Array.isArray(input) ? input : [input]).map((t) => parseOne(t, warnings));
  const drafts: Draft[] = passes[0] ?? [];
  for (const pass of passes.slice(1)) {
    const taken = new Set<Draft>();
    for (const d of pass) {
      const target = drafts.find((x) => x.set.species === d.set.species && !taken.has(x));
      if (target) { mergeDraft(target, d); taken.add(target); } else { drafts.push(d); taken.add(d); }
    }
  }

  for (const d of drafts) {
    const s = d.set;
    for (const k of STATS) s.sp[k] = d.sp[k] ?? 0;
    if (!d.hasAbility) {
      s.ability = legalAbilities(s.species)[0] ?? '';
      warnings.push(`${s.species}: no se leyó la habilidad (se puso ${s.ability || 'ninguna'}); revísala`);
    }
    if (!d.hasNature) warnings.push(`${s.species}: no se leyó la naturaleza; elígela a mano`);
    if (s.moves.length < 4) warnings.push(`${s.species}: solo se leyeron ${s.moves.length} movimientos; completa el resto`);
    const seen = STATS.filter((k) => d.sp[k] !== undefined).length;
    const total = STATS.reduce((t, k) => t + s.sp[k], 0);
    if (total > 66) { warnings.push(`${s.species}: los Stat Points leídos suman ${total} (máx. 66); revísalos`); s.sp = emptySP(); }
    else if (seen === 0) warnings.push(`${s.species}: no se leyeron los Stat Points`);
    // con 66 en total, las estadísticas que no se leyeron son 0
    else if (total < 66) warnings.push(`${s.species}: Stat Points leídos ${total}/66${seen < 6 ? ` (${6 - seen} estadística${6 - seen > 1 ? 's' : ''} sin leer)` : ''}; revísalos`);
  }
  if (!drafts.length) warnings.push('No se reconoció ningún Pokémon. Prueba con una captura más nítida o recortada a una sola tarjeta.');
  return { sets: drafts.map((d) => d.set), warnings: [...new Set(warnings)] };
}
