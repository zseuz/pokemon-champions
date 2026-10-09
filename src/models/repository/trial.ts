/**
 * Reclutamiento de prueba: en Pokémon Champions puedes reclutar un Pokémon «de prueba» durante 7 días
 * y decidir después si te lo quedas. Aquí se guarda cuándo termina la prueba de cada Pokémon de la colección.
 */
import type { PokemonSet } from '../domain/sets';
import { upsertSet, type BoxEntry } from './store';

export const TRIAL_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

/** Momento en que termina una prueba que empieza `now`. */
export const trialEnd = (now = Date.now()) => new Date(now + TRIAL_DAYS * DAY).toISOString();

export const isTrial = (e?: BoxEntry) => !!e?.trialUntil;

export interface TrialStatus {
  species: string;
  /** días enteros que quedan (0 = termina hoy) */
  daysLeft: number;
  expired: boolean;
  until: Date;
}

export function trialStatus(e: BoxEntry, now = Date.now()): TrialStatus | null {
  if (!e.trialUntil) return null;
  const until = new Date(e.trialUntil);
  if (Number.isNaN(until.getTime())) return null;
  const ms = until.getTime() - now;
  return { species: e.species, expired: ms <= 0, daysLeft: Math.max(0, Math.ceil(ms / DAY)), until };
}

/** Todas las pruebas en curso o terminadas, las que acaban antes primero. */
export function trials(box: BoxEntry[], now = Date.now()): TrialStatus[] {
  return box.map((e) => trialStatus(e, now)).filter((t): t is TrialStatus => !!t).sort((a, b) => a.until.getTime() - b.until.getTime());
}

/**
 * Recluta un Pokémon de prueba con su set. Si ya lo tienes fijo en la colección no cambia nada
 * (la prueba no puede quitarte un Pokémon que ya es tuyo).
 */
export function recruitTrial(box: BoxEntry[], set: PokemonSet, now = Date.now()): BoxEntry[] {
  const cur = box.find((b) => b.species === set.species);
  if (cur && !cur.trialUntil) return box;
  return upsertSet(box, set).map((b) => (b.species === set.species ? { ...b, trialUntil: trialEnd(now) } : b));
}

/** «Quedármelo»: la prueba pasa a ser un reclutamiento definitivo. */
export function keepTrial(box: BoxEntry[], species: string): BoxEntry[] {
  return box.map((b) => {
    if (b.species !== species) return b;
    const { trialUntil: _t, ...rest } = b;
    return rest;
  });
}

/** Texto corto de lo que queda de prueba: «quedan 3 días», «último día», «terminó». */
export function trialLabel(t: TrialStatus): string {
  if (t.expired) return 'prueba terminada';
  if (t.daysLeft <= 1) return 'último día de prueba';
  return `prueba: quedan ${t.daysLeft} días`;
}
