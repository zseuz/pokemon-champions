/** Acceso a la API local del meta (comprobar si hay datos nuevos en pokechamp.gg y descargarlos). */
export interface MetaStamp { season: string; updated: string }
export interface MetaCheck {
  current: Record<'singles' | 'doubles', MetaStamp>;
  latest: Record<'singles' | 'doubles', MetaStamp> | null;
  outdated: boolean;
  newSeason: boolean;
  error?: string;
}

export async function checkMeta(): Promise<MetaCheck | null> {
  try {
    const r = await fetch('/api/meta/check');
    return r.ok ? ((await r.json()) as MetaCheck) : null;
  } catch {
    return null;
  }
}

export async function updateMeta(): Promise<{ ok: boolean; log: string[]; error?: string }> {
  try {
    const r = await fetch('/api/meta/update', { method: 'POST' });
    return (await r.json()) as { ok: boolean; log: string[]; error?: string };
  } catch (e) {
    return { ok: false, log: [], error: (e as Error).message };
  }
}
