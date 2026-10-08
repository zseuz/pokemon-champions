/**
 * Controlador del meta: comprueba si pokechamp.gg tiene datos más nuevos y los descarga.
 *
 *   GET  /api/meta/check   → { current, latest, outdated }   (temporada y fecha de cada formato)
 *   POST /api/meta/update  → ejecuta `npm run gen:meta` y `npm run validate`
 */
import { exec } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { send } from './stateController.ts';

const DATA = resolve(process.cwd(), 'src/models/data/pokechamp.json');
const FORMATS = ['singles', 'doubles'] as const;

interface Stamp { season: string; updated: string }

function current(): Record<string, Stamp> {
  const j = JSON.parse(readFileSync(DATA, 'utf-8')) as Record<string, Stamp>;
  return Object.fromEntries(FORMATS.map((f) => [f, { season: j[f]?.season ?? '', updated: j[f]?.updated ?? '' }]));
}

async function latest(): Promise<Record<string, Stamp>> {
  const out: Record<string, Stamp> = {};
  for (const f of FORMATS) {
    const html = await (await fetch(`https://pokechamp.gg/tier-list/${f}/pokemon`, { headers: { 'User-Agent': 'Mozilla/5.0 (Champions Coach)' } })).text();
    const text = html.replace(/<!--.*?-->/gs, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    out[f] = {
      season: text.match(/(Season \d+ \(Current\))/)?.[1] ?? '',
      updated: text.match(/Last updated:\s*([A-Z][a-z]+ \d{1,2}, \d{4})/)?.[1] ?? '',
    };
  }
  return out;
}

let cache: { at: number; data: Record<string, Stamp> } | null = null;

export async function checkMeta(_req: IncomingMessage, res: ServerResponse) {
  try {
    if (!cache || Date.now() - cache.at > 30 * 60 * 1000) cache = { at: Date.now(), data: await latest() };
    const cur = current();
    const outdated = FORMATS.some((f) => cache!.data[f].updated && (cache!.data[f].updated !== cur[f].updated || cache!.data[f].season !== cur[f].season));
    const newSeason = FORMATS.some((f) => cache!.data[f].season && cache!.data[f].season !== cur[f].season);
    send(res, 200, { current: cur, latest: cache.data, outdated, newSeason });
  } catch (e) {
    send(res, 200, { current: current(), latest: null, outdated: false, newSeason: false, error: `No se pudo consultar pokechamp.gg: ${(e as Error).message}` });
  }
}

let running = false;

export function updateMeta(_req: IncomingMessage, res: ServerResponse) {
  if (running) return send(res, 409, { error: 'Ya se está actualizando' });
  running = true;
  exec('npm run gen:meta && npm run validate', { cwd: process.cwd(), timeout: 120_000 }, (err, stdout, stderr) => {
    running = false;
    cache = null;
    const lines = `${stdout}\n${stderr}`.split('\n').filter((l) => /Individuales|Dobles|OK|problemas|Avisos|aviso/.test(l)).map((l) => l.trim());
    if (err) return send(res, 500, { ok: false, error: 'Falló la actualización', log: lines });
    send(res, 200, { ok: true, current: current(), log: lines });
  });
}
