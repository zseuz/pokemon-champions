/**
 * Tests de los modelos (lógica sin interfaz). Ejecutar con: npm test
 */
import { describe, expect, it } from 'vitest';
import { META, META_SINGLES, metaEntry } from '../src/models/data/meta';
import { getItem, getMove, getSpecies } from '../src/models/domain/dex';
import { legalAbilities, rankAbilities } from '../src/models/domain/abilities';
import { moveLabel, normalize, speciesEs, speciesSearch } from '../src/models/domain/es';
import { defaultSet, spTotal, validateSet, type PokemonSet } from '../src/models/domain/sets';
import { computeDamage } from '../src/models/engine/battle';
import { battleMonFor, neutralState } from '../src/models/analysis/teamAnalysis';
import { learnable, recommendBuild } from '../src/models/analysis/build';
import { assignItems } from '../src/models/analysis/items';
import { rankCandidates } from '../src/models/analysis/candidates';
import { autoBuild } from '../src/models/analysis/synergy';
import { teamObservations } from '../src/models/analysis/observations';
import {
  addSpecies, addToBox, normalizeBox, resolveTeams, setFor, syncTeamIntoBox, upsertSet,
} from '../src/models/repository/store';

const set = (species: string, fmt: 'singles' | 'doubles' = 'doubles') => structuredClone(metaEntry(species, fmt)!.set!);

describe('Datos del meta', () => {
  it('tiene los 262 Pokémon de cada formato', () => {
    expect(META.length).toBe(262);
    expect(META_SINGLES.length).toBe(262);
  });

  it('todos los sets son válidos (especie, objeto, movimientos, Stat Points ≤ 66)', () => {
    for (const e of [...META, ...META_SINGLES]) {
      expect(getSpecies(e.species), e.species).toBeTruthy();
      if (!e.set) continue;
      expect(validateSet(e.set), e.species).toEqual([]);
      expect(spTotal(e.set.sp)).toBeLessThanOrEqual(66);
      if (e.set.item) expect(getItem(e.set.item), `${e.species} ${e.set.item}`).toBeTruthy();
      for (const m of e.set.moves) expect(getMove(m), `${e.species} ${m}`).toBeTruthy();
    }
  });

  it('ordena por puesto y el #1 es tier S', () => {
    expect(META[0].rank).toBe(1);
    expect(META[0].tier).toBe('S');
  });
});

describe('Cálculo de daño (mecánicas de Champions)', () => {
  it('Terremoto de Garchomp a Incineroar hace un rango razonable', () => {
    const st = neutralState();
    const a = battleMonFor({ species: 'Garchomp', ability: 'Rough Skin', item: 'Life Orb', nature: 'Jolly', sp: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 }, moves: ['Earthquake'] }, 0, false);
    const d = battleMonFor({ species: 'Incineroar', ability: 'Intimidate', item: '', nature: 'Careful', sp: { hp: 32, atk: 0, def: 0, spa: 0, spd: 32, spe: 0 }, moves: ['Fake Out'] }, 1, false);
    // en dobles Terremoto golpea a varios y hace un 25% menos
    const spread = computeDamage(st, a, d, 'Earthquake', { spread: true });
    expect(spread.effectiveness).toBe(2);
    expect(spread.minPct).toBeGreaterThan(80);
    expect(spread.maxPct).toBeLessThan(115);
    // a un solo objetivo es KO directo
    expect(computeDamage(st, a, d, 'Earthquake').minPct).toBeGreaterThan(100);
  });

  it('las inmunidades hacen 0 de daño', () => {
    const st = neutralState();
    const a = battleMonFor(set('Garchomp'), 0, false);
    const d = battleMonFor(set('Salamence'), 1, false); // Volador: inmune a Tierra
    expect(computeDamage(st, a, d, 'Earthquake').maxPct).toBe(0);
  });
});

describe('Habilidades y movimientos por especie', () => {
  it('Sneasler puede tener Liviano y la recomienda con Hierba Blanca', () => {
    expect(legalAbilities('Sneasler')).toContain('Unburden');
    const best = rankAbilities({ ...set('Sneasler'), item: 'White Herb' }, 'doubles')[0];
    expect(best.ability).toBe('Unburden');
  });

  it('Incineroar aprende Fake Out y no aprende Surf', () => {
    expect(learnable('Incineroar')).toContain('Fake Out');
    expect(learnable('Incineroar')).not.toContain('Surf');
  });

  it('el set por defecto elige la mejor habilidad legal', () => {
    expect(legalAbilities('Glaceon')).toContain(defaultSet('Glaceon').ability);
  });
});

describe('Nombres en español', () => {
  it('muestra el español con el inglés entre paréntesis', () => {
    expect(moveLabel('Drill Run')).toBe('Taladradora (Drill Run)');
    expect(moveLabel('Poison Jab')).toBe('Golpe Venenoso (Poison Jab)'); // nombre de Champions
  });

  it('busca formas en español y sin tildes', () => {
    expect(speciesEs('Rotom-Wash')).toBe('Rotom Lavado');
    expect(speciesSearch('Raichu-Alola')).toContain('alola');
    expect(normalize('Psíquico')).toBe('psiquico');
  });
});

describe('Colección: un set por Pokémon', () => {
  it('convierte datos antiguos con un set por formato', () => {
    const old = [{ species: 'Kingambit', sets: { singles: set('Kingambit', 'singles') } }];
    const box = normalizeBox(old, 'doubles');
    expect(box[0].set?.species).toBe('Kingambit');
  });

  it('tu set se usa en los dos formatos; sin set propio se usa el del meta', () => {
    const mine: PokemonSet = { ...set('Kingambit'), ability: 'Supreme Overlord', item: '' };
    let box = upsertSet([], mine);
    box = addSpecies(box, 'Rillaboom');
    expect(setFor(box[0], 'singles').ability).toBe('Supreme Overlord');
    expect(setFor(box[0], 'doubles').ability).toBe('Supreme Overlord');
    expect(setFor(box[1], 'doubles')).toEqual(set('Rillaboom', 'doubles'));
  });

  it('addToBox no pisa un set ya configurado; upsertSet sí', () => {
    const a: PokemonSet = { ...set('Garchomp'), nature: 'Jolly' };
    const b: PokemonSet = { ...set('Garchomp'), nature: 'Adamant' };
    expect(addToBox(upsertSet([], a), b)[0].set?.nature).toBe('Jolly');
    expect(upsertSet(upsertSet([], a), b)[0].set?.nature).toBe('Adamant');
  });

  it('editar en el equipo actualiza la colección y el equipo del otro formato', () => {
    const k = set('Kingambit');
    let box = upsertSet([], k);
    const edited = { ...k, item: 'Black Glasses' };
    box = syncTeamIntoBox(box, [edited], 'singles');
    const teams = resolveTeams({ singles: ['Kingambit'], doubles: ['Kingambit'] }, box);
    expect(teams.doubles[0].item).toBe('Black Glasses');
  });
});

describe('Objetos', () => {
  it('el reparto no repite objetos', () => {
    const team = ['Rillaboom', 'Incineroar', 'Farigiraf', 'Kingambit'].map((s) => ({ ...set(s), item: '' }));
    const { assignments } = assignItems(team, ['Sitrus Berry', 'Leftovers', 'Life Orb', 'Focus Sash', 'Miracle Seed'], 'doubles');
    const items = assignments.map((a) => a.item).filter(Boolean);
    expect(new Set(items).size).toBe(items.length);
  });
});

describe('Reclutamiento', () => {
  it('un ejemplar idéntico al tuyo queda el último', () => {
    const mine = set('Kingambit');
    const other = set('Rillaboom');
    const ranked = rankCandidates([mine, other], 'doubles', [], [], { Kingambit: mine });
    expect(ranked[ranked.length - 1].set.species).toBe('Kingambit');
    expect(ranked[ranked.length - 1].owned?.same).toBe(true);
  });

  it('el build recomendado tiene 4 movimientos que puede aprender', () => {
    const b = recommendBuild('Garchomp', 'singles');
    expect(b.set.moves).toHaveLength(4);
    for (const m of b.set.moves) expect(learnable('Garchomp')).toContain(m);
  });
});

describe('Armado de equipo y observaciones', () => {
  it('arma un equipo de 6 sin repetir especies', () => {
    const pool = META.slice(0, 12).map((e) => e.set!);
    const [best] = autoBuild(pool, 'doubles', 6);
    expect(best.members).toHaveLength(6);
    expect(new Set(best.members.map((m) => m.species)).size).toBe(6);
  });

  it('avisa si los miembros no llevan objeto', () => {
    const team = META.slice(0, 6).map((e) => ({ ...e.set!, item: '' }));
    const obs = teamObservations(team, team, 'doubles');
    expect(obs.some((o) => o.area === 'Objetos')).toBe(true);
  });
});
