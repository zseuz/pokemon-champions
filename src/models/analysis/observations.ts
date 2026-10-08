/**
 * Observaciones de qué mejorar en un equipo: debilidades compartidas, roles que faltan, cobertura,
 * amenazas del meta, objetos, Megas, sets mejorables y cambios con Pokémon de la colección.
 */
import { MEGA_STONES } from '@smogon/calc';
import { FORMAT_ES, metaEntry, type Format } from '../data/meta';
import { historyStats, lossWeights, type BattleRecord } from './history';
import { gradeSet } from './candidates';
import { ALL_ITEMS, megaForme, TYPE_ES } from '../domain/dex';
import { assignItems, itemName } from './items';
import { effectiveSpecies, SP_MAX_TOTAL, spTotal, type PokemonSet } from '../domain/sets';
import { collectionAdvice } from './synergy';
import { battleMonFor, bestHit, defensiveChart, neutralState, defensiveMultiplier, offensiveCoverage, teamRoles, threats } from './teamAnalysis';

export type Level = 'alta' | 'media' | 'baja' | 'ok';

export interface Observation {
  level: Level;
  area: string;
  title: string;
  detail?: string;
  /** detalle en forma de lista (un punto por Pokémon/parte) */
  points?: string[];
  /** qué hacer */
  fix?: string;
  /** miembro del equipo al que se refiere (para abrir su set) */
  member?: string;
  /** Pokémon de tu colección que lo solucionarían */
  suggest?: { species: string; why?: string }[];
  /** cambio propuesto: sacar `out` y meter `in` */
  swap?: { out: string; in: string; delta: number };
}

const ORDER: Record<Level, number> = { alta: 0, media: 1, baja: 2, ok: 3 };
const IMPORTANT_ROLES = new Set(['fakeout', 'intimidate', 'speed', 'hazards', 'pivot', 'priority']);

export function teamObservations(team: PokemonSet[], collection: PokemonSet[], format: Format, inventory: string[] = [], history: BattleRecord[] = []): Observation[] {
  const obs: Observation[] = [];
  const add = (o: Observation) => obs.push(o);
  const bench = collection.filter((c) => !team.some((t) => t.species === c.species));
  const f = FORMAT_ES[format].toLowerCase();

  if (!team.length) {
    return [{ level: 'alta', area: 'Equipo', title: `Tu equipo de ${f} está vacío`, fix: 'Usa "Armar mi equipo con mi colección" o añade Pokémon con "+ Equipo".' }];
  }

  const advice = collectionAdvice(team, bench, format);

  // 1) Tamaño
  if (team.length < 6) {
    add({
      level: team.length < 4 ? 'alta' : 'media', area: 'Equipo',
      title: `Tu equipo tiene ${team.length}/6 Pokémon`,
      detail: format === 'doubles' ? 'En dobles eliges 4 de 6 en cada combate: tener los 6 te da opciones contra cada rival.' : 'Con 6 Pokémon tienes más opciones al elegir contra cada rival.',
      fix: advice.fits.length ? 'Los que más lo mejorarían de tu colección:' : 'Recluta más Pokémon para completarlo.',
      suggest: advice.fits.slice(0, 3).map((x) => ({ species: x.set.species, why: x.reasons[0] })),
    });
  }

  // 2) Debilidades compartidas
  const chart = defensiveChart(team);
  for (const row of chart) {
    const t = TYPE_ES[row.type];
    if (row.weak < 2 || (row.weak === 2 && row.resist > 0)) continue;
    const level: Level = row.weak >= 3 && row.resist === 0 ? 'alta' : row.weak >= 3 ? 'media' : 'baja';
    const resisters = bench
      .map((c) => ({ c, m: defensiveMultiplier(battleMonFor(c, 0), row.type) }))
      .filter((x) => x.m < 1)
      .sort((a, b) => (advice.fits.find((f2) => f2.set.species === b.c.species)?.fit ?? 0) - (advice.fits.find((f2) => f2.set.species === a.c.species)?.fit ?? 0));
    const weakOnes = team.filter((_, i) => row.mults[i] > 1).map((s) => s.species);
    add({
      level, area: 'Debilidades',
      title: `${row.weak} miembros débiles a ${t}${row.resist === 0 ? ' y ninguno lo resiste' : ''}`,
      detail: `Débiles: ${weakOnes.join(', ')}.`,
      fix: resisters.length ? `Mete un Pokémon que resista ${t}:` : `Busca un Pokémon que resista ${t} (en tu colección no tienes ninguno).`,
      suggest: resisters.slice(0, 3).map((x) => ({ species: x.c.species, why: x.m === 0 ? `inmune a ${t}` : `resiste ${t}` })),
    });
  }

  // 3) Roles que faltan
  for (const role of teamRoles(team, format).filter((r) => !r.members.length)) {
    const fillers = bench.filter((c) => role.test(c));
    add({
      level: IMPORTANT_ROLES.has(role.id) ? 'media' : 'baja', area: 'Roles',
      title: `Falta: ${role.name}`,
      detail: ROLE_WHY[role.id]?.[format === 'doubles' ? 1 : 0],
      fix: fillers.length ? 'Lo aportan de tu colección:' : 'Puedes añadir ese movimiento/habilidad a alguno de tus Pokémon (editando su set) o reclutar uno que lo tenga.',
      suggest: fillers.slice(0, 3).map((c) => ({ species: c.species })),
    });
  }

  // 4) Cobertura ofensiva
  const weakCoverage = offensiveCoverage(team).filter((c) => c.best < 1);
  if (weakCoverage.length) {
    add({
      level: weakCoverage.some((c) => c.best === 0) ? 'media' : 'baja', area: 'Cobertura',
      title: `Nadie golpea con fuerza a: ${weakCoverage.map((c) => TYPE_ES[c.type]).join(', ')}`,
      detail: weakCoverage.some((c) => c.best === 0) ? `Tus ataques no hacen daño a ${weakCoverage.filter((c) => c.best === 0).map((c) => TYPE_ES[c.type]).join(', ')}.` : 'Todos tus ataques son poco eficaces contra esos tipos.',
      fix: 'Añade a algún miembro un ataque que sea neutro o súper eficaz contra ellos.',
    });
  }

  // 5) Amenazas del meta (las 3 peores, en una sola observación)
  const extra = lossWeights(history, format);
  const bad = threats(team, 6, format, extra)
    .map((th) => ({ th, kos: th.toUs.filter((x) => x.pct >= 100).map((x) => x.species) }))
    .filter(({ th, kos }) => kos.length >= 3 || th.fromUs.pct < 50)
    .slice(0, 3);
  if (bad.length) {
    const worst = bad[0];
    add({
      level: worst.kos.length >= 4 && worst.th.fromUs.pct < 60 ? 'alta' : 'media', area: 'Amenazas',
      title: `Amenazas del meta: ${bad.map((b) => `${b.th.entry.species} (#${b.th.entry.rank})`).join(', ')}`,
      points: bad.map(({ th, kos }) => `${th.entry.species}: ${kos.length ? `KO directo a ${kos.join(', ')}` : 'te desgasta mucho'} — tu mejor golpe: ${th.fromUs.move} de ${th.fromUs.species} (${Math.round(th.fromUs.pct)}%)`),
      fix: 'Revisa su análisis en "Mi equipo → Mayores amenazas" y piensa en un Pokémon que los aguante y les haga mucho daño.',
    });
  }

  // 5b) Tu historial real: rivales que más te ganan y quién de tu colección les hace frente
  const stats = historyStats(history, format);
  if (stats.nemesis.length) {
    const state = neutralState();
    const counters = (species: string) => {
      const foeSet = metaEntry(species, format)?.set;
      if (!foeSet) return [];
      const foe = battleMonFor(foeSet, 1);
      return collection
        .map((c) => ({ c, mine: bestHit(state, battleMonFor(c, 0), foe).pct, theirs: bestHit(state, foe, battleMonFor(c, 0)).pct }))
        .filter((x) => x.mine >= 60 && x.theirs < 60)
        .sort((a, b) => b.mine - a.mine)
        .slice(0, 2)
        .map((x) => ({ species: x.c.species, why: `le hace ${Math.round(x.mine)}%` }));
    };
    const top = stats.nemesis.slice(0, 3);
    add({
      level: top[0].losses >= 3 ? 'alta' : 'media', area: 'Historial',
      title: `En tus combates pierdes más contra: ${top.map((n) => n.species).join(', ')}`,
      points: top.map((n) => `${n.species}: ${n.losses} derrotas en ${n.games} combates (${n.winRate}% de victorias)`),
      fix: 'Pokémon de tu colección que les hacen frente:',
      suggest: top.flatMap((n) => counters(n.species)).filter((x, i, a) => a.findIndex((y) => y.species === x.species) === i).slice(0, 4),
    });
  }

  // 6) Objetos
  const items = team.map((s) => s.item).filter(Boolean);
  const dup = [...new Set(items.filter((it, i) => items.indexOf(it) !== i))];
  if (dup.length) {
    add({ level: 'alta', area: 'Objetos', title: `Objeto repetido: ${dup.map(itemName).join(', ')}`, detail: 'Las reglas no permiten llevar el mismo objeto en dos Pokémon.', fix: 'Cambia uno (en "Reclutamiento → Mis objetos" te digo el reparto óptimo).' });
  }
  // reparto conjunto para los que no llevan objeto: sin repetir y con una sola Mega bien valorada
  const without = team.filter((x) => !x.item);
  if (without.length) {
    const used = new Set(items);
    const pool = (inventory.length ? inventory : ALL_ITEMS).filter((it) => !used.has(it));
    const hasMega = team.some((x) => effectiveSpecies(x, true) !== x.species);
    const { assignments } = assignItems(without, hasMega ? pool.filter((it) => !/ite( [XYZ])?$/.test(it)) : pool, format);
    add({
      level: 'media', area: 'Objetos',
      title: `${without.length === 1 ? `${without[0].species} no lleva` : `${without.length} miembros no llevan`} objeto`,
      points: assignments.map((a) => `${a.species} → ${a.item ? `${itemName(a.item)}: ${a.reason}` : 'nada útil en tu inventario'}`),
      fix: inventory.length ? 'Reparto óptimo con tu inventario (puedes aplicarlo en "Reclutamiento → Mis objetos").' : 'Reparto recomendado (añade tus objetos en "Reclutamiento → Mis objetos" para usar solo los que tienes).',
    });
  }

  // 7) Megas
  const megas = team.filter((s) => effectiveSpecies(s, true) !== s.species);
  if (!megas.length) {
    const canMega = team.filter((s) => Object.keys(MEGA_STONES).some((st) => megaForme(s.species, st)));
    add({
      level: 'baja', area: 'Megas', title: 'Ningún miembro lleva megapiedra',
      detail: 'Una Megaevolución por combate suele ser una gran ventaja.',
      fix: canMega.length ? `Pueden megaevolucionar: ${canMega.map((s) => s.species).join(', ')}.` : 'Ninguno de tus miembros tiene Mega disponible.',
    });
  } else if (megas.length > 2) {
    add({ level: 'baja', area: 'Megas', title: `${megas.length} miembros con megapiedra`, detail: 'Solo uno puede megaevolucionar por combate; las demás piedras ocupan el hueco de un objeto útil.' });
  }

  // 8) Sets mejorables de cada miembro
  for (const s of team) {
    const { parts, quality } = gradeSet(s, format, team);
    const weak = parts.filter((p) => p.pct < 70);
    const total = spTotal(s.sp);
    if (total < SP_MAX_TOTAL) {
      add({ level: 'media', area: 'Sets', member: s.species, title: `A ${s.species} le quedan ${SP_MAX_TOTAL - total} Stat Points sin repartir`, fix: 'Repártelos en el editor (pulsa "Editar set").' });
    }
    if (!weak.length) continue;
    const level: Level = weak.some((p) => p.pct < 45) ? 'media' : 'baja';
    add({
      level, area: 'Sets', member: s.species,
      title: `El set de ${s.species} se puede mejorar (calidad ${quality}%)`,
      points: weak.map((p) => `${p.label} (${p.pct}%): ${p.text}${p.tips.length ? ` → ${p.tips.join('; ')}` : ''}`),
      fix: 'Abre su set y mira la pestaña "Build recomendado".',
    });
  }

  // 9) Cambios con tu colección
  if (team.length >= 6) {
    for (const sw of advice.swaps.filter((x) => x.delta > 3).slice(0, 2)) {
      add({
        level: sw.delta > 15 ? 'media' : 'baja', area: 'Cambios',
        title: `Cambiar ${sw.out} por ${sw.in.species} mejora el equipo (+${Math.round(sw.delta)})`,
        detail: sw.reasons.slice(0, 2).join(' · '),
        swap: { out: sw.out, in: sw.in.species, delta: sw.delta },
      });
    }
  }

  if (!obs.length) {
    obs.push({ level: 'ok', area: 'Equipo', title: '¡Tu equipo está bien cubierto!', detail: 'No veo debilidades compartidas, roles que falten ni sets mejorables.' });
  }
  return obs.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

/** Por qué importa cada rol [individuales, dobles]. */
const ROLE_WHY: Record<string, [string, string]> = {
  fakeout: ['', 'Fake Out gana el primer turno: hace retroceder a un rival para que tu compañero ataque o prepare.'],
  intimidate: ['', 'Intimidación reduce el daño físico que recibe todo tu equipo; muy usada en dobles.'],
  speed: ['Sin velocidad o Pañuelo Elección, los rivales rápidos atacarán siempre primero.', 'Viento Afín, Espacio Raro o Viento Hielo deciden quién ataca primero.'],
  redirect: ['', 'Señuelo/Polvo Ira protegen a tu compañero mientras prepara o ataca.'],
  spread: ['', 'Los ataques que golpean a los dos rivales hacen mucho daño total en dobles.'],
  field: ['Un clima o campo potencia a varios miembros si el equipo está construido para ello.', 'Un clima o campo potencia a varios miembros si el equipo está construido para ello.'],
  priority: ['La prioridad remata a rivales rápidos con poca vida.', 'La prioridad remata a rivales rápidos con poca vida.'],
  hazards: ['Trampa Rocas/Púas desgastan a cada rival que entra: clave en individuales.', ''],
  pivot: ['Ida y Vuelta / Voltiocambio permiten cambiar sin perder el turno.', ''],
  setup: ['Un potenciador (Danza Espada, Maquinación…) puede barrer al final del combate.', ''],
  recovery: ['La recuperación permite aguantar combates largos.', ''],
  status: ['Quemar, paralizar o forzar cambios desgasta al rival.', ''],
};
