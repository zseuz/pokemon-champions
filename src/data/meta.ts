import type { PokemonSet } from '../lib/sets';
import pokechamp from './pokechamp.json';

export type Format = 'singles' | 'doubles';
export const FORMAT_ES: Record<Format, string> = { singles: 'Individuales', doubles: 'Dobles' };

/**
 * Meta de Pokémon Champions por formato, generado de pokechamp.gg (`npm run gen:meta`):
 * los 262 Pokémon del ladder de cada formato, con tier (S → F), puesto, tendencia y el set más usado.
 * Los roles, compañeros y % de uso de dobles (Pikalytics) se conservan de los datos escritos a mano.
 */
interface PcRow {
  rank: number; species: string; tier: string; trend?: string;
  ability?: { name: string; pct: number }; item?: { name: string; pct: number }; nature?: { name: string; pct: number };
  spread?: { sp: Record<string, number>; pct: number }; moves: { name: string; pct: number }[];
}
const PC = pokechamp as unknown as { source: string; fetched: string } & Record<Format, { updated: string; season: string; rows: PcRow[] }>;

const fmtDate = (d: string) => {
  const t = Date.parse(d);
  return Number.isNaN(t) ? d : new Date(t).toISOString().slice(0, 10);
};
const seasonEs = (s: string) => s.replace('Season', 'Temporada').replace('(Current)', '(actual)');

export const META_INFOS: Record<Format, { format: string; updated: string; sources: { name: string; url: string }[] }> = {
  doubles: {
    format: `Dobles · ${seasonEs(PC.doubles.season)} · Reg M-C`,
    updated: fmtDate(PC.doubles.updated),
    sources: [
      { name: 'pokechamp.gg (tier list y sets)', url: 'https://pokechamp.gg/tier-list/doubles/pokemon' },
      { name: 'Pikalytics (% de uso)', url: 'https://www.pikalytics.com/' },
    ],
  },
  singles: {
    format: `Individuales · ${seasonEs(PC.singles.season)} · Reg M-C`,
    updated: fmtDate(PC.singles.updated),
    sources: [
      { name: 'pokechamp.gg (tier list y sets)', url: 'https://pokechamp.gg/tier-list/singles/pokemon' },
    ],
  },
};

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface MetaEntry {
  species: string;
  tier: Tier;
  /** % de equipos que lo usan (solo si la fuente lo publica) */
  usage?: number;
  /** puesto en el ranking de uso (cuando no hay %) */
  rank?: number;
  /** Rol principal en el meta (texto corto en español) */
  role: string;
  /** Set más común. Sin set = el usuario lo arma a mano. */
  set?: PokemonSet;
  partners?: string[];
  /** tendencia respecto a la temporada anterior (p. ej. "↑ sube 2") */
  trend?: string;
  /** % de jugadores que usan cada parte del set más común */
  setPct?: { ability?: number; item?: number; nature?: number; spread?: number; moves: number[] };
}

const sp = (s: Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>) => ({
  hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...s,
});

/** Datos de dobles escritos a mano (roles, compañeros y % de uso de Pikalytics). */
const CURATED_DOUBLES: MetaEntry[] = [
  // ───────── Tier S ─────────
  {
    species: 'Rillaboom', tier: 'S', usage: 35.2, role: 'Fake Out + Campo de Hierba',
    partners: ['Sneasler', 'Incineroar', 'Salamence', 'Gholdengo'],
    set: { species: 'Rillaboom', ability: 'Grassy Surge', item: 'Miracle Seed', nature: 'Adamant',
      sp: sp({ hp: 32, atk: 32, spe: 2 }), moves: ['Fake Out', 'Grassy Glide', 'Wood Hammer', 'U-turn'] },
  },
  {
    species: 'Sneasler', tier: 'S', usage: 31.8, role: 'Atacante rápido / Fake Out',
    partners: ['Rillaboom', 'Salamence', 'Indeedee-F'],
    set: { species: 'Sneasler', ability: 'Unburden', item: 'White Herb', nature: 'Jolly',
      sp: sp({ hp: 2, atk: 32, spe: 32 }), moves: ['Close Combat', 'Dire Claw', 'Fake Out', 'Protect'] },
  },
  {
    species: 'Incineroar', tier: 'S', usage: 25.1, role: 'Soporte Intimidación',
    partners: ['Rillaboom', 'Farigiraf'],
    set: { species: 'Incineroar', ability: 'Intimidate', item: 'Sitrus Berry', nature: 'Careful',
      sp: sp({ hp: 32, def: 14, spd: 20 }), moves: ['Fake Out', 'Parting Shot', 'Flare Blitz', 'Throat Chop'] },
  },
  {
    species: 'Floette-Eternal', tier: 'S', usage: 7.0, role: 'Mega atacante especial Hada',
    partners: ['Incineroar', 'Rillaboom'],
    set: { species: 'Floette-Eternal', ability: 'Flower Veil', item: 'Floettite', nature: 'Modest',
      sp: sp({ hp: 32, spa: 32, spe: 2 }), moves: ['Light of Ruin', 'Dazzling Gleam', 'Moonblast', 'Protect'] },
  },
  // ───────── Tier A ─────────
  {
    species: 'Salamence', tier: 'A', usage: 20.8, role: 'Mega (Piel Celeste) + Viento Afín',
    partners: ['Rillaboom', 'Sneasler'],
    set: { species: 'Salamence', ability: 'Intimidate', item: 'Salamencite', nature: 'Timid',
      sp: sp({ hp: 2, spa: 32, spe: 32 }), moves: ['Hyper Voice', 'Draco Meteor', 'Tailwind', 'Protect'] },
  },
  {
    species: 'Golisopod', tier: 'A', usage: 20.8, role: 'Mega físico (Garra Dura)',
    set: { species: 'Golisopod', ability: 'Emergency Exit', item: 'Golisopite', nature: 'Adamant',
      sp: sp({ hp: 32, atk: 32, def: 2 }), moves: ['First Impression', 'Leech Life', 'Iron Head', 'Protect'] },
  },
  {
    species: 'Farigiraf', tier: 'A', usage: 19.7, role: 'Espacio Raro / bloquea prioridad',
    partners: ['Incineroar', 'Kingambit'],
    set: { species: 'Farigiraf', ability: 'Armor Tail', item: 'Sitrus Berry', nature: 'Quiet',
      sp: sp({ hp: 32, def: 16, spa: 18 }), moves: ['Trick Room', 'Psychic', 'Helping Hand', 'Protect'] },
  },
  {
    species: 'Kingambit', tier: 'A', usage: 20.1, role: 'Atacante Siniestro (Competitivo/Defiant)',
    set: { species: 'Kingambit', ability: 'Defiant', item: 'Chople Berry', nature: 'Adamant',
      sp: sp({ hp: 32, atk: 32, spd: 2 }), moves: ['Kowtow Cleave', 'Sucker Punch', 'Iron Head', 'Protect'] },
  },
  {
    species: 'Indeedee-F', tier: 'A', usage: 20.3, role: 'Redirección + Campo Psíquico',
    partners: ['Sneasler', 'Farigiraf'],
    set: { species: 'Indeedee-F', ability: 'Psychic Surge', item: 'Sitrus Berry', nature: 'Sassy',
      sp: sp({ hp: 32, def: 16, spd: 18 }), moves: ['Follow Me', 'Helping Hand', 'Trick Room', 'Psychic'] },
  },
  {
    species: 'Basculegion', tier: 'A', usage: 18.5, role: 'Limpiador (Last Respects)',
    set: { species: 'Basculegion', ability: 'Adaptability', item: 'Life Orb', nature: 'Adamant',
      sp: sp({ hp: 2, atk: 32, spe: 32 }), moves: ['Wave Crash', 'Last Respects', 'Aqua Jet', 'Protect'] },
  },
  {
    species: 'Garchomp', tier: 'A', usage: 16.8, role: 'Mega Z rápido / daño en área',
    set: { species: 'Garchomp', ability: 'Rough Skin', item: 'Garchompite Z', nature: 'Timid',
      sp: sp({ hp: 2, spa: 32, spe: 32 }), moves: ['Draco Meteor', 'Earth Power', 'Flamethrower', 'Protect'] },
  },
  {
    species: 'Charizard', tier: 'A', usage: 15.8, role: 'Mega Y (Sol)',
    set: { species: 'Charizard', ability: 'Solar Power', item: 'Charizardite Y', nature: 'Timid',
      sp: sp({ hp: 2, spa: 32, spe: 32 }), moves: ['Heat Wave', 'Weather Ball', 'Solar Beam', 'Protect'] },
  },
  {
    species: 'Archaludon', tier: 'A', usage: 15.0, role: 'Atacante bajo lluvia',
    partners: ['Pelipper', 'Politoed'],
    set: { species: 'Archaludon', ability: 'Stamina', item: 'Leftovers', nature: 'Modest',
      sp: sp({ hp: 32, spa: 32, spd: 2 }), moves: ['Electro Shot', 'Draco Meteor', 'Flash Cannon', 'Protect'] },
  },
  {
    species: 'Gholdengo', tier: 'A', usage: 15.1, role: 'Atacante especial (inmune a estado)',
    set: { species: 'Gholdengo', ability: 'Good as Gold', item: 'Life Orb', nature: 'Modest',
      sp: sp({ hp: 32, spa: 32, spe: 2 }), moves: ['Make It Rain', 'Shadow Ball', 'Nasty Plot', 'Protect'] },
  },
  {
    species: 'Pelipper', tier: 'A', usage: 12.1, role: 'Lluvia + Viento Afín',
    partners: ['Archaludon', 'Basculegion'],
    set: { species: 'Pelipper', ability: 'Drizzle', item: 'Focus Sash', nature: 'Modest',
      sp: sp({ hp: 32, spa: 32, spe: 2 }), moves: ['Hurricane', 'Weather Ball', 'Tailwind', 'Wide Guard'] },
  },
  // ───────── Tier B ─────────
  {
    species: 'Whimsicott', tier: 'B', usage: 11.4, role: 'Viento Afín con Bromista',
    set: { species: 'Whimsicott', ability: 'Prankster', item: 'Focus Sash', nature: 'Timid',
      sp: sp({ hp: 32, spa: 2, spe: 32 }), moves: ['Tailwind', 'Moonblast', 'Encore', 'Protect'] },
  },
  {
    species: 'Milotic', tier: 'B', usage: 11.2, role: 'Tanque anti-Intimidación',
    set: { species: 'Milotic', ability: 'Competitive', item: 'Leftovers', nature: 'Modest',
      sp: sp({ hp: 32, spa: 32, def: 2 }), moves: ['Muddy Water', 'Ice Beam', 'Recover', 'Protect'] },
  },
  {
    species: 'Raichu', tier: 'B', usage: 10.6, role: 'Fake Out + Pararrayos',
    set: { species: 'Raichu', ability: 'Lightning Rod', item: 'Focus Sash', nature: 'Timid',
      sp: sp({ hp: 2, spa: 32, spe: 32 }), moves: ['Fake Out', 'Thunderbolt', 'Nuzzle', 'Protect'] },
  },
  {
    species: 'Sylveon', tier: 'B', usage: 9.6, role: 'Hyper Voice Hada (Piel Feérica)',
    set: { species: 'Sylveon', ability: 'Pixilate', item: 'Fairy Feather', nature: 'Modest',
      sp: sp({ hp: 32, spa: 32, spd: 2 }), moves: ['Hyper Voice', 'Moonblast', 'Shadow Ball', 'Protect'] },
  },
  {
    species: 'Politoed', tier: 'B', usage: 9.6, role: 'Lluvia + soporte',
    set: { species: 'Politoed', ability: 'Drizzle', item: 'Sitrus Berry', nature: 'Modest',
      sp: sp({ hp: 32, spa: 32, def: 2 }), moves: ['Weather Ball', 'Ice Beam', 'Helping Hand', 'Protect'] },
  },
  {
    species: 'Arcanine-Hisui', tier: 'B', usage: 9.3, role: 'Intimidación ofensiva',
    set: { species: 'Arcanine-Hisui', ability: 'Intimidate', item: 'Sitrus Berry', nature: 'Adamant',
      sp: sp({ hp: 32, atk: 32, spe: 2 }), moves: ['Flare Blitz', 'Rock Slide', 'Extreme Speed', 'Protect'] },
  },
  {
    species: 'Staraptor', tier: 'B', usage: 9.0, role: 'Mega (Contrary) + Viento Afín',
    set: { species: 'Staraptor', ability: 'Intimidate', item: 'Staraptite', nature: 'Jolly',
      sp: sp({ hp: 2, atk: 32, spe: 32 }), moves: ['Brave Bird', 'Close Combat', 'Tailwind', 'Protect'] },
  },
  {
    species: 'Grimmsnarl', tier: 'B', usage: 9.0, role: 'Pantallas con Bromista',
    set: { species: 'Grimmsnarl', ability: 'Prankster', item: 'Light Clay', nature: 'Careful',
      sp: sp({ hp: 32, def: 16, spd: 18 }), moves: ['Reflect', 'Light Screen', 'Spirit Break', 'Thunder Wave'] },
  },
  {
    species: 'Tyranitar', tier: 'B', usage: 8.5, role: 'Mega (Arena) físico',
    set: { species: 'Tyranitar', ability: 'Sand Stream', item: 'Tyranitarite', nature: 'Adamant',
      sp: sp({ hp: 32, atk: 32, spd: 2 }), moves: ['Rock Slide', 'Knock Off', 'Low Kick', 'Protect'] },
  },
  {
    species: 'Gardevoir', tier: 'B', usage: 7.7, role: 'Mega (Piel Feérica) Espacio Raro',
    set: { species: 'Gardevoir', ability: 'Trace', item: 'Gardevoirite', nature: 'Quiet',
      sp: sp({ hp: 32, spa: 32, def: 2 }), moves: ['Hyper Voice', 'Psychic', 'Trick Room', 'Protect'] },
  },
  {
    species: 'Sinistcha', tier: 'B', usage: 7.4, role: 'Redirección + curación',
    set: { species: 'Sinistcha', ability: 'Hospitality', item: 'Sitrus Berry', nature: 'Bold',
      sp: sp({ hp: 32, def: 32, spd: 2 }), moves: ['Matcha Gotcha', 'Rage Powder', 'Trick Room', 'Strength Sap'] },
  },
  {
    species: 'Torkoal', tier: 'B', usage: 6.0, role: 'Sol + Erupción en Espacio Raro',
    set: { species: 'Torkoal', ability: 'Drought', item: 'Charcoal', nature: 'Quiet',
      sp: sp({ hp: 32, spa: 32, def: 2 }), moves: ['Eruption', 'Heat Wave', 'Earth Power', 'Protect'] },
  },
  {
    species: 'Excadrill', tier: 'B', usage: 6.0, role: 'Arena (Ímpetu Arena)',
    set: { species: 'Excadrill', ability: 'Sand Rush', item: 'Life Orb', nature: 'Adamant',
      sp: sp({ hp: 2, atk: 32, spe: 32 }), moves: ['High Horsepower', 'Iron Head', 'Rock Slide', 'Protect'] },
  },
  {
    species: 'Volcarona', tier: 'B', usage: 6.0, role: 'Danza Aleteo',
    set: { species: 'Volcarona', ability: 'Flame Body', item: 'Sitrus Berry', nature: 'Modest',
      sp: sp({ hp: 32, spa: 32, spe: 2 }), moves: ['Heat Wave', 'Bug Buzz', 'Quiver Dance', 'Protect'] },
  },
  {
    species: 'Dragonite', tier: 'B', usage: 4.0, role: 'Velocidad Extrema',
    set: { species: 'Dragonite', ability: 'Multiscale', item: 'Life Orb', nature: 'Adamant',
      sp: sp({ hp: 32, atk: 32, spe: 2 }), moves: ['Extreme Speed', 'Dragon Claw', 'Fire Punch', 'Protect'] },
  },
  {
    species: 'Ninetales-Alola', tier: 'B', usage: 5.0, role: 'Nieve + Velo Aurora',
    set: { species: 'Ninetales-Alola', ability: 'Snow Warning', item: 'Light Clay', nature: 'Timid',
      sp: sp({ hp: 2, spa: 32, spe: 32 }), moves: ['Aurora Veil', 'Blizzard', 'Moonblast', 'Protect'] },
  },
  {
    species: 'Metagross', tier: 'B', usage: 5.0, role: 'Mega físico Acero',
    set: { species: 'Metagross', ability: 'Clear Body', item: 'Metagrossite', nature: 'Jolly',
      sp: sp({ hp: 2, atk: 32, spe: 32 }), moves: ['Iron Head', 'Zen Headbutt', 'Bullet Punch', 'Protect'] },
  },
  {
    species: 'Gengar', tier: 'B', usage: 4.0, role: 'Mega atacante especial',
    set: { species: 'Gengar', ability: 'Cursed Body', item: 'Gengarite', nature: 'Timid',
      sp: sp({ hp: 2, spa: 32, spe: 32 }), moves: ['Shadow Ball', 'Sludge Bomb', 'Icy Wind', 'Protect'] },
  },
  { species: 'Hydreigon', tier: 'C', usage: 2.0, role: 'Atacante especial' ,
    set: { species: 'Hydreigon', ability: 'Levitate', item: 'Life Orb', nature: 'Timid',
      sp: sp({ hp: 2, spa: 32, spe: 32 }), moves: ['Draco Meteor', 'Dark Pulse', 'Snarl', 'Protect'] } },
  { species: 'Lucario', tier: 'B', usage: 5.0, role: 'Mega' },
  { species: 'Froslass', tier: 'B', usage: 5.0, role: 'Mega' },
  { species: 'Baxcalibur', tier: 'B', usage: 5.0, role: 'Atacante Hielo' },
  { species: 'Indeedee', tier: 'B', usage: 5.0, role: 'Campo Psíquico' },
  { species: 'Aerodactyl', tier: 'B', usage: 4.0, role: 'Mega / velocidad' },
  { species: 'Primarina', tier: 'B', usage: 4.0, role: 'Atacante especial' },
  { species: 'Glimmora', tier: 'B', usage: 4.0, role: 'Mega' },
  { species: 'Swampert', tier: 'B', usage: 4.0, role: 'Mega bajo lluvia' },
  { species: 'Pawmot', tier: 'B', usage: 4.0, role: 'Revival / Fake Out' },
  { species: 'Armarouge', tier: 'B', usage: 6.0, role: 'Expanding Force / TR' },
  // ───────── Tier C (uso 2-3%) ─────────
  ...([
    ['Venusaur', 3], ['Sableye', 3], ['Absol', 3], ['Delphox', 3], ['Talonflame', 3], ['Corviknight', 3],
    ['Hatterene', 3], ['Annihilape', 3], ['Blastoise', 2], ['Clefable', 2], ['Typhlosion-Hisui', 2],
    ['Camerupt', 2], ['Rotom-Wash', 2], ['Kommo-o', 2], ['Dragapult', 2], ['Ceruledge', 2],
    ['Blaziken', 2], ['Mawile', 2],
  ] as const).map(([species, usage]): MetaEntry => ({ species, tier: 'C', usage, role: '' })),
];

/** Meta de Individuales (ladder). Sets: el más usado de cada Pokémon según pokechamp.gg. */
const S = (rank: number, species: string, role: string, set?: PokemonSet): MetaEntry => ({
  species, rank, role, set, tier: rank <= 13 ? 'S' : rank <= 52 ? 'A' : rank <= 117 ? 'B' : 'C',
});
const ss = (species: string, ability: string, item: string, nature: string, spread: Parameters<typeof sp>[0], moves: string[]): PokemonSet =>
  ({ species, ability, item, nature, sp: sp(spread), moves });

const CURATED_SINGLES: MetaEntry[] = [
  S(1, 'Garchomp', 'Mega Z físico + Trampa Rocas', ss('Garchomp', 'Rough Skin', 'Garchompite Z', 'Jolly', { atk: 32, spe: 32, hp: 2 }, ['Earthquake', 'Stealth Rock', 'Dragon Tail', 'Draco Meteor'])),
  S(2, 'Salamence', 'Mega Danza Dragón', ss('Salamence', 'Intimidate', 'Salamencite', 'Adamant', { atk: 32, spe: 32, hp: 1, def: 1 }, ['Double-Edge', 'Earthquake', 'Dragon Dance', 'Roost'])),
  S(3, 'Primarina', 'Tanque especial Hada/Agua', ss('Primarina', 'Torrent', 'Sitrus Berry', 'Modest', { hp: 32, def: 20, spa: 14 }, ['Moonblast', 'Sparkling Aria', 'Aqua Jet', 'Encore'])),
  S(4, 'Baxcalibur', 'Barredor físico con prioridad', ss('Baxcalibur', 'Thermal Exchange', 'Focus Sash', 'Adamant', { atk: 32, spe: 32, hp: 1, def: 1 }, ['Ice Shard', 'Earthquake', 'Glaive Rush', 'Icicle Crash'])),
  S(5, 'Lucario', 'Mega Z especial (Maquinación)', ss('Lucario', 'Inner Focus', 'Lucarionite Z', 'Timid', { spa: 32, spe: 32, hp: 2 }, ['Dark Pulse', 'Nasty Plot', 'Aura Sphere', 'Flash Cannon'])),
  S(6, 'Golisopod', 'Mega físico + Retirada', ss('Golisopod', 'Emergency Exit', 'Golisopite', 'Adamant', { hp: 32, atk: 32, spd: 2 }, ['Iron Head', 'Sucker Punch', 'First Impression', 'Leech Life'])),
  S(7, 'Hippowdon', 'Muro físico + arena + Rocas', ss('Hippowdon', 'Sand Stream', 'Sitrus Berry', 'Impish', { hp: 32, spd: 32, def: 2 }, ['Earthquake', 'Yawn', 'Stealth Rock', 'Whirlwind'])),
  S(8, 'Archaludon', 'Atacante especial + Rocas', ss('Archaludon', 'Stamina', 'Sitrus Berry', 'Modest', { spa: 32, spe: 32, hp: 2 }, ['Draco Meteor', 'Flash Cannon', 'Thunderbolt', 'Stealth Rock'])),
  S(9, 'Gholdengo', 'Maquinación + inmune a estado', ss('Gholdengo', 'Good as Gold', 'Air Balloon', 'Modest', { spa: 32, spe: 32, hp: 2 }, ['Shadow Ball', 'Make It Rain', 'Nasty Plot', 'Recover'])),
  S(10, 'Mimikyu', 'Danza Espada con Disfraz', ss('Mimikyu', 'Disguise', 'Life Orb', 'Adamant', { atk: 32, spe: 32, hp: 1, def: 1 }, ['Play Rough', 'Shadow Sneak', 'Swords Dance', 'Shadow Claw'])),
  S(11, 'Rillaboom', 'Atacante con Campo de Hierba', ss('Rillaboom', 'Grassy Surge', 'Life Orb', 'Adamant', { hp: 32, atk: 32, spe: 2 }, ['Grassy Glide', 'U-turn', 'Knock Off', 'High Horsepower'])),
  S(12, 'Charizard', 'Mega Y (Sol)', ss('Charizard', 'Blaze', 'Charizardite Y', 'Modest', { spa: 32, spe: 32, hp: 2 }, ['Solar Beam', 'Flamethrower', 'Dragon Pulse', 'Roost'])),
  S(13, 'Meowscarada', 'Pañuelo Elección rápido', ss('Meowscarada', 'Protean', 'Choice Scarf', 'Jolly', { atk: 32, spe: 32, hp: 2 }, ['Flower Trick', 'Triple Axel', 'Knock Off', 'U-turn'])),
  S(14, 'Corviknight', 'Muro físico pivote', ss('Corviknight', 'Pressure', 'Rocky Helmet', 'Impish', { hp: 32, def: 32, spd: 2 }, ['Roost', 'U-turn', 'Body Press', 'Iron Defense'])),
  S(15, 'Glimmora', 'Líder con Trampa Rocas', ss('Glimmora', 'Toxic Debris', 'Focus Sash', 'Timid', { spa: 32, spe: 32, hp: 1, def: 1 }, ['Power Gem', 'Stealth Rock', 'Earth Power', 'Sludge Wave'])),
  S(16, 'Sneasler', 'Unburden + Danza Espada', ss('Sneasler', 'Unburden', 'Psychic Seed', 'Adamant', { atk: 32, spe: 32, hp: 2 }, ['Close Combat', 'Dire Claw', 'Throat Chop', 'Swords Dance'])),
  S(17, 'Cinderace', 'Atacante físico (Líbero)', ss('Cinderace', 'Libero', 'Focus Sash', 'Adamant', { atk: 32, spe: 32, hp: 2 }, ['Pyro Ball', 'High Jump Kick', 'Gunk Shot', 'Sucker Punch'])),
  S(18, 'Gyarados', 'Muro físico con Intimidación', ss('Gyarados', 'Intimidate', 'Rocky Helmet', 'Impish', { hp: 32, def: 32, atk: 2 }, ['Power Whip', 'Avalanche', 'Waterfall', 'Taunt'])),
  S(19, 'Metagross', 'Mega físico Acero', ss('Metagross', 'Clear Body', 'Metagrossite', 'Adamant', { atk: 32, spe: 32, hp: 2 }, ['Bullet Punch', 'Psychic Fangs', 'Ice Punch', 'Earthquake'])),
  S(20, 'Basculegion', 'Limpiador con Pañuelo', ss('Basculegion', 'Adaptability', 'Choice Scarf', 'Jolly', { atk: 32, spe: 32, hp: 2 }, ['Last Respects', 'Wave Crash', 'Aqua Jet', 'Flip Turn'])),
  S(21, 'Aegislash-Shield', 'Atacante mixto defensivo', ss('Aegislash-Shield', 'Stance Change', 'Leftovers', 'Adamant', { hp: 32, atk: 32, def: 1, spd: 1 }, ['Shadow Sneak', "King's Shield", 'Poltergeist', 'Sacred Sword'])),
  S(22, 'Indeedee', 'Campo Psíquico ofensivo', ss('Indeedee', 'Psychic Surge', 'Terrain Extender', 'Timid', { spa: 32, spe: 32, hp: 2 }, ['Expanding Force', 'Mystical Fire', 'Encore', 'Dazzling Gleam'])),
  S(23, 'Dragonite', 'Mega especial', ss('Dragonite', 'Multiscale', 'Dragoninite', 'Modest', { spa: 32, spe: 32, hp: 2 }, ['Roost', 'Flamethrower', 'Extreme Speed', 'Draco Meteor'])),
  S(24, 'Greninja', 'Mega especial rápido', ss('Greninja', 'Protean', 'Greninjite', 'Timid', { spa: 32, spe: 32, hp: 2 }, ['Ice Beam', 'Dark Pulse', 'Sludge Wave', 'Water Shuriken'])),
  S(25, 'Blastoise', 'Mega Rompecoraza', ss('Blastoise', 'Torrent', 'Blastoisinite', 'Modest', { spe: 30, spa: 25, hp: 11 }, ['Shell Smash', 'Aura Sphere', 'Dark Pulse', 'Terrain Pulse'])),
  S(26, 'Ninetales-Alola', 'Velo Aurora', ss('Ninetales-Alola', 'Snow Warning', 'Light Clay', 'Timid', { spa: 32, spe: 32, hp: 2 }, ['Aurora Veil', 'Freeze-Dry', 'Encore', 'Blizzard'])),
  S(27, 'Pawmot', 'Revivir + Banda Focus', ss('Pawmot', 'Iron Fist', 'Focus Sash', 'Jolly', { atk: 32, spe: 32, hp: 2 }, ['Double Shock', 'Revival Blessing', 'Ice Punch', 'Close Combat'])),
  S(28, 'Rotom-Wash', 'Pivote defensivo', ss('Rotom-Wash', 'Levitate', 'Sitrus Berry', 'Bold', { hp: 32, def: 32, spd: 2 }, ['Hydro Pump', 'Volt Switch', 'Will-O-Wisp', 'Thunderbolt'])),
  S(29, 'Volcarona', 'Danza Aleteo defensiva', ss('Volcarona', 'Flame Body', 'Sitrus Berry', 'Bold', { hp: 32, def: 32, spe: 2 }, ['Quiver Dance', 'Fiery Dance', 'Giga Drain', 'Morning Sun'])),
  S(30, 'Gengar', 'Mega especial', ss('Gengar', 'Cursed Body', 'Gengarite', 'Timid', { spa: 32, spe: 32, hp: 2 }, ['Shadow Ball', 'Sludge Wave', 'Destiny Bond', 'Icy Wind'])),
  ...([
    [31, 'Swampert'], [32, 'Skeledirge'], [33, 'Empoleon'], [34, 'Rotom-Heat'], [35, 'Kingambit'], [36, 'Hydreigon'],
    [37, 'Raichu'], [38, 'Sylveon'], [39, 'Blaziken'], [40, 'Umbreon'], [41, 'Delphox'], [42, 'Scizor'], [43, 'Toxapex'],
    [44, 'Tyranitar'], [45, 'Staraptor'], [46, 'Pelipper'], [47, 'Clefable'], [48, 'Banette'], [49, 'Milotic'],
    [50, 'Mamoswine'], [51, 'Ditto'], [52, 'Grimmsnarl'], [53, 'Lopunny'], [54, 'Bellibolt'], [55, 'Absol'],
    [56, 'Ceruledge'], [57, 'Armarouge'], [58, 'Floette-Eternal'], [59, 'Dragapult'], [60, 'Mawile'],
    [62, 'Venusaur'], [68, 'Excadrill'], [75, 'Whimsicott'], [80, 'Gardevoir'], [85, 'Incineroar'], [86, 'Arcanine-Hisui'],
    [88, 'Indeedee-F'], [107, 'Sinistcha'], [114, 'Torkoal'], [192, 'Farigiraf'],
  ] as const).map(([rank, species]) => S(rank, species, '')),
];

const TREND = (t?: string) => {
  if (!t) return undefined;
  let m;
  if ((m = t.match(/Up (\d+)/))) return `↑ sube ${m[1]}`;
  if ((m = t.match(/Down (\d+)/))) return `↓ baja ${m[1]}`;
  if (/New/.test(t)) return '★ nuevo esta temporada';
  return '= sin cambios';
};

/** Rol automático a partir del set (si no hay uno escrito a mano). */
function autoRole(set: PokemonSet): string {
  const has = (...m: string[]) => m.some((x) => set.moves.includes(x));
  const tags: string[] = [];
  if (/ite( [XYZ])?$/.test(set.item)) tags.push('Mega');
  if (has('Fake Out')) tags.push('Fake Out');
  if (has('Trick Room')) tags.push('Espacio Raro');
  if (has('Tailwind')) tags.push('Viento Afín');
  if (has('Follow Me', 'Rage Powder')) tags.push('Redirección');
  if (has('Stealth Rock', 'Spikes', 'Toxic Spikes', 'Sticky Web')) tags.push('Trampas');
  if (has('Swords Dance', 'Nasty Plot', 'Dragon Dance', 'Quiver Dance', 'Calm Mind', 'Bulk Up', 'Shell Smash')) tags.push('Potenciador');
  if (has('U-turn', 'Volt Switch', 'Flip Turn', 'Parting Shot')) tags.push('Pivote');
  if (has('Reflect', 'Light Screen', 'Aurora Veil')) tags.push('Pantallas');
  if (set.ability === 'Intimidate') tags.push('Intimidación');
  else if (['Drizzle', 'Drought', 'Sand Stream', 'Snow Warning', 'Grassy Surge', 'Psychic Surge', 'Electric Surge', 'Misty Surge'].includes(set.ability)) tags.push('Clima / campo');
  if (set.item === 'Choice Scarf') tags.push('Pañuelo Elección');
  if (!tags.length) tags.push(set.sp.atk >= set.sp.spa ? 'Atacante físico' : 'Atacante especial');
  return tags.slice(0, 3).join(' · ');
}

function build(format: Format, curated: MetaEntry[]): MetaEntry[] {
  return PC[format].rows.map((r) => {
    const c = curated.find((x) => x.species === r.species);
    const set: PokemonSet | undefined = r.moves.length ? {
      species: r.species,
      ability: r.ability?.name ?? c?.set?.ability ?? '',
      item: r.item?.name ?? '',
      nature: r.nature?.name ?? 'Hardy',
      sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...(r.spread?.sp ?? {}) },
      moves: r.moves.slice(0, 4).map((m) => m.name),
    } : c?.set;
    return {
      species: r.species,
      tier: r.tier as Tier,
      rank: r.rank,
      usage: format === 'doubles' ? c?.usage : undefined,
      role: c?.role || (set ? autoRole(set) : ''),
      set,
      partners: c?.partners,
      trend: TREND(r.trend),
      setPct: r.moves.length
        ? { ability: r.ability?.pct, item: r.item?.pct, nature: r.nature?.pct, spread: r.spread?.pct, moves: r.moves.slice(0, 4).map((m) => m.pct) }
        : undefined,
    };
  });
}

/** Meta de Dobles (VGC) y de Individuales: los 262 Pokémon del ladder de cada formato. */
export const META: MetaEntry[] = build('doubles', CURATED_DOUBLES);
export const META_SINGLES: MetaEntry[] = build('singles', CURATED_SINGLES);

const META_BY_FORMAT: Record<Format, MetaEntry[]> = { doubles: META, singles: META_SINGLES };

export function metaFor(format: Format): MetaEntry[] {
  return META_BY_FORMAT[format];
}

/** Los `n` Pokémon más usados (para cálculos pesados: amenazas, enfrentamientos…). */
export function metaTop(format: Format, n = 80): MetaEntry[] {
  return META_BY_FORMAT[format].slice(0, n);
}

/** Peso de popularidad según el puesto en el ladder (≈ 35 para el #1, ≈ 10 para el #50, ≈ 1 al final). */
export function metaWeight(e: MetaEntry): number {
  if (e.rank != null) return Math.max(0.5, 35 * Math.exp(-(e.rank - 1) / 40));
  return e.usage ?? 1;
}

/** Etiqueta de popularidad: "#3 · 25.1%" (el % solo cuando se conoce). */
export function usageLabel(e: MetaEntry): string {
  return [e.rank != null ? `#${e.rank}` : '', e.usage != null ? `${e.usage}%` : ''].filter(Boolean).join(' · ');
}

export const TIER_ORDER: Tier[] = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];

/** Entrada del meta para una especie (dobles por defecto). */
export function metaEntry(species: string, format: Format = 'doubles'): MetaEntry | undefined {
  return metaFor(format).find((m) => m.species === species);
}
