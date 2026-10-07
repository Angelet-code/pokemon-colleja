import { describe, expect, it } from 'vitest';
import {
  actionsChoice,
  BattleView,
  formatChoice,
  getSlotOptions,
  type MoveRequest,
  moveAction,
  moveTargets,
  PASS,
  parseChoice,
  parseCondition,
  type RequestPokemon,
  requestKind,
  SeededRandom,
  type SwitchRequest,
  switchAction,
  type TeamPreviewRequest,
  teamChoice,
  validateChoice,
} from '../src/index';

function pokemon(name: string, condition: string, active: boolean): RequestPokemon {
  return {
    ident: `p1: ${name}`,
    details: `${name}, L50`,
    condition,
    active,
    stats: { atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    moves: [],
    baseAbility: '',
    item: '',
  };
}

const SIDE = {
  name: 'Yo',
  id: 'p1' as const,
  pokemon: [
    pokemon('Charizard', '155/155', true),
    pokemon('Incineroar', '202/202', true),
    pokemon('Garchomp', '185/185', false),
    pokemon('Sinistcha', '0 fnt', false),
  ],
};

const DOUBLES_MOVE: MoveRequest = {
  active: [
    {
      moves: [
        { move: 'Heat Wave', id: 'heatwave', pp: 12, maxpp: 12, target: 'allAdjacentFoes' },
        { move: 'Air Slash', id: 'airslash', pp: 16, maxpp: 16, target: 'any' },
        { move: 'Protect', id: 'protect', pp: 0, maxpp: 8, target: 'self', disabled: true },
      ],
      canMegaEvo: true,
    },
    {
      moves: [
        { move: 'Fake Out', id: 'fakeout', target: 'normal' },
        { move: 'Helping Hand', id: 'helpinghand', target: 'adjacentAlly' },
      ],
      canMegaEvo: true,
    },
  ],
  side: SIDE,
};

describe('choices', () => {
  it('serialises to Showdown syntax', () => {
    expect(formatChoice(teamChoice([2, 1, 3]))).toBe('team 2, 1, 3');
    expect(formatChoice(actionsChoice(moveAction(1)))).toBe('move 1');
    expect(formatChoice(actionsChoice(moveAction(2, { mega: true })))).toBe('move 2 mega');
    expect(formatChoice(actionsChoice(switchAction(3)))).toBe('switch 3');
    expect(
      formatChoice(
        actionsChoice(moveAction(2, { target: 1, mega: true }), moveAction(2, { target: -1 })),
      ),
    ).toBe('move 2 +1 mega, move 2 -1');
    expect(formatChoice(actionsChoice(PASS, switchAction(3)))).toBe('pass, switch 3');
  });

  it('parses what it serialises', () => {
    for (const text of ['team 2, 1, 3', 'move 1', 'move 2 +1 mega, move 2 -1', 'pass, switch 3']) {
      const choice = parseChoice(text);
      expect(choice).not.toBeNull();
      if (choice) expect(formatChoice(choice)).toBe(text);
    }
    expect(parseChoice('team 1234')).toEqual(teamChoice([1, 2, 3, 4]));
    expect(parseChoice('dance')).toBeNull();
  });
});

describe('request options', () => {
  it('classifies requests', () => {
    expect(requestKind(DOUBLES_MOVE)).toBe('move');
    expect(requestKind({ teamPreview: true, side: SIDE })).toBe('team');
    expect(requestKind({ forceSwitch: [true, false], side: SIDE })).toBe('switch');
    expect(requestKind({ wait: true, side: SIDE })).toBe('wait');
    expect(parseCondition('92/185 brn')).toEqual({
      hp: 92,
      maxhp: 185,
      status: 'brn',
      fainted: false,
    });
    expect(parseCondition('0 fnt').fainted).toBe(true);
    // Champions adds the HP bar colour at exactly 20 % and 50 %.
    expect(parseCondition('50/100y par')).toEqual({
      hp: 50,
      maxhp: 100,
      status: 'par',
      fainted: false,
    });
    expect(parseCondition('20/100r')).toMatchObject({ hp: 20, maxhp: 100 });
  });

  it('computes doubles targets', () => {
    expect(moveTargets('normal', 0, 2)).toEqual([1, 2, -2]);
    expect(moveTargets('any', 1, 2)).toEqual([1, 2, -1]);
    expect(moveTargets('adjacentFoe', 0, 2)).toEqual([1, 2]);
    expect(moveTargets('adjacentAlly', 0, 2)).toEqual([-2]);
    expect(moveTargets('adjacentAllyOrSelf', 1, 2)).toEqual([-2, -1]);
    expect(moveTargets('allAdjacentFoes', 0, 2)).toEqual([]);
    expect(moveTargets('normal', 0, 1)).toEqual([]);
  });

  it('lists moves, switches and Mega per slot', () => {
    const [first, second] = getSlotOptions(DOUBLES_MOVE);
    expect(first?.moves.map((m) => [m.slot, m.targets, m.disabled])).toEqual([
      [1, [], false],
      [2, [1, 2, -2], false],
      [3, [], true],
    ]);
    expect(first?.switches).toEqual([3]); // Sinistcha is fainted
    expect(second?.canMega).toBe(true);
  });

  it('validates move requests', () => {
    const ok = actionsChoice(
      moveAction(2, { target: 1, mega: true }),
      moveAction(1, { target: 2 }),
    );
    expect(validateChoice(DOUBLES_MOVE, ok)).toEqual([]);
    expect(validateChoice(DOUBLES_MOVE, actionsChoice(moveAction(1)))).toHaveLength(1);
    const bad = [
      actionsChoice(moveAction(2), moveAction(1, { target: 1 })), // missing target
      actionsChoice(moveAction(1, { target: 1 }), moveAction(1, { target: 1 })), // target not allowed
      actionsChoice(moveAction(3), moveAction(1, { target: 1 })), // disabled
      actionsChoice(moveAction(1, { mega: true }), moveAction(1, { target: 1, mega: true })), // 2 megas
      actionsChoice(switchAction(3), switchAction(3)), // same switch twice
      actionsChoice(switchAction(4), moveAction(1, { target: 1 })), // fainted
      actionsChoice(PASS, moveAction(1, { target: 1 })), // cannot pass
      teamChoice([1, 2, 3]),
    ];
    for (const choice of bad) {
      expect(validateChoice(DOUBLES_MOVE, choice), formatChoice(choice)).not.toEqual([]);
    }
  });

  it('validates forced switches, including passing when replacements run out', () => {
    const request: SwitchRequest = { forceSwitch: [true, true], side: SIDE };
    expect(validateChoice(request, actionsChoice(switchAction(3), PASS))).toEqual([]);
    expect(validateChoice(request, actionsChoice(PASS, switchAction(3)))).toEqual([]);
    expect(validateChoice(request, actionsChoice(PASS, PASS))).not.toEqual([]);
    expect(validateChoice(request, actionsChoice(moveAction(1), PASS))).not.toEqual([]);
    const single: SwitchRequest = { forceSwitch: [false, true], side: SIDE };
    expect(validateChoice(single, actionsChoice(PASS, switchAction(3)))).toEqual([]);
    expect(validateChoice(single, actionsChoice(switchAction(3), PASS))).not.toEqual([]);
  });

  it('validates team preview', () => {
    const request: TeamPreviewRequest = { teamPreview: true, maxChosenTeamSize: 3, side: SIDE };
    expect(validateChoice(request, teamChoice([4, 1, 2]))).toEqual([]);
    expect(validateChoice(request, teamChoice([1, 2]))).not.toEqual([]);
    expect(validateChoice(request, teamChoice([1, 1, 2]))).not.toEqual([]);
    expect(validateChoice(request, teamChoice([1, 2, 7]))).not.toEqual([]);
  });
});

describe('BattleView', () => {
  it('tracks the field from a perspective', () => {
    const view = BattleView.from([
      '|player|p1|Yo||',
      '|player|p2|Bot||',
      '|gametype|doubles',
      '|poke|p2|Dragonite, L50, M|',
      '|poke|p2|Gengar, L50, M|',
      '|switch|p1a: Charizard|Charizard, L50, F|155/155',
      '|switch|p2a: Dragonite|Dragonite, L50, M|100/100',
      '|-unboost|p2a: Dragonite|atk|1',
      '|turn|1',
      '|move|p2a: Dragonite|Extreme Speed|p1a: Charizard',
      '|-damage|p1a: Charizard|80/155',
      '|-mega|p1a: Charizard|Charizard|Charizardite Y',
      '|detailschange|p1a: Charizard|Charizard-Mega-Y, L50, F',
      '|-weather|SunnyDay',
      '|-fieldstart|move: Trick Room|[of] p1a: Charizard',
      '|-sidestart|p2: Bot|move: Tailwind',
      '|-status|p2a: Dragonite|brn',
      '|-damage|p2a: Dragonite|94/100 brn|[from] brn',
      '|switch|p2a: Gengar|Gengar, L50, M|100/100',
      '|turn|2',
    ]);
    expect(view.gameType).toBe('doubles');
    expect(view.turn).toBe(2);
    expect(view.sides.p2.preview).toEqual(['dragonite', 'gengar']);
    const charizard = view.sides.p1.active[0];
    expect(charizard).toMatchObject({
      species: 'charizardmegay',
      hp: 80,
      maxhp: 155,
      megaEvolved: true,
    });
    expect(charizard?.item).toBe('charizarditey');
    const dragonite = view.getPokemon('p2: Dragonite');
    expect(dragonite).toMatchObject({
      hp: 94,
      maxhp: 100,
      status: 'brn',
      position: null,
      boosts: {},
    });
    expect(dragonite?.moves).toEqual(['extremespeed']);
    expect(dragonite).toMatchObject({
      switchedInTurn: 0,
      movedSinceSwitch: true,
      lastMove: 'extremespeed',
      lastMoveTurn: 1,
    });
    expect(view.sides.p2.active[0]?.name).toBe('Gengar');
    expect(view.sides.p2.active[0]).toMatchObject({ switchedInTurn: 1, movedSinceSwitch: false });

    // Items and abilities revealed through `[from]` tags.
    view.applyAll([
      '|-damage|p2a: Gengar|80/100|[from] item: Life Orb',
      '|-heal|p1a: Charizard|90/155|[from] item: Leftovers',
      '|-unboost|p1a: Charizard|atk|1|[from] ability: Intimidate|[of] p2a: Gengar',
    ]);
    expect(view.sides.p2.active[0]).toMatchObject({ item: 'lifeorb', ability: 'intimidate' });
    expect(charizard?.item).toBe('leftovers');
    expect(view.field).toEqual({
      weather: 'sunnyday',
      terrain: null,
      pseudoWeather: ['trickroom'],
    });
    expect(view.sides.p2.conditions).toEqual({ tailwind: 1 });

    view.applyAll([
      '|-fieldend|move: Trick Room',
      '|-weather|none',
      '|faint|p2a: Gengar',
      '|win|Yo',
    ]);
    expect(view.field.pseudoWeather).toEqual([]);
    expect(view.field.weather).toBeNull();
    expect(view.getPokemon('p2a: Gengar')?.fainted).toBe(true);
    expect(view.winner).toBe('p1');
  });
});

describe('SeededRandom', () => {
  it('is reproducible', () => {
    const a = new SeededRandom('x');
    const b = new SeededRandom('x');
    const sequence = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(sequence);
    expect(new SeededRandom('y').next()).not.toBe(sequence[0]);
    expect(new SeededRandom('z').shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});
