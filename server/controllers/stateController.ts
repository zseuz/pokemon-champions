/**
 * Controlador de la API local: recibe la petición ya enrutada, usa el modelo (SQLite) y responde en JSON.
 *
 *   GET  /api/state         → getState     · todo lo guardado { clave: valor }
 *   PUT  /api/state/:clave  → putState     · reemplaza una clave (cuerpo JSON)
 *   GET  /api/health        → getHealth    · estado y ruta del archivo de la base de datos
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isEmpty, KEYS, readAll, stats, write } from '../models/stateModel.ts';

const VALID = new Set<string>(Object.values(KEYS));

export function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5_000_000) fail(new Error('demasiado grande')); });
    req.on('end', () => ok(data));
    req.on('error', fail);
  });
}

export function getHealth(_req: IncomingMessage, res: ServerResponse) {
  send(res, 200, { ok: true, ...stats() });
}

export function getState(_req: IncomingMessage, res: ServerResponse) {
  send(res, 200, { empty: isEmpty(), data: readAll() });
}

export async function putState(req: IncomingMessage, res: ServerResponse, key: string) {
  if (!VALID.has(key)) return send(res, 400, { error: `clave no válida: ${key}` });
  write(key, JSON.parse(await readBody(req)));
  send(res, 200, { ok: true });
}
