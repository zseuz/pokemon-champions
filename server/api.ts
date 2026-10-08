/**
 * API local mínima sobre la base de datos SQLite. Se monta dentro del servidor de Vite
 * (npm run dev / npm run preview), así que no hace falta arrancar nada aparte.
 *
 *   GET  /api/state         → todo lo guardado { clave: valor }
 *   PUT  /api/state/:clave  → reemplaza una clave (cuerpo JSON)
 *   GET  /api/health        → estado y ruta del archivo de la base de datos
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { isEmpty, KEYS, readAll, stats, write } from './db.ts';

const VALID = new Set<string>(Object.values(KEYS));

function send(res: ServerResponse, status: number, body: unknown) {
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

export async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = (req.url ?? '').split('?')[0];
  if (!url.startsWith('/api/')) return next();
  try {
    if (req.method === 'GET' && url === '/api/health') return send(res, 200, { ok: true, ...stats() });
    if (req.method === 'GET' && url === '/api/state') return send(res, 200, { empty: isEmpty(), data: readAll() });
    const m = url.match(/^\/api\/state\/([\w-]+)$/);
    if (req.method === 'PUT' && m) {
      const key = m[1];
      if (!VALID.has(key)) return send(res, 400, { error: `clave no válida: ${key}` });
      write(key, JSON.parse(await readBody(req)));
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'ruta no encontrada' });
  } catch (e) {
    return send(res, 500, { error: (e as Error).message });
  }
}

/** Plugin de Vite que añade la API local al servidor de desarrollo y al de vista previa. */
export function localDbPlugin(): Plugin {
  return {
    name: 'champions-local-db',
    configureServer(server) { server.middlewares.use((req, res, next) => { void handle(req, res, next); }); },
    configurePreviewServer(server) { server.middlewares.use((req, res, next) => { void handle(req, res, next); }); },
  };
}
