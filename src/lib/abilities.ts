/**
 * Habilidades legales por especie (generadas con `npm run gen:abilities`) y recomendación de la mejor
 * habilidad para un set según su objeto, movimientos, el meta y el resto del equipo.
 */
import data from '../data/abilities.json';
import { metaEntry, type Format } from '../data/meta';
import { isStatusMove } from './battle';
import { getMove, getSpecies } from './dex';
import type { PokemonSet } from './sets';
import { abilityEsName } from './es';

const SPECIES_ABILITIES = data.species as Record<string, string[]>;
const DESC_EN = data.desc as Record<string, string>;

/** Habilidades que puede tener una especie (incluye la oculta). */
export function legalAbilities(species: string): string[] {
  const own = SPECIES_ABILITIES[species];
  if (own?.length) return own;
  const base = getSpecies(species)?.baseSpecies;
  if (base && SPECIES_ABILITIES[base]) return SPECIES_ABILITIES[base];
  const a0 = getSpecies(species)?.abilities?.[0];
  return a0 ? [a0 as string] : [];
}

/** [nombre en español, qué hace] para las habilidades más relevantes en competitivo. */
export const ABILITY_ES: Record<string, [string, string]> = {
  Intimidate: ['Intimidación', 'Baja el Ataque de los rivales al entrar'],
  Drizzle: ['Llovizna', 'Provoca lluvia 5 turnos al entrar'],
  Drought: ['Sequía', 'Provoca sol intenso 5 turnos al entrar'],
  'Sand Stream': ['Chorro Arena', 'Provoca tormenta de arena al entrar'],
  'Snow Warning': ['Nevada', 'Provoca nieve al entrar'],
  'Grassy Surge': ['Herbogénesis', 'Activa el Campo de Hierba al entrar'],
  'Psychic Surge': ['Psicogénesis', 'Activa el Campo Psíquico al entrar'],
  'Electric Surge': ['Electrogénesis', 'Activa el Campo Eléctrico al entrar'],
  'Misty Surge': ['Nebulogénesis', 'Activa el Campo de Niebla al entrar'],
  Unburden: ['Liviano', 'Dobla su Velocidad al perder su objeto'],
  Adaptability: ['Adaptable', 'El STAB pasa de x1.5 a x2'],
  Protean: ['Mutatipo', 'Cambia a tipo del ataque que usa (STAB en todo)'],
  Libero: ['Líbero', 'Cambia a tipo del ataque que usa (STAB en todo)'],
  Multiscale: ['Compensación', 'Recibe la mitad de daño con los PS al máximo'],
  Regenerator: ['Regeneración', 'Recupera 1/3 de PS al cambiarse'],
  Levitate: ['Levitación', 'Inmune a ataques de tipo Tierra'],
  Prankster: ['Bromista', 'Sus movimientos de estado tienen +1 de prioridad'],
  'Good as Gold': ['Cuerpo Áureo', 'Inmune a movimientos de estado rivales'],
  'Armor Tail': ['Cola Armadura', 'Su equipo es inmune a ataques con prioridad'],
  'Queenly Majesty': ['Regia Presencia', 'Su equipo es inmune a ataques con prioridad'],
  'Rough Skin': ['Piel Tosca', 'Daña 1/8 PS a quien le golpea con contacto'],
  'Iron Barbs': ['Punta Acero', 'Daña 1/8 PS a quien le golpea con contacto'],
  'Speed Boost': ['Impulso', 'Sube su Velocidad cada turno'],
  'Huge Power': ['Potencia', 'Dobla su Ataque'],
  'Pure Power': ['Energía Pura', 'Dobla su Ataque'],
  'Magic Guard': ['Muro Mágico', 'Solo recibe daño de ataques directos'],
  Sturdy: ['Robustez', 'Sobrevive a un golpe con 1 PS si está al máximo'],
  Technician: ['Experto', 'Ataques de 60 o menos de potencia hacen x1.5'],
  'Tough Claws': ['Garra Dura', 'Ataques de contacto x1.3'],
  'Sheer Force': ['Potencia Bruta', 'Ataques con efecto secundario x1.3 (sin el efecto)'],
  'Swift Swim': ['Nado Rápido', 'Dobla su Velocidad con lluvia'],
  Chlorophyll: ['Clorofila', 'Dobla su Velocidad con sol'],
  'Sand Rush': ['Ímpetu Arena', 'Dobla su Velocidad con arena'],
  'Slush Rush': ['Quitanieves', 'Dobla su Velocidad con nieve'],
  'Sand Force': ['Poder Arena', 'Ataques Roca/Tierra/Acero x1.3 en arena'],
  'Solar Power': ['Poder Solar', 'At. Esp. x1.5 con sol (pierde PS)'],
  Defiant: ['Competitivo', '+2 Ataque si le bajan stats (castiga Intimidación)'],
  Competitive: ['Tenacidad', '+2 At. Esp. si le bajan stats (castiga Intimidación)'],
  'Flash Fire': ['Absorbe Fuego', 'Inmune a Fuego y potencia los suyos'],
  'Water Absorb': ['Absorbe Agua', 'Inmune a Agua y se cura'],
  'Volt Absorb': ['Absorbe Elec', 'Inmune a Eléctrico y se cura'],
  'Lightning Rod': ['Pararrayos', 'Atrae ataques Eléctrico (inmune, +At. Esp.)'],
  'Storm Drain': ['Colector', 'Atrae ataques Agua (inmune, +At. Esp.)'],
  'Sap Sipper': ['Herbívoro', 'Inmune a Planta, +1 Ataque'],
  'Inner Focus': ['Foco Interno', 'No retrocede (inmune a Fake Out) ni a Intimidación'],
  'Own Tempo': ['Ritmo Propio', 'No se confunde ni le afecta Intimidación'],
  Oblivious: ['Despiste', 'Inmune a Mofa e Intimidación'],
  Scrappy: ['Intrépido', 'Golpea a Fantasma con Normal/Lucha; inmune a Intimidación'],
  'Clear Body': ['Cuerpo Puro', 'No le pueden bajar stats'],
  'Full Metal Body': ['Guardia Metálica', 'No le pueden bajar stats'],
  Hospitality: ['Hospitalidad', 'Cura 1/4 de PS al aliado al entrar'],
  'Friend Guard': ['Compiescolta', 'Su aliado recibe un 25% menos de daño'],
  'Thick Fat': ['Sebo', 'Recibe la mitad de daño de Fuego y Hielo'],
  'Poison Touch': ['Toque Tóxico', '30% de envenenar al golpear con contacto'],
  'Mold Breaker': ['Rompemoldes', 'Ignora habilidades defensivas rivales'],
  Pressure: ['Presión', 'Los rivales gastan más PP'],
  Stamina: ['Firmeza', '+1 Defensa cada vez que recibe un golpe'],
  'Emergency Exit': ['Retirada', 'Se cambia al bajar de la mitad de PS'],
  Disguise: ['Disfraz', 'Bloquea el primer golpe'],
  'Stance Change': ['Cambio Táctico', 'Alterna forma escudo/espada'],
  'Thermal Exchange': ['Termoconversión', 'Inmune a quemadura; +Ataque al recibir Fuego'],
  'Toxic Debris': ['Capa Tóxica', 'Pone Púas Tóxicas al recibir golpes físicos'],
  'Iron Fist': ['Puño Férreo', 'Ataques de puño x1.2'],
  Pixilate: ['Piel Feérica', 'Sus ataques Normal pasan a Hada x1.2'],
  Aerilate: ['Piel Celeste', 'Sus ataques Normal pasan a Volador x1.2'],
  Refrigerate: ['Piel Helada', 'Sus ataques Normal pasan a Hielo x1.2'],
  Galvanize: ['Piel Eléctrica', 'Sus ataques Normal pasan a Eléctrico x1.2'],
  'Cursed Body': ['Cuerpo Maldito', '30% de anular el ataque que le golpea'],
  Trace: ['Rastro', 'Copia la habilidad de un rival'],
  'Ice Body': ['Gélido', 'Recupera PS con nieve'],
  'Snow Cloak': ['Manto Níveo', 'Más evasión con nieve'],
  'Sand Veil': ['Velo Arena', 'Más evasión con arena'],
  Synchronize: ['Sincronía', 'Contagia su problema de estado'],
  'Flower Veil': ['Velo Flor', 'Protege a los tipo Planta de bajadas de stats'],
  Symbiosis: ['Simbiosis', 'Pasa su objeto al aliado'],
  Torrent: ['Torrente', 'Ataques Agua x1.5 con poca vida'],
  Blaze: ['Mar Llamas', 'Ataques Fuego x1.5 con poca vida'],
  Overgrow: ['Espesura', 'Ataques Planta x1.5 con poca vida'],
  Swarm: ['Enjambre', 'Ataques Bicho x1.5 con poca vida'],
  Sniper: ['Francotirador', 'Sus golpes críticos hacen x2.25 en vez de x1.5'],
  'Flame Body': ['Cuerpo Llama', '30% de quemar al recibir contacto'],
  Static: ['Elec. Estática', '30% de paralizar al recibir contacto'],
  Justified: ['Justiciero', '+1 Ataque al recibir un ataque Siniestro'],
  'Guard Dog': ['Guardián', 'Intimidación le sube el Ataque; no puede ser forzado a cambiar'],
  'No Guard': ['Indefenso', 'Todos los ataques aciertan'],
  'Fairy Aura': ['Aura Feérica', 'Ataques Hada x1.33 para todos'],
  'Shadow Tag': ['Sombratrampa', 'El rival no puede huir ni cambiar'],
  'Supreme Overlord': ['General Supremo', '+10% de daño por cada aliado debilitado'],
  'Wind Rider': ['Surcavientos', 'Inmune a viento; +1 Ataque con Viento Afín'],
  Contrary: ['Respondón', 'Invierte los cambios de stats'],
  'Dry Skin': ['Piel Seca', 'Inmune a Agua y se cura con lluvia; débil al sol'],
  'Earth Eater': ['Geofagia', 'Inmune a Tierra y se cura'],
  'Well-Baked Body': ['Cuerpo Horneado', 'Inmune a Fuego, +2 Defensa'],
  'Purifying Salt': ['Sal Purificadora', 'Inmune a estados; mitad de daño Fantasma'],
  'Sword of Ruin': ['Espada Debacle', 'Baja la Defensa de los demás'],
};

export const abilityName = (a: string) => {
  const es = ABILITY_ES[a]?.[0] ?? abilityEsName(a);
  return es && es !== a ? `${es} (${a})` : a;
};
export const abilityDesc = (a: string) => ABILITY_ES[a]?.[1] ?? DESC_EN[a] ?? '';

/** Valor base aproximado de cada habilidad en competitivo [individuales, dobles]. */
const BASE: Record<string, [number, number]> = {
  Intimidate: [28, 40], Drizzle: [30, 32], Drought: [30, 32], 'Sand Stream': [30, 28], 'Snow Warning': [26, 28],
  'Grassy Surge': [28, 32], 'Psychic Surge': [28, 32], 'Electric Surge': [28, 28], 'Misty Surge': [20, 22],
  Unburden: [22, 22], Adaptability: [34, 34], Protean: [32, 30], Libero: [32, 30], Multiscale: [32, 30],
  Regenerator: [36, 26], Levitate: [24, 24], Prankster: [30, 34], 'Good as Gold': [36, 34], 'Armor Tail': [24, 34],
  'Queenly Majesty': [24, 32], 'Rough Skin': [18, 16], 'Iron Barbs': [16, 14], 'Speed Boost': [36, 32],
  'Huge Power': [45, 45], 'Pure Power': [45, 45], 'Magic Guard': [30, 22], Sturdy: [18, 10], Technician: [22, 22],
  'Tough Claws': [26, 26], 'Sheer Force': [22, 22], 'Swift Swim': [14, 14], Chlorophyll: [14, 14], 'Sand Rush': [14, 14],
  'Slush Rush': [14, 14], 'Sand Force': [12, 12], 'Solar Power': [12, 14], Defiant: [24, 30], Competitive: [24, 30],
  'Flash Fire': [16, 16], 'Water Absorb': [18, 18], 'Volt Absorb': [18, 18], 'Lightning Rod': [18, 28], 'Storm Drain': [18, 28],
  'Sap Sipper': [18, 20], 'Inner Focus': [12, 22], 'Own Tempo': [8, 14], Oblivious: [8, 14], Scrappy: [12, 16],
  'Clear Body': [18, 20], 'Full Metal Body': [18, 20], Hospitality: [6, 18], 'Friend Guard': [0, 22], 'Thick Fat': [22, 22],
  'Poison Touch': [12, 14], 'Mold Breaker': [18, 16], Pressure: [8, 4], Stamina: [22, 20], 'Emergency Exit': [16, 10],
  Disguise: [40, 36], 'Stance Change': [40, 36], 'Thermal Exchange': [20, 18], 'Toxic Debris': [20, 10], 'Iron Fist': [14, 14],
  Pixilate: [30, 32], Aerilate: [30, 32], Refrigerate: [28, 30], Galvanize: [28, 30], 'Cursed Body': [12, 12], Trace: [14, 16],
  'Flame Body': [14, 12], Static: [12, 10], Justified: [10, 10], 'Guard Dog': [20, 26], 'No Guard': [20, 20],
  'Shadow Tag': [40, 30], 'Supreme Overlord': [28, 28], Contrary: [28, 26], 'Wind Rider': [16, 20], 'Earth Eater': [18, 18],
  'Purifying Salt': [30, 26], 'Well-Baked Body': [20, 20], 'Dry Skin': [14, 14],
  'Ice Body': [10, 10], 'Snow Cloak': [4, 4], 'Sand Veil': [4, 4], Bulletproof: [16, 16], Soundproof: [12, 14],
  Overcoat: [12, 12], Swarm: [8, 8], Sniper: [6, 6], Synchronize: [4, 4], Frisk: [6, 6], Symbiosis: [4, 6], 'Flower Veil': [6, 8],
};

export interface AbilityScore { ability: string; score: number; reasons: string[]; legal: boolean }

const WEATHER_SETTERS: Record<string, string> = { Drizzle: 'Rain', Drought: 'Sun', 'Sand Stream': 'Sand', 'Snow Warning': 'Snow' };
const WEATHER_SPEED: Record<string, string> = { 'Swift Swim': 'Rain', Chlorophyll: 'Sun', 'Sand Rush': 'Sand', 'Slush Rush': 'Snow' };
const SECONDARY_MOVES = ['Rock Slide', 'Iron Head', 'Air Slash', 'Sludge Bomb', 'Flamethrower', 'Thunderbolt', 'Ice Beam', 'Fire Punch', 'Ice Punch', 'Thunder Punch', 'Earth Power', 'Psychic', 'Shadow Ball', 'Moonblast', 'Scald', 'Poison Jab', 'Zen Headbutt', 'Crunch', 'Dire Claw', 'Flare Blitz', 'Heat Wave'];

/** Puntúa una habilidad para un set concreto. `team` sirve para valorar climas/campos de los compañeros. */
export function scoreAbility(set: PokemonSet, ability: string, format: Format, team: PokemonSet[] = []): AbilityScore {
  const legal = legalAbilities(set.species).includes(ability);
  const dbl = format === 'doubles';
  const reasons: string[] = [];
  let score = (BASE[ability]?.[dbl ? 1 : 0]) ?? 8;
  const atk = set.moves.filter((m) => !isStatusMove(m));
  const mates = team.filter((t) => t.species !== set.species);

  const meta = metaEntry(set.species, format)?.set?.ability;
  if (meta === ability) { score += 40; reasons.push('la más usada en el meta'); }

  if (ability === 'Unburden') {
    const consumable = /Seed|Berry|Herb|Gem|Sash|Balloon/.test(set.item);
    if (consumable) { score += 25; reasons.push(`con ${set.item} se activa al consumirlo`); }
    else reasons.push('necesita un objeto que se consuma (semilla, baya, hierba)');
  }
  if (WEATHER_SPEED[ability]) {
    const w = WEATHER_SPEED[ability];
    const setter = mates.find((t) => WEATHER_SETTERS[t.ability] === w || (w === 'Sun' && t.item === 'Charizardite Y') || (w === 'Sand' && t.item === 'Tyranitarite'));
    if (setter) { score += 28; reasons.push(`${setter.species} pone el clima que necesita`); }
    else { score -= 4; reasons.push('nadie en tu equipo pone ese clima'); }
  }
  if (['Pixilate', 'Aerilate', 'Refrigerate', 'Galvanize'].includes(ability)) {
    const normal = atk.filter((m) => getMove(m)?.type === 'Normal');
    if (normal.length) { score += 10; reasons.push(`convierte ${normal.join(', ')}`); } else { score -= 20; reasons.push('no tiene ataques Normal'); }
  }
  if (ability === 'Sheer Force') {
    const n = atk.filter((m) => SECONDARY_MOVES.includes(m)).length;
    if (n) { score += n * 4; reasons.push(`potencia ${n} ataque(s) con efecto secundario`); } else score -= 12;
  }
  if (ability === 'Technician') {
    const weak = atk.filter((m) => (getMove(m)?.basePower ?? 0) <= 60);
    if (weak.length) { score += weak.length * 5; reasons.push(`potencia ${weak.join(', ')}`); } else score -= 12;
  }
  if (ability === 'Tough Claws') {
    const c = atk.filter((m) => getMove(m)?.flags?.contact).length;
    score += c * 2;
  }
  if (ability === 'Iron Fist') {
    const p = atk.filter((m) => getMove(m)?.flags?.punch).length;
    if (p) { score += p * 5; reasons.push(`${p} ataque(s) de puño`); } else score -= 10;
  }
  if (ability === 'Adaptability') {
    const stab = atk.filter((m) => getSpecies(set.species)?.types.includes(getMove(m)?.type as never)).length;
    if (stab) reasons.push(`${stab} ataque(s) con STAB x2`);
  }
  if (ability === 'Prankster' && set.moves.some((m) => isStatusMove(m) && m !== 'Protect')) { score += 8; reasons.push('tiene movimientos de apoyo para aprovecharla'); }
  if ((ability === 'Defiant' || ability === 'Competitive') && dbl) reasons.push('muy útil contra Intimidación (Incineroar, Salamence…)');
  if (ability === 'Intimidate') reasons.push(dbl ? 'la mejor habilidad de apoyo en dobles' : 'debilita a los atacantes físicos');
  if (ability === 'Regenerator' && !dbl) reasons.push('ideal para pivotar en individuales');
  if (ability === 'Inner Focus' && dbl) reasons.push('inmune a Fake Out e Intimidación');
  if (WEATHER_SETTERS[ability]) {
    const clash = mates.find((t) => WEATHER_SETTERS[t.ability] && WEATHER_SETTERS[t.ability] !== WEATHER_SETTERS[ability]);
    if (clash) { score -= 15; reasons.push(`⚠ choca con el clima de ${clash.species}`); }
  }
  if (!legal) reasons.unshift('no puede tenerla');
  return { ability, score: legal ? score : -100, reasons, legal };
}

export function rankAbilities(set: PokemonSet, format: Format, team: PokemonSet[] = []) {
  return legalAbilities(set.species).map((a) => scoreAbility(set, a, format, team)).sort((a, b) => b.score - a.score);
}
