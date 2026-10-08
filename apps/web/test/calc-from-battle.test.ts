import { OpponentModel } from '@colleja/bot/opponent-model';
import { BattleView, type PokemonSet } from '@colleja/core';
import { describe, expect, it } from 'vitest';
import { battleMatchups, calcFromBattle } from '../src/features/calc/from-battle';

const GARCHOMP: PokemonSet = {
  species: 'garchomp',
  item: 'garchompite',
  ability: 'roughskin',
  nature: 'jolly',
  statPoints: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  moves: ['earthquake', 'dragonclaw', 'rockslide', 'protect'],
};
const INCINEROAR: PokemonSet = {
  species: 'incineroar',
  item: 'sitrusberry',
  ability: 'intimidate',
  nature: 'careful',
  statPoints: { hp: 32, atk: 2, def: 16, spa: 0, spd: 16, spe: 0 },
  moves: ['fakeout', 'flareblitz', 'knockoff', 'partingshot'],
};

/** Turn 2 of a singles battle from p1's side. */
const SINGLES_LOG = [
  '|gametype|singles',
  '|player|p1|Yo|',
  '|player|p2|Bot|',
  '|start',
  '|switch|p1a: Garchomp|Garchomp, L50, M|185/185',
  '|switch|p2a: Incineroar|Incineroar, L50, M|100/100',
  '|turn|1',
  '|move|p1a: Garchomp|Swords Dance|p1a: Garchomp',
  '|-boost|p1a: Garchomp|atk|2',
  '|move|p2a: Incineroar|Knock Off|p1a: Garchomp',
  '|-damage|p1a: Garchomp|120/185',
  '|-status|p2a: Incineroar|brn',
  '|-damage|p2a: Incineroar|60/100 brn',
  '|-enditem|p2a: Incineroar|Sitrus Berry|[eat]',
  '|-sidestart|p2: Bot|Reflect',
  '|-weather|RainDance',
  '|-fieldstart|move: Gravity',
  '|turn|2',
];

describe('calculator from a battle', () => {
  const view = BattleView.from(SINGLES_LOG);

  it('sets up your active Pokémon against the rival with what you can see', () => {
    const [matchup] = battleMatchups(view);
    expect(battleMatchups(view)).toHaveLength(1);
    if (!matchup) throw new Error('sin enfrentamiento');
    const setup = calcFromBattle({
      view,
      mode: 'singles',
      team: [GARCHOMP],
      opponentTeam: null,
      matchup,
    });

    expect(setup.attacker).toEqual({
      set: GARCHOMP,
      mega: false,
      hpPercent: 65,
      status: null,
      boosts: { atk: 2 },
    });
    // Closed team sheets: the bot's assumption plus what was revealed, never the real set.
    const assumed = new OpponentModel('singles').likelySet(
      view.sides.p2.active[0] as NonNullable<(typeof view.sides.p2.active)[number]>,
    );
    const { item: _, ...withoutItem } = assumed;
    expect(setup.defender).toMatchObject({
      set: withoutItem,
      mega: false,
      hpPercent: 60,
      status: 'brn',
    });
    expect(setup.defender.set.moves).toContain('knockoff');
    expect(setup.defender.set.item).toBeUndefined();

    expect(setup.field).toMatchObject({
      mode: 'singles',
      weather: 'raindance',
      terrain: null,
      screens: ['reflect'],
      gravity: true,
      magicRoom: false,
      crit: false,
    });
  });

  it('uses the rival set with open team sheets', () => {
    const [matchup] = battleMatchups(view);
    if (!matchup) throw new Error('sin enfrentamiento');
    const setup = calcFromBattle({
      view,
      mode: 'singles',
      team: [GARCHOMP],
      opponentTeam: [INCINEROAR],
      matchup,
    });
    const { item: _, ...withoutItem } = INCINEROAR;
    expect(setup.defender.set).toEqual(withoutItem);
  });

  it('offers every pairing of living actives in doubles', () => {
    const doubles = BattleView.from([
      '|gametype|doubles',
      '|player|p1|Yo|',
      '|player|p2|Bot|',
      '|start',
      '|switch|p1a: Garchomp|Garchomp, L50, M|185/185',
      '|switch|p1b: Incineroar|Incineroar, L50, M|202/202',
      '|switch|p2a: Sinistcha|Sinistcha, L50|100/100',
      '|switch|p2b: Kingambit|Kingambit, L50, M|100/100',
      '|turn|1',
      '|move|p1a: Garchomp|Earthquake|p2a: Sinistcha|[spread] p2a,p2b',
      '|-damage|p2a: Sinistcha|0 fnt',
      '|faint|p2a: Sinistcha',
    ]);
    const pairs = battleMatchups(doubles).map(
      (pairing) => `${pairing.attacker.species}>${pairing.defender.species}`,
    );
    expect(pairs).toEqual(['garchomp>kingambit', 'incineroar>kingambit']);
  });
});
