/** Equipos rivales para el simulador, sacados del meta del formato. */
import { metaTop, metaWeight, type Format } from '../data/meta';
import { effectiveSpecies, type PokemonSet } from '../domain/sets';

// los 60 más usados de cada formato
const metaSets = (format: Format) => metaTop(format, 60).filter((m) => m.set);

/** Equipo rival aleatorio del meta: ponderado por uso, sin especies ni objetos repetidos y con máx. 1 Mega. */
export function randomMetaTeam(n = 6, format: Format = 'doubles'): PokemonSet[] {
  const pool = metaSets(format);
  const team: PokemonSet[] = [];
  let hasMega = false;
  while (team.length < n && pool.length) {
    const total = pool.reduce((t, e) => t + metaWeight(e), 0);
    let r = Math.random() * total;
    const idx = pool.findIndex((e) => (r -= metaWeight(e)) <= 0);
    const [e] = pool.splice(idx < 0 ? 0 : idx, 1);
    const isMega = effectiveSpecies(e.set!, true) !== e.set!.species;
    if ((isMega && hasMega) || team.some((t) => t.item === e.set!.item)) continue;
    hasMega ||= isMega;
    team.push(structuredClone(e.set!));
  }
  return team;
}

/** La IA elige 4 de sus 6 en dobles o 3 en individuales (con algo de azar). */
export function pickFour(team: PokemonSet[], n = 4): number[] {
  return team.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, n);
}
