import type { DecisionExplanation, ExpectedReply, ExplainedOption } from '@colleja/core';
import { describe, expect, it } from 'vitest';
import { explanationStory } from '../src/features/battle/explanation-story';

const label = (option: ExplainedOption): string =>
  option.actions.map((action) => (action.kind === 'move' ? action.move : action.kind)).join(' · ');

const SINGLES: DecisionExplanation = {
  kind: 'moves',
  method: 'Balance de PS.',
  options: [
    {
      actions: [{ kind: 'move', user: 'gengar', move: 'shadowball' }],
      score: 20,
      chosen: false,
      versus: [40, -30],
    },
    {
      actions: [{ kind: 'move', user: 'gengar', move: 'protect' }],
      score: 25,
      chosen: true,
      versus: [10, 30],
    },
  ],
  expected: [
    { actions: [{ kind: 'move', user: 'garchomp', move: 'earthquake' }], probability: 0.6 },
    {
      actions: [{ kind: 'switch', user: 'garchomp', species: 'gyarados' }],
      probability: 0.3,
      counter: true,
    },
  ],
};

describe('bot train of thought', () => {
  it('says what it expected, what it ruled out and why it chose', () => {
    expect(explanationStory(SINGLES, 'es', label)).toEqual([
      'Esperaba sobre todo Terremoto de tu Garchomp (60 %).',
      'También contaba con un cambio a Gyarados (30 %).',
      'Como sueles anticiparte a la jugada obvia, le dio más peso a un cambio a Gyarados (30 %).',
      'El resto de tus opciones lo descartó: las veía peores para ti.',
      'Contra lo que más esperaba, lo mejor habría sido «shadowball», pero «protect» le cubría mejor por si elegías un cambio a Gyarados.',
    ]);
  });

  it('says the choice was the best against the likeliest reply', () => {
    const sure: DecisionExplanation = {
      ...SINGLES,
      options: SINGLES.options.map((option) => ({ ...option, chosen: !option.chosen })),
      expected: [{ ...(SINGLES.expected?.[0] as ExpectedReply), probability: 0.9 }],
    };
    const story = explanationStory(sure, 'es', label);
    expect(story[0]).toBe('Estaba casi seguro de lo que harías: Terremoto de tu Garchomp (90 %).');
    expect(story.at(-1)).toBe(
      'Contra lo que más esperaba, «shadowball» era lo mejor: salía ganando.',
    );
  });

  it('groups what it expected from each Pokémon in doubles', () => {
    const doubles: DecisionExplanation = {
      kind: 'moves',
      method: 'Balance de PS.',
      options: [
        {
          actions: [{ kind: 'move', user: 'maushold', move: 'protect' }],
          score: 5,
          chosen: true,
          versus: [5, null],
        },
      ],
      expected: [
        {
          actions: [
            {
              kind: 'move',
              user: 'kangaskhan',
              move: 'doubleedge',
              target: 'maushold',
              targetSide: 'p2',
            },
            {
              kind: 'move',
              user: 'toxicroak',
              move: 'fakeout',
              target: 'maushold',
              targetSide: 'p2',
            },
          ],
          probability: 0.5,
        },
        {
          actions: [
            { kind: 'move', user: 'kangaskhan', move: 'bodyslam', mega: true },
            { kind: 'move', user: 'toxicroak', move: 'protect' },
          ],
          probability: 0.4,
        },
      ],
    };
    expect(explanationStory(doubles, 'es', label)).toEqual([
      'De tu Kangaskhan esperaba sobre todo Doble Filo contra su Maushold (50 %); si no, megaevolución y Golpe Cuerpo (40 %).',
      'De tu Toxicroak esperaba sobre todo Sorpresa contra su Maushold (50 %); si no, Protección (40 %).',
      'El resto de tus opciones lo descartó: las veía peores para ti.',
      'Contra lo que más esperaba, «protect» era lo mejor: quedaba parejo.',
    ]);
  });

  it('says nothing when the bot did not anticipate the player', () => {
    expect(explanationStory({ ...SINGLES, expected: undefined }, 'es', label)).toEqual([]);
  });
});
