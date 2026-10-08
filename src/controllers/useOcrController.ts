/**
 * Controlador del lector de capturas: prepara la imagen, la pasa por OCR (Tesseract.js, se carga
 * solo cuando se usa) e interpreta el texto como candidatos de reclutamiento para revisarlos.
 *
 * Las capturas del juego mezclan texto blanco sobre fondo morado y texto oscuro sobre barras blancas,
 * y ningún preprocesado lee bien las dos cosas; por eso se hacen DOS pasadas (imagen en grises y solo el
 * texto blanco) y se fusionan los resultados.
 */
import { useEffect, useRef, useState } from 'react';
import type { Worker } from 'tesseract.js';
import { wordsToSegments, type OcrWord } from '../models/domain/ocrLayout';
import { parseRecruitText, type RecruitParse } from '../models/domain/recruitText';
import type { PokemonSet } from '../models/domain/sets';

export type OcrStatus = 'idle' | 'loading' | 'reading' | 'done' | 'error';

/** Ancho al que se escala la imagen: Tesseract lee mejor el texto cuando las letras miden ~30 px o más. */
const TARGET_WIDTH = 3200;

/** Imagen escalada con cada píxel transformado por `fn` (luminosidad y saturación → gris). */
function render(bmp: ImageBitmap, fn: (lum: number, sat: number) => number): HTMLCanvasElement {
  const scale = Math.max(1, Math.min(2.5, TARGET_WIDTH / bmp.width));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = fn(0.299 * r + 0.587 * g + 0.114 * b, Math.max(r, g, b) - Math.min(r, g, b));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Las pasadas de lectura: grises (texto oscuro y claro) y solo texto blanco/muy claro en negro sobre blanco. */
async function passes(file: Blob): Promise<HTMLCanvasElement[]> {
  const bmp = await createImageBitmap(file);
  return [
    render(bmp, (lum) => lum),
    render(bmp, (lum, sat) => (lum > 205 && sat < 60 ? 0 : 255)),
  ];
}

export function useOcrController(onAdd: (sets: PokemonSet[]) => void) {
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState(0);
  const [text, setText] = useState('');
  const [result, setResult] = useState<RecruitParse | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string[]>([]);
  const worker = useRef<Worker | null>(null);

  useEffect(() => () => { void worker.current?.terminate(); }, []);

  const getWorker = async () => {
    if (worker.current) return worker.current;
    setStatus('loading');
    const { createWorker, PSM } = await import('tesseract.js');
    // inglés primero (el juego puede estar en inglés); el español también se reconoce
    const w = await createWorker(['eng', 'spa'], 1, {
      logger: (m) => { if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100)); },
    });
    // «bloque único»: lee todas las filas, incluso las sueltas de una interfaz de juego
    await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    worker.current = w;
    return w;
  };

  /** Lee una o varias capturas (p. ej. una por tarjeta) y junta el texto de cada pasada. */
  const read = async (files: Blob[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setError('');
    setPreview(imgs.map((f) => URL.createObjectURL(f)));
    try {
      const w = await getWorker();
      setStatus('reading');
      // una lista de textos por pasada; con varias imágenes se unen pasada a pasada
      const texts: string[] = [];
      for (const f of imgs) {
        const canvases = await passes(f);
        for (const [p, canvas] of canvases.entries()) {
          setProgress(0);
          setStep(p + 1);
          const { data } = await w.recognize(canvas, {}, { blocks: true });
          const lines: OcrWord[][] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((para) => para.lines))
            .map((l) => l.words.map((x) => ({ text: x.text, x0: x.bbox.x0, x1: x.bbox.x1, confidence: x.confidence })));
          const seg = wordsToSegments(lines, canvas.width).join('\n');
          texts[p] = texts[p] ? `${texts[p]}\n\n${seg}` : seg;
        }
      }
      setText(texts.join('\n\n———\n\n'));
      interpret(texts);
      setStatus('done');
    } catch (e) {
      setError(`No se pudo leer la imagen: ${(e as Error).message}. La primera vez hace falta internet para descargar el lector (≈15 MB).`);
      setStatus('error');
    }
  };

  /** Vuelve a interpretar el texto (también si lo corriges a mano; las pasadas se separan con ———). */
  const interpret = (t: string | string[]) => {
    const r = parseRecruitText(typeof t === 'string' ? t.split(/\n\s*———\s*\n/) : t);
    setResult(r);
    setSelected(r.sets.map((_, i) => i));
  };

  const toggle = (i: number) => setSelected(selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i]);

  const add = () => {
    if (!result) return;
    onAdd(result.sets.filter((_, i) => selected.includes(i)));
    reset();
  };

  const reset = () => { setStatus('idle'); setText(''); setResult(null); setSelected([]); setPreview([]); setError(''); };

  // pegar una captura con Ctrl+V
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); void read(files); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return { status, progress, step, text, setText, result, selected, toggle, error, preview, read, interpret, add, reset };
}
