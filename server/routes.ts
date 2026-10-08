/**
 * Rutas de la API local (servidor MVC):
 *   routes.ts                     → qué URL va a qué controlador (y el plugin que lo monta en Vite)
 *   controllers/stateController   → guardar/leer tus datos
 *   controllers/metaController    → comprobar y descargar el meta de pokechamp.gg
 *   models/stateModel             → base de datos SQLite (data/champions.db)
 * Se monta dentro del servidor de Vite (npm run dev / npm run preview): no hay que arrancar nada aparte.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { getHealth, getState, putState, send } from './controllers/stateController.ts';
import { checkMeta, updateMeta } from './controllers/metaController.ts';

export async function router(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = (req.url ?? '').split('?')[0];
  if (!url.startsWith('/api/')) return next();
  try {
    if (req.method === 'GET' && url === '/api/health') return getHealth(req, res);
    if (req.method === 'GET' && url === '/api/state') return getState(req, res);
    if (req.method === 'GET' && url === '/api/meta/check') return await checkMeta(req, res);
    if (req.method === 'POST' && url === '/api/meta/update') return updateMeta(req, res);
    const m = url.match(/^\/api\/state\/([\w-]+)$/);
    if (req.method === 'PUT' && m) return await putState(req, res, m[1]);
    return send(res, 404, { error: 'ruta no encontrada' });
  } catch (e) {
    return send(res, 500, { error: (e as Error).message });
  }
}

/** Plugin de Vite que añade la API local al servidor de desarrollo y al de vista previa. */
export function localDbPlugin(): Plugin {
  return {
    name: 'champions-local-db',
    configureServer(server) { server.middlewares.use((req, res, next) => { void router(req, res, next); }); },
    configurePreviewServer(server) { server.middlewares.use((req, res, next) => { void router(req, res, next); }); },
  };
}
