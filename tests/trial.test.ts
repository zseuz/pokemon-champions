import { describe, expect, it } from 'vitest';
import { metaEntry } from '../src/models/data/meta';
import { normalizeBox, type BoxEntry } from '../src/models/repository/store';
import { keepTrial, recruitTrial, trialLabel, trials, trialStatus, TRIAL_DAYS } from '../src/models/repository/trial';

const set = (species: string) => structuredClone(metaEntry(species, 'doubles')!.set!);
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);

describe('Reclutamiento de prueba (7 días)', () => {
  it('guarda cuándo termina la prueba y cuenta los días', () => {
    const box = recruitTrial([], set('Zoroark'), NOW);
    expect(box).toHaveLength(1);
    expect(box[0].set?.species).toBe('Zoroark');
    expect(trialStatus(box[0], NOW)).toMatchObject({ daysLeft: TRIAL_DAYS, expired: false });
    expect(trialStatus(box[0], NOW + 3 * DAY)).toMatchObject({ daysLeft: 4 });
    expect(trialLabel(trialStatus(box[0], NOW + 3 * DAY)!)).toBe('prueba: quedan 4 días');
    expect(trialLabel(trialStatus(box[0], NOW + 6.5 * DAY)!)).toBe('último día de prueba');
  });

  it('al terminar los 7 días la prueba figura como terminada', () => {
    const box = recruitTrial([], set('Zoroark'), NOW);
    const t = trialStatus(box[0], NOW + 7 * DAY)!;
    expect(t.expired).toBe(true);
    expect(trialLabel(t)).toBe('prueba terminada');
  });

  it('«Quedármelo» quita la fecha y deja el Pokémon fijo', () => {
    const kept = keepTrial(recruitTrial([], set('Zoroark'), NOW), 'Zoroark');
    expect(kept[0].trialUntil).toBeUndefined();
    expect(kept[0].set?.species).toBe('Zoroark');
    expect(trials(kept, NOW)).toEqual([]);
  });

  it('una prueba no puede quitarte un Pokémon que ya tienes fijo', () => {
    const own: BoxEntry[] = [{ species: 'Zoroark', set: set('Zoroark') }];
    expect(recruitTrial(own, { ...set('Zoroark'), item: 'Focus Sash' }, NOW)).toEqual(own);
  });

  it('ordena las pruebas por las que acaban antes y conserva la fecha al cargar', () => {
    let box = recruitTrial([], set('Garchomp'), NOW + 2 * DAY);
    box = recruitTrial(box, set('Zoroark'), NOW);
    expect(trials(box, NOW).map((t) => t.species)).toEqual(['Zoroark', 'Garchomp']);
    expect(normalizeBox(JSON.parse(JSON.stringify(box)))[0].trialUntil).toBe(box[0].trialUntil);
  });
});
