/**
 * Controlador del lector de capturas: prepara la imagen, la pasa por OCR (Tesseract.js, se carga
 * solo cuando se usa) e interpreta el texto como candidatos de reclutamiento para revisarlos.
 */
import { useEffect, useRef, useState } from 'react';
import type { Worker } from 'tesseract.js';
import { parseRecruitText, type RecruitParse } from '../models/domain/recruitText';
import type { PokemonSet } from '../models/domain/sets';

export type OcrStatus = 'idle' | 'loading' | 'reading' | 'done' | 'error';

/** Escala ×2, pasa a grises y, si el fondo es oscuro (como en el juego), invierte: el OCR lee mejor texto negro sobre blanco. */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(2, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
    sum += g;
  }
  const invert = sum / (d.length / 4) < 128;
  if (invert) for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255 - d[i];
  ctx.putImageData(img, 0, 0);
  return c;
}

export function useOcrController(onAdd: (sets: PokemonSet[]) => void) {
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [progress, setProgress] = useState(0);
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
    const { createWorker } = await import('tesseract.js');
    worker.current = await createWorker(['spa', 'eng'], 1, {
      logger: (m) => { if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100)); },
    });
    return worker.current;
  };

  /** Lee una o varias capturas (p. ej. una por tarjeta) y junta el texto. */
  const read = async (files: Blob[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setError('');
    setPreview(imgs.map((f) => URL.createObjectURL(f)));
    try {
      const w = await getWorker();
      setStatus('reading');
      const texts: string[] = [];
      for (const f of imgs) {
        setProgress(0);
        const { data } = await w.recognize(await prepare(f));
        texts.push(data.text);
      }
      const all = texts.join('\n\n');
      setText(all);
      interpret(all);
      setStatus('done');
    } catch (e) {
      setError(`No se pudo leer la imagen: ${(e as Error).message}. La primera vez hace falta internet para descargar el lector (≈15 MB).`);
      setStatus('error');
    }
  };

  /** Vuelve a interpretar el texto (también si lo corriges a mano). */
  const interpret = (t: string) => {
    const r = parseRecruitText(t);
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

  return { status, progress, text, setText, result, selected, toggle, error, preview, read, interpret, add, reset };
}
