/**
 * Convierte las palabras que devuelve el OCR (con su posición) en líneas de texto limpias.
 * Las pantallas del juego tienen varias columnas (estadísticas a la izquierda, movimientos a la derecha):
 * el OCR las une en una misma línea, así que aquí se vuelven a separar por huecos horizontales grandes.
 */

export interface OcrWord {
  text: string;
  x0: number;
  x1: number;
  confidence: number;
}

/** Hueco (en fracción del ancho de la imagen) a partir del cual dos palabras son de columnas distintas. */
export const COLUMN_GAP = 0.1;

/** Palabra útil: tiene letras o números y no es un trozo de ruido (iconos, barras, bordes). */
export function isUseful(w: OcrWord): boolean {
  const t = w.text.trim();
  if (!/[\p{L}\p{N}]/u.test(t)) return false;
  if (/^\d+$/.test(t)) return w.confidence >= 20;
  // una sola letra solo vale si es el 0 mal leído («o») con buena confianza
  if (t.length === 1) return /^[oO]$/.test(t) && w.confidence >= 60;
  return w.confidence >= 35;
}

/** Cada línea del OCR se parte en segmentos, uno por columna. */
export function wordsToSegments(lines: OcrWord[][], imageWidth: number): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const words = line.filter(isUseful).sort((a, b) => a.x0 - b.x0);
    let seg: string[] = [];
    let prevEnd: number | null = null;
    for (const w of words) {
      if (prevEnd != null && w.x0 - prevEnd > imageWidth * COLUMN_GAP) {
        if (seg.length) out.push(seg.join(' '));
        seg = [];
      }
      seg.push(w.text.trim());
      prevEnd = w.x1;
    }
    if (seg.length) out.push(seg.join(' '));
  }
  return out;
}
