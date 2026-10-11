import type { DecisionExplanation, ExpectedReply, ExplainedOption } from '@colleja/core';
import { describe, expect, it } from 'vitest';
import { explanationStory, leadStory, teamStory } from '../src/features/battle/explanation-story';

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

describe('team reading (fase 15)', () => {
  it('names the archetypes, who sets them up and who profits, and the group that fits', () => {
    const story = teamStory(
      {
        archetypes: [
          {
            kind: 'trickroom',
            strength: 1,
            setters: ['farigiraf'],
            abusers: ['torkoal', 'kingambit'],
          },
          { kind: 'setup', strength: 0.5, setters: ['indeedeef', 'incineroar'], abusers: [] },
        ],
        group: ['farigiraf', 'torkoal', 'kingambit', 'incineroar'],
        leads: ['farigiraf', 'incineroar'],
      },
      'tu',
      'es',
    );
    expect(story).toEqual([
      'Tu equipo parece de Espacio Raro: lo pone Farigiraf y lo aprovechan Torkoal y Kingambit.',
      'También podría ser de potenciarse con apoyo (Sorpresa o redirección): lo apoyan Indeedee (Hembra) e Incineroar.',
      'Los que mejor encajan para ese plan: Farigiraf, Torkoal, Kingambit e Incineroar, con Farigiraf e Incineroar de salida.',
    ]);
  });

  it('says when a team has no plan', () => {
    expect(teamStory({ archetypes: [] }, 'tu', 'es')).toEqual([
      'No le vio a tu equipo un plan concreto (Espacio Raro, Viento Afín, clima…).',
    ]);
    expect(teamStory({ archetypes: [] }, 'su', 'es')).toEqual([
      'Su equipo no va montado alrededor de un plan concreto.',
    ]);
  });
});

describe('lead pairs (fase 16)', () => {
  it('says in game terms why it expected your leads', () => {
    const story = leadStory(
      {
        pair: ['indeedeef', 'camerupt'],
        probability: 0.36,
        versus: ['kingambit', 'hatterene'],
        reasons: [
          {
            kind: 'combo',
            archetype: 'trickroom',
            setters: ['indeedeef'],
            abusers: ['camerupt', 'conkeldurr'],
            outspeed: ['hatterene'],
          },
          { kind: 'ko', by: ['camerupt'], target: 'kingambit', turn: 1 },
          { kind: 'pressure', by: ['indeedeef', 'camerupt'], target: 'hatterene', damage: 64 },
          { kind: 'redirect', user: 'indeedeef', protects: 'camerupt' },
          { kind: 'avoid', species: 'slowking', threat: 'kingambit' },
        ],
      },
      'tu',
      'es',
    );
    expect(story).toEqual([
      'Por qué esperaba que salieras con Indeedee (Hembra) y Camerupt (36 %) contra sus Kingambit y Hatterene:',
      'Para montar Espacio Raro: tu Indeedee (Hembra) lo pone y tus Camerupt y Conkeldurr se mueven antes que su Hatterene.',
      'Tu Camerupt puede tumbar a su Kingambit en el primer turno.',
      'Tus Indeedee (Hembra) y Camerupt presionan a su Hatterene: le quitan un 64 % en los primeros turnos.',
      'Tu Indeedee (Hembra) atrae los ataques para cubrir a tu Camerupt.',
      'Dejarías atrás a tu Slowking porque su Kingambit lo tumba de un golpe.',
    ]);
  });

  it("tells the bot's own leads from its side", () => {
    const story = leadStory(
      {
        pair: ['pelipper', 'swampert'],
        versus: ['sylveon', 'gengar'],
        reasons: [
          {
            kind: 'combo',
            archetype: 'rain',
            setters: ['pelipper'],
            abusers: ['swampert'],
            outspeed: [],
          },
          { kind: 'ko', by: ['pelipper', 'swampert'], target: 'gengar', turn: 2 },
          { kind: 'fakeout', user: 'pelipper', target: 'sylveon' },
        ],
      },
      'su',
      'es',
    );
    expect(story).toEqual([
      'Por qué salió con Pelipper y Swampert contra tus Sylveon y Gengar:',
      'Para jugar con lluvia: su Pelipper la pone y su Swampert la aprovecha.',
      'Entre sus Pelipper y Swampert pueden tumbar a tu Gengar en el segundo turno.',
      'Sorpresa de su Pelipper a tu Sylveon para que el otro actúe sin riesgo.',
    ]);
  });
});
