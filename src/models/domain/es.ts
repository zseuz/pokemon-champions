/** Nombres en español (PokeAPI, generados con `npm run gen:es`) y alias usados por Pokémon Champions. */
import es from '../data/es.json';

const D = es as { moves: Record<string, string>; abilities: Record<string, string>; items: Record<string, string>; natures: Record<string, string> };

/**
 * Nombres que Pokémon Champions muestra distinto a la traducción clásica
 * (o movimientos nuevos sin traducción en PokeAPI). Añade aquí los que encuentres.
 */
export const CHAMPIONS_MOVES: Record<string, string> = {
  'Poison Jab': 'Golpe Venenoso',
  Acrobatics: 'Acrobacia',
  'Dire Claw': 'Garra Nociva',
  'Flower Trick': 'Truco Floral',
  'Rage Fist': 'Puño Furia',
};

/**
 * Movimientos de la 9.ª generación sin nombre español en PokeAPI
 * (nombres oficiales tal como los muestra Pokémon Champions, según GameWith).
 */
const GEN9_MOVES: Record<string, string> = {
  'Aqua Cutter': 'Tajo Acuático', 'Aqua Step': 'Danza Acuática', 'Armor Cannon': 'Cañón Armadura', 'Axe Kick': 'Patada Hacha',
  'Barb Barrage': 'Mil Púas Tóxicas', 'Bitter Blade': 'Espada Lamento', 'Bitter Malice': 'Rencor Reprimido', 'Blood Moon': 'Luna Roja',
  'Ceaseless Edge': 'Tajo Metralla', 'Chilling Water': 'Agua Fría', 'Chilly Reception': 'Fría Acogida', Comeuppance: 'Resarcimiento',
  'Double Shock': 'Electropalmas', 'Gigaton Hammer': 'Martillo Colosal', 'Glaive Rush': 'Asalto Espadón', 'Headlong Rush': 'Arremetida',
  'Hyper Drill': 'Hipertaladro', 'Ice Spinner': 'Pirueta Helada', 'Infernal Parade': 'Marcha Espectral', 'Jet Punch': 'Puño Jet',
  'Kowtow Cleave': 'Genufendiente', 'Last Respects': 'Homenaje Póstumo', 'Lumina Crash': 'Fotocolisión', 'Make It Rain': 'Fiebre Dorada',
  'Matcha Gotcha': 'Cañón Batidor', 'Mortal Spin': 'Giro Mortífero', 'Mountain Gale': 'Viento Carámbano', 'Population Bomb': 'Proliferación',
  Pounce: 'Brinco', 'Power Shift': 'Cambiapoder', 'Psyshield Bash': 'Asalto Barrera', 'Raging Bull': 'Furia Taurina',
  'Raging Fury': 'Erupción de Ira', 'Revival Blessing': 'Plegaria Vital', 'Salt Cure': 'Salazón', 'Shed Tail': 'Autotomía',
  Shelter: 'Retracción', Snowscape: 'Paisaje Nevado', 'Spicy Extract': 'Extracto Picante', 'Stone Axe': 'Hachazo Pétreo',
  'Syrup Bomb': 'Bomba Caramelo', 'Tidy Up': 'Limpieza General', 'Torch Song': 'Canto Ardiente', Trailblaze: 'Abrecaminos',
  'Triple Arrows': 'Triple Flecha', 'Triple Dive': 'Triple Inmersión', 'Twin Beam': 'Láser Doble', 'Wave Crash': 'Envite Acuático',
};

/** Todos los nombres españoles de movimientos (PokeAPI + 9.ª generación). */
export const MOVES_ES: Record<string, string> = { ...D.moves, ...GEN9_MOVES };

export const moveEs = (m: string) => CHAMPIONS_MOVES[m] ?? MOVES_ES[m] ?? m;
export const abilityEsName = (a: string) => D.abilities[a] ?? a;
export const itemEs = (i: string) => D.items[i] ?? i;
export const natureEs = (n: string) => D.natures[n] ?? n;

/** "Taladradora (Drill Run)" o solo el inglés si no hay traducción. */
export function bilingual(en: string, esName: string) {
  return esName && esName !== en ? `${esName} (${en})` : en;
}
export const moveLabel = (m: string) => bilingual(m, moveEs(m));

/** Texto de búsqueda: inglés + español oficial + alias de Champions, sin tildes. */
export function searchKey(...names: (string | undefined)[]) {
  return normalize(names.filter(Boolean).join(' '));
}
export function moveSearch(m: string) {
  return searchKey(m, MOVES_ES[m], CHAMPIONS_MOVES[m]);
}
export function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '');
}

/** Nombre en español de las formas (como aparecen en el juego), para mostrar y buscar. */
const FORM_ES: Record<string, string> = {
  Alola: 'de Alola', Galar: 'de Galar', Hisui: 'de Hisui',
  'Paldea-Combat': 'de Paldea (raza combativa)', 'Paldea-Blaze': 'de Paldea (raza ardiente)', 'Paldea-Aqua': 'de Paldea (raza acuática)',
  Wash: 'Lavado', Heat: 'Calor', Frost: 'Frío', Fan: 'Ventilador', Mow: 'Corte',
  F: 'hembra', Midnight: 'Nocturno', Dusk: 'Crepuscular', Eternal: 'de Flor Eterna', 'Low-Key': 'Grave',
  Blue: 'plumaje azul', White: 'plumaje blanco', Yellow: 'plumaje amarillo',
  Small: 'pequeño', Large: 'grande', Super: 'extragrande', Shield: 'forma escudo', Blade: 'forma filo', Both: '',
  Rainy: 'lluvia', Snowy: 'nieve', Sunny: 'sol', Busted: 'descubierto', Hangry: 'voraz', Hero: 'heroica',
  Antique: 'antigua', Masterpiece: 'exquisita', Four: 'familia de cuatro', Fancy: 'fantasía', Pokeball: 'Poké Ball',
};

/** "Rotom-Wash" → "Rotom Lavado"; "Raichu-Alola" → "Raichu de Alola". */
export function speciesEs(name: string): string {
  const i = name.indexOf('-');
  if (i < 0 || name === 'Kommo-o') return name;
  const base = name.slice(0, i);
  const form = FORM_ES[name.slice(i + 1)];
  return form ? `${base} ${form}` : name;
}

/** Texto de búsqueda de una especie: nombre interno + nombre español de la forma + región en inglés. */
export function speciesSearch(name: string) {
  return searchKey(name, speciesEs(name), name.replace(/-/g, ' '));
}
