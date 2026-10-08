/** Formateadores de texto que usan las vistas. */
import type { Hit } from '../models/analysis/build';
export { itemName } from '../models/analysis/items';

/** "KO directo", "2HKO"… */
export const koText = (h: Hit) => (h.hits === Infinity ? 'no le hace daño' : h.hits === 1 ? 'KO directo' : `${h.hits}HKO`);
