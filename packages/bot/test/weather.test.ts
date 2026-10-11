import { formatChoice, type PokemonSet } from '@colleja/core';
import { BattleSession } from '@colleja/engine';
import { describe, expect, it } from 'vitest';
import { makeCombatant, weatherAfter, weatherOf } from '../src/analysis/combatant';
import { Situation } from '../src/analysis/situation';
import { ExpertAgent } from '../src/index';
import { set, teamWith } from './helpers';

// Without Drizzle it also loses Tailwind (fase 15 values it): only the weather is compared.
const pelipper = (ability: string) =>
  set(
    'pelipper',
    ['hurricane', 'weatherball', ability === 'drizzle' ? 'tailwind' : 'roost', 'protect'],
    {
      ability,
      item: 'focussash',
      nature: 'modest',
      spread: { hp: 32, atk: 0, spa: 2, spe: 32 },
    },
  );

/** The saved rival of the bug (2026-10-11): rain with Mega Swampert (Swift Swim). */
const rain = (ability = 'drizzle'): PokemonSet[] => [
  pelipper(ability),
  set('swampert', ['wavecrash', 'highhorsepower', 'icepunch', 'protect'], {
    ability: 'damp',
    item: 'swampertite',
    nature: 'adamant',
    spread: { hp: 2, atk: 32, spa: 0, spe: 32 },
  }),
  set('archaludon', ['electroshot', 'dragonpulse', 'flashcannon', 'protect'], {
    ability: 'stamina',
    item: 'leftovers',
    nature: 'modest',
    spread: { hp: 32, atk: 0, spa: 32, spd: 2 },
  }),
  set('rillaboom', ['fakeout', 'grassyglide', 'woodhammer', 'uturn'], {
    ability: 'grassysurge',
    item: 'miracleseed',
    nature: 'adamant',
    spread: { hp: 32, atk: 32, spa: 0, spd: 2 },
  }),
  set('incineroar', ['fakeout', 'partingshot', 'flareblitz', 'darkestlariat'], {
    ability: 'intimidate',
    item: 'sitrusberry',
    nature: 'careful',
    spread: { hp: 32, atk: 2, spa: 0, spd: 32 },
  }),
  set('grimmsnarl', ['reflect', 'lightscreen', 'spiritbreak', 'partingshot'], {
    ability: 'prankster',
    item: 'lightclay',
    nature: 'impish',
    spread: { hp: 32, atk: 0, spa: 0, def: 32, spd: 2 },
  }),
];

function preview(p1: PokemonSet[], p2: PokemonSet[]): BattleSession {
  return BattleSession.create({
    mode: 'doubles',
    seed: 'weather',
    options: { teamPreview: true },
    players: { p1: { name: 'Bot', team: p1 }, p2: { name: 'Rival', team: p2 } },
  });
}

/** Whether the level 3 bot brings Pelipper (the first of its team) at team preview. */
function bringsPelipper(team: PokemonSet[], rival: string, seed: string): boolean {
  const context = preview(team, teamWith('doubles', [], rival)).getAgentContext('p1');
  if (!context) throw new Error('p1 no tiene que elegir');
  const choice = formatChoice(new ExpertAgent({ seed }).choose(context));
  return choice.replace('team ', '').split(', ').includes('1');
}

describe('weather setters', () => {
  const combatant = (species: string, ability: string, spe: number) =>
    makeCombatant({
      side: 'p1',
      set: set(species, ['protect'], { ability, spread: { spe } }),
    });

  it('the slowest setter entering at once sets the weather', () => {
    const pelipperFast = combatant('pelipper', 'drizzle', 32);
    const torkoal = combatant('torkoal', 'drought', 0);
    expect(weatherOf(pelipperFast)).toBe('raindance');
    expect(weatherAfter([pelipperFast, torkoal], null)).toBe('sunnyday');
    expect(weatherAfter([pelipperFast], 'sunnyday')).toBe('raindance');
    expect(weatherAfter([combatant('pelipper', 'keeneye', 32)], 'sandstorm')).toBe('sandstorm');
  });

  it('a situation under another weather keeps the original intact', () => {
    const context = preview(rain(), teamWith('doubles', [], 'r')).getAgentContext('p1');
    if (!context) throw new Error('p1 no tiene que elegir');
    const situation = new Situation(context);
    const wet = situation.withWeather('raindance');
    expect(wet.field.weather).toBe('raindance');
    expect(situation.field.weather).toBeNull();
    expect(situation.withWeather('raindance')).toBe(wet);
    expect(wet.withWeather(null)).toBe(situation);
  });

  it('level 3 brings the rain setter when its team needs the rain (doubles)', () => {
    const seeds = ['a', 'b', 'c', 'd'];
    const withDrizzle = seeds.filter((seed) => bringsPelipper(rain(), seed, seed)).length;
    const withoutDrizzle = seeds.filter((seed) => bringsPelipper(rain('keeneye'), seed, seed));
    expect(withDrizzle).toBe(seeds.length);
    expect(withoutDrizzle.length).toBeLessThan(seeds.length);
  });
});
