import type { MoveRequest, RequestPokemon, SwitchRequest, TeamPreviewRequest } from '@colleja/core';

export function pokemon(name: string, condition: string, active: boolean): RequestPokemon {
  return {
    ident: `p1: ${name}`,
    details: `${name}, L50`,
    condition,
    active,
    stats: { atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    moves: [],
    baseAbility: 'blaze',
    item: '',
  };
}

export const SIDE = {
  name: 'Yo',
  id: 'p1' as const,
  pokemon: [
    pokemon('Charizard', '155/155', true),
    pokemon('Incineroar', '202/202', true),
    pokemon('Garchomp', '185/185', false),
    pokemon('Sinistcha', '0 fnt', false),
  ],
};

export const DOUBLES_MOVE: MoveRequest = {
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
        { move: 'Fake Out', id: 'fakeout', pp: 16, maxpp: 16, target: 'normal' },
        { move: 'Helping Hand', id: 'helpinghand', pp: 20, maxpp: 20, target: 'adjacentAlly' },
      ],
      canMegaEvo: true,
    },
  ],
  side: SIDE,
};

/** Both actives fainted, a single replacement left: the second slot has to pass. */
export const DOUBLES_FORCED: SwitchRequest = {
  forceSwitch: [true, true],
  side: {
    ...SIDE,
    pokemon: [
      pokemon('Charizard', '0 fnt', true),
      pokemon('Incineroar', '0 fnt', true),
      pokemon('Garchomp', '185/185', false),
      pokemon('Sinistcha', '0 fnt', false),
    ],
  },
};

export const TEAM_PREVIEW: TeamPreviewRequest = {
  teamPreview: true,
  maxChosenTeamSize: 3,
  side: {
    ...SIDE,
    pokemon: ['Charizard', 'Incineroar', 'Garchomp', 'Sinistcha', 'Kingambit', 'Gholdengo'].map(
      (name) => pokemon(name, '100/100', false),
    ),
  },
};
