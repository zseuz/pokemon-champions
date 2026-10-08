import type { StatID } from './dex';

/**
 * Datos de movimientos que @smogon/calc no incluye (precisión y efectos secundarios).
 * Cubre los movimientos habituales del meta; el resto se asume 100% de precisión y sin efectos extra.
 */
export const ACCURACY: Record<string, number> = {
  Hurricane: 70, Thunder: 70, Blizzard: 70, 'Focus Blast': 70, 'Zap Cannon': 50, 'Dynamic Punch': 50,
  'Rock Slide': 90, 'Draco Meteor': 90, 'Heat Wave': 90, 'Muddy Water': 85, 'Hydro Pump': 80, 'Fire Blast': 85,
  'Will-O-Wisp': 85, 'Thunder Wave': 90, Electroweb: 95, 'Icy Wind': 95, 'Stone Edge': 80, 'Head Smash': 80,
  'Play Rough': 90, 'Rock Tomb': 95, 'Air Slash': 95, Snarl: 95, 'High Horsepower': 95, Megahorn: 85,
  'Power Whip': 85, 'Leaf Storm': 90, Overheat: 90, 'Hammer Arm': 90, 'Sleep Powder': 75, 'Gunk Shot': 80,
  'Poison Powder': 75, 'Stun Spore': 75, Toxic: 90, 'Fire Fang': 95, 'Ice Fang': 95, 'Thunder Fang': 95,
  Crabhammer: 90, 'Dragon Rush': 75, 'Meteor Mash': 90, Hypnosis: 60, 'Rock Blast': 90, 'Bone Rush': 90,
  'Iron Tail': 75, 'Sing': 55, 'Swagger': 85, 'Bleakwind Storm': 80, 'Sandsear Storm': 80, 'Springtide Storm': 80,
  'Wildbolt Storm': 80, 'Mud Shot': 95, 'Bulldoze': 100, 'Diamond Storm': 95, 'Spirit Break': 100,
  'Steel Wing': 90, 'Fly': 95, 'Sky Attack': 90, 'Seed Bomb': 100, 'Dire Claw': 100, 'Kowtow Cleave': 0,
  'Mega Kick': 75, 'Mega Punch': 85, 'Cross Chop': 80, Inferno: 50, 'Rock Wrecker': 90, 'Sky Uppercut': 90, 'Aqua Tail': 90,
  'Precipice Blades': 85, 'Origin Pulse': 85, 'Seed Flare': 85, 'Magma Storm': 75, 'Fleur Cannon': 90, Screech: 85,
  Supersonic: 55, 'Grass Whistle': 55, 'Double Hit': 90, 'Dual Chop': 90, 'Crush Claw': 95, 'Night Daze': 95,
  'Mirror Shot': 85, 'Mud Bomb': 85, Octazooka: 85, 'Icicle Crash': 90, 'Triple Axel': 90, 'Pin Missile': 95,
  'Scale Shot': 90, 'Dragon Tail': 90, 'Circle Throw': 90, 'Leaf Tornado': 90, 'Blue Flare': 85, 'Bolt Strike': 85,
  'Air Cutter': 95, 'Razor Leaf': 95, 'Poison Gas': 90, 'Hyper Beam': 90, 'Giga Impact': 90, 'Take Down': 85,
  'Submission': 80, 'Rock Throw': 90, 'Water Pulse': 100, 'Charge Beam': 90, 'Psycho Boost': 90, 'Wrap': 90,
};

/** Precisión efectiva (0 = nunca falla). */
export function moveAccuracy(move: string, weather?: string): number {
  if ((move === 'Hurricane' || move === 'Thunder') && weather === 'Rain') return 100;
  if (move === 'Blizzard' && weather === 'Snow') return 100;
  if ((move === 'Hurricane' || move === 'Thunder') && weather === 'Sun') return 50;
  return ACCURACY[move] ?? 100;
}

export type StatusID = 'brn' | 'par' | 'psn' | 'tox' | 'slp';
export type Boosts = Partial<Record<StatID | 'accuracy' | 'evasion', number>>;

export interface Secondary {
  chance: number;
  /** cambio de stats en el objetivo */
  boosts?: Boosts;
  /** cambio de stats en el usuario */
  self?: Boosts;
  status?: StatusID | 'random-dire';
  flinch?: boolean;
}

export const SECONDARY: Record<string, Secondary> = {
  'Fake Out': { chance: 100, flinch: true },
  'Dire Claw': { chance: 50, status: 'random-dire' },
  Snarl: { chance: 100, boosts: { spa: -1 } },
  'Icy Wind': { chance: 100, boosts: { spe: -1 } },
  Electroweb: { chance: 100, boosts: { spe: -1 } },
  'Rock Tomb': { chance: 100, boosts: { spe: -1 } },
  Bulldoze: { chance: 100, boosts: { spe: -1 } },
  'Mud Shot': { chance: 100, boosts: { spe: -1 } },
  'Struggle Bug': { chance: 100, boosts: { spa: -1 } },
  'Spirit Break': { chance: 100, boosts: { spa: -1 } },
  'Throat Chop': { chance: 0 },
  'Breaking Swipe': { chance: 100, boosts: { atk: -1 } },
  Nuzzle: { chance: 100, status: 'par' },
  'Rock Slide': { chance: 30, flinch: true },
  'Air Slash': { chance: 30, flinch: true },
  'Iron Head': { chance: 30, flinch: true },
  'Zen Headbutt': { chance: 20, flinch: true },
  'Heat Wave': { chance: 10, status: 'brn' },
  'Flare Blitz': { chance: 10, status: 'brn' },
  Flamethrower: { chance: 10, status: 'brn' },
  'Fire Punch': { chance: 10, status: 'brn' },
  Scald: { chance: 30, status: 'brn' },
  'Fiery Dance': { chance: 50, self: { spa: 1 } },
  Thunderbolt: { chance: 10, status: 'par' },
  Discharge: { chance: 30, status: 'par' },
  'Sludge Bomb': { chance: 30, status: 'psn' },
  'Poison Jab': { chance: 30, status: 'psn' },
  'Muddy Water': { chance: 30, boosts: { accuracy: -1 } },
  'Moonblast': { chance: 30, boosts: { spa: -1 } },
  'Shadow Ball': { chance: 20, boosts: { spd: -1 } },
  Psychic: { chance: 10, boosts: { spd: -1 } },
  'Earth Power': { chance: 10, boosts: { spd: -1 } },
  'Bug Buzz': { chance: 10, boosts: { spd: -1 } },
  'Ice Beam': { chance: 10, status: undefined },
  'Close Combat': { chance: 100, self: { def: -1, spd: -1 } },
  Superpower: { chance: 100, self: { atk: -1, def: -1 } },
  'Draco Meteor': { chance: 100, self: { spa: -2 } },
  Overheat: { chance: 100, self: { spa: -2 } },
  'Leaf Storm': { chance: 100, self: { spa: -2 } },
  'Make It Rain': { chance: 100, self: { spa: -1 } },
  'Wood Hammer': { chance: 0 },
  'Trailblaze': { chance: 100, self: { spe: 1 } },
  'Flame Charge': { chance: 100, self: { spe: 1 } },
  'Aqua Step': { chance: 100, self: { spe: 1 } },
  'Power-Up Punch': { chance: 100, self: { atk: 1 } },
  'Matcha Gotcha': { chance: 20, status: 'brn' },
};

/** Movimientos de estado con efecto implementado en el simulador. */
export const STATUS_MOVES = {
  protect: ['Protect', 'Detect', 'Spiky Shield', "King's Shield", 'Baneful Bunker', 'Silk Trap', 'Burning Bulwark', 'Obstruct'],
  wideGuard: ['Wide Guard'],
  redirect: ['Follow Me', 'Rage Powder'],
  boostsSelf: {
    'Swords Dance': { atk: 2 }, 'Nasty Plot': { spa: 2 }, 'Dragon Dance': { atk: 1, spe: 1 },
    'Quiver Dance': { spa: 1, spd: 1, spe: 1 }, 'Calm Mind': { spa: 1, spd: 1 }, 'Bulk Up': { atk: 1, def: 1 },
    'Iron Defense': { def: 2 }, 'Shell Smash': { atk: 2, spa: 2, spe: 2, def: -1, spd: -1 },
    'Agility': { spe: 2 }, 'Coil': { atk: 1, def: 1 }, 'Belly Drum': { atk: 6 },
  } as Record<string, Boosts>,
  boostsTarget: {
    'Charm': { atk: -2 }, 'Fake Tears': { spd: -2 }, 'Scary Face': { spe: -2 }, 'Screech': { def: -2 },
    'Feather Dance': { atk: -2 }, 'Metal Sound': { spd: -2 }, 'Parting Shot': { atk: -1, spa: -1 },
    'Tickle': { atk: -1, def: -1 },
  } as Record<string, Boosts>,
  statusTarget: {
    'Will-O-Wisp': 'brn', 'Thunder Wave': 'par', 'Toxic': 'tox', 'Spore': 'slp', 'Sleep Powder': 'slp',
    'Hypnosis': 'slp', 'Stun Spore': 'par', 'Poison Powder': 'psn', 'Glare': 'par', 'Yawn': 'slp',
  } as Record<string, StatusID>,
  heal: { Recover: 0.5, Roost: 0.5, 'Slack Off': 0.5, 'Soft-Boiled': 0.5, Synthesis: 0.5, 'Moonlight': 0.5, 'Morning Sun': 0.5, 'Strength Sap': 0.4 } as Record<string, number>,
  healAlly: { 'Heal Pulse': 0.5, 'Pollen Puff': 0 } as Record<string, number>,
  tailwind: ['Tailwind'],
  trickRoom: ['Trick Room'],
  screens: { Reflect: 'reflect', 'Light Screen': 'lightScreen', 'Aurora Veil': 'auroraVeil' } as Record<string, 'reflect' | 'lightScreen' | 'auroraVeil'>,
  weather: { 'Sunny Day': 'Sun', 'Rain Dance': 'Rain', Sandstorm: 'Sand', 'Snowscape': 'Snow' } as Record<string, string>,
  helpingHand: ['Helping Hand'],
  taunt: ['Taunt'],
  pivot: ['U-turn', 'Volt Switch', 'Flip Turn', 'Parting Shot', 'Teleport'],
  /** trampas de entrada en el campo rival */
  hazards: { 'Stealth Rock': 'stealthRock', Spikes: 'spikes' } as Record<string, 'stealthRock' | 'spikes'>,
  /** quitan trampas: Giro Rápido/Giro Mortal (las tuyas), Despejar/Limpieza General (todas) */
  hazardClear: ['Rapid Spin', 'Mortal Spin', 'Defog', 'Tidy Up'],
  encore: ['Encore'],
  perish: ['Perish Song'],
  /** obligan al rival a cambiar: de estado (Rugido) o tras golpear (Cola Dragón) */
  phaze: ['Roar', 'Whirlwind'],
  dragOut: ['Dragon Tail', 'Circle Throw'],
};

export const ALLY_TARGET_MOVES = new Set(['Helping Hand', 'Heal Pulse', 'Coaching', 'Pollen Puff']);
export const SELF_FIELD_MOVES = new Set([
  ...STATUS_MOVES.protect, ...STATUS_MOVES.wideGuard, ...STATUS_MOVES.redirect, ...STATUS_MOVES.tailwind,
  ...STATUS_MOVES.trickRoom, ...Object.keys(STATUS_MOVES.boostsSelf), ...Object.keys(STATUS_MOVES.heal),
  ...Object.keys(STATUS_MOVES.screens), ...Object.keys(STATUS_MOVES.weather), 'Helping Hand', 'Teleport',
  ...Object.keys(STATUS_MOVES.hazards), 'Defog', 'Tidy Up', 'Perish Song',
  'Coaching', 'Sunny Day', 'Rain Dance',
]);

/** Ataques que fallan si se usan después del primer turno en campo. */
export const FIRST_TURN_ONLY = new Set(['Fake Out', 'First Impression']);
