// @vitest-environment happy-dom
import type { TurnExplanation } from '@colleja/core';
import type { CalcResponse, ReplaySummary, SavedReplay, ServerMessage } from '@colleja/protocol';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBattle } from '../src/features/battle/battle-store';
import { actionText, BotExplanation } from '../src/features/battle/components/BotExplanation';
import { EndPanel } from '../src/features/battle/components/EndPanel';
import { CalculatorPage, koText } from '../src/features/calc/CalculatorPage';
import { emptyCalcField, standardSide, useCalc } from '../src/features/calc/calc-store';
import { ReplaysPage } from '../src/features/replays/ReplaysPage';
import { replayFrame, replaySteps } from '../src/features/replays/replay-steps';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const EXPLANATION: TurnExplanation = {
  turn: 1,
  kind: 'moves',
  method: 'Balance de PS tras simular el intercambio.',
  options: [
    {
      actions: [
        {
          kind: 'move',
          user: 'garchomp',
          move: 'earthquake',
          target: 'incineroar',
          targetSide: 'p1',
        },
      ],
      score: 40,
      chosen: true,
    },
    { actions: [{ kind: 'move', user: 'garchomp', move: 'dragonclaw' }], score: 10, chosen: false },
  ],
};

describe('bot explanation', () => {
  it('describes every kind of action from the bot side', () => {
    expect(
      actionText({ kind: 'move', user: 'garchomp', move: 'earthquake', mega: true }, 'es'),
    ).toBe('Garchomp: Terremoto + Megaevolución');
    expect(
      actionText(
        { kind: 'move', user: 'garchomp', move: 'protect', target: 'incineroar', targetSide: 'p2' },
        'es',
      ),
    ).toBe('Garchomp: Protección → su aliado Incineroar');
    expect(actionText({ kind: 'switch', user: 'garchomp', species: 'gengar' }, 'es')).toBe(
      'Garchomp → entra Gengar',
    );
    expect(actionText({ kind: 'hidden', user: 'garchomp' }, 'es')).toBe(
      'Garchomp: algo que aún no has visto',
    );
  });

  it('lists the options of the last resolved turn with the chosen one marked', () => {
    render(<BotExplanation explanations={[EXPLANATION, { ...EXPLANATION, turn: 2 }]} />);
    expect(screen.getByRole('combobox')).toHaveProperty('value', '2');
    const options = within(screen.getByRole('list', { name: 'Opciones valoradas por el bot' }));
    expect(options.getAllByRole('listitem')).toHaveLength(2);
    expect(options.getByText(/Elegida/).parentElement?.textContent).toContain(
      'Garchomp: Terremoto → tu Incineroar',
    );
  });
});

describe('bot train of thought panel', () => {
  it('tells how the bot thought before listing its options', () => {
    render(
      <BotExplanation
        explanations={[
          {
            ...EXPLANATION,
            options: EXPLANATION.options.map((option) => ({ ...option, versus: [option.score] })),
            expected: [
              {
                actions: [{ kind: 'move', user: 'incineroar', move: 'fakeout' }],
                probability: 0.7,
              },
            ],
          },
        ]}
      />,
    );
    const story = within(screen.getByRole('list', { name: 'Cómo lo pensó el bot' }));
    expect(story.getByText('Esperaba sobre todo Sorpresa de tu Incineroar (70 %).')).toBeTruthy();
    expect(
      story.getByText(
        'Contra lo que más esperaba, «Garchomp: Terremoto → tu Incineroar» era lo mejor: salía ganando.',
      ),
    ).toBeTruthy();
  });
});

const PREVIEW_EXPLANATION: TurnExplanation = {
  turn: 0,
  kind: 'team',
  method: 'Balance de PS…',
  options: [
    {
      actions: [
        { kind: 'bring', species: 'garchomp', lead: true },
        { kind: 'hidden' },
        { kind: 'hidden' },
      ],
      score: 12.5,
      chosen: true,
    },
  ],
  preview: {
    rivals: [
      {
        species: 'incineroar',
        role: 'support',
        speed: [80, 95],
        notable: ['fakeout'],
        threat: 20,
        brought: 0.8,
        lead: 0.6,
      },
      {
        species: 'gengar',
        role: 'special',
        speed: [178, 178],
        notable: [],
        threat: -10,
        brought: 0.4,
        lead: 0.1,
      },
    ],
    own: [{ species: 'garchomp', speed: 169 }],
    matchups: [
      {
        own: 'garchomp',
        rival: 'incineroar',
        speed: 'faster',
        dealt: { move: 'earthquake', min: 52, max: 62, hits: 2, koChance: 0 },
      },
      {
        own: 'garchomp',
        rival: 'gengar',
        speed: 'slower',
        dealt: { min: 105, max: 124, hits: 1, koChance: 1 },
        taken: { move: 'shadowball', min: 40, max: 47, hits: 3, koChance: 0 },
      },
    ],
    hiddenOwn: 5,
  },
};

describe('bot thinking at team preview', () => {
  it('reads each of your Pokémon and says what it expected and brought', () => {
    render(<BotExplanation explanations={[PREVIEW_EXPLANATION, EXPLANATION]} />);
    const picker = screen.getByRole('combobox', { name: 'Decisión' });
    expect(within(picker).getByRole('option', { name: 'Antes del combate' })).toBeTruthy();
    fireEvent.change(picker, { target: { value: '0' } });

    const story = within(screen.getByRole('list', { name: 'Cómo lo pensó el bot' }));
    expect(story.getByText(/Esperaba que trajeras sobre todo a Incineroar \(80 %\)/)).toBeTruthy();
    expect(story.getByText('Lo que más temía de tu equipo: Incineroar.')).toBeTruthy();
    expect(story.getByText(/con Garchomp de líder; los otros 2 aún no los has visto/)).toBeTruthy();

    const cards = within(screen.getByRole('list', { name: 'Lo que analizó el bot de tu equipo' }));
    const [incineroar, gengar] = cards.getAllByRole('listitem');
    expect(incineroar?.textContent).toContain('Apoyo');
    expect(incineroar?.textContent).toContain('Más rápidos que élGarchomp (169)');
    expect(incineroar?.textContent).toContain('Lo tumban en dosGarchomp (Terremoto 52–62 %)');
    expect(incineroar?.textContent).toContain('Destaca por Sorpresa');
    // A move the player has not seen yet is left out.
    expect(gengar?.textContent).toContain('Lo tumban de un golpeGarchomp (105–124 %)');
    expect(gengar?.textContent).not.toContain('Tumba');
    expect(screen.getByText('Sin 5 de los suyos que aún no has visto')).toBeTruthy();
    expect(actionText({ kind: 'bring', species: 'garchomp', lead: true }, 'es')).toBe(
      'Lidera Garchomp',
    );
  });
});

describe('bot beliefs', () => {
  it('shows what the bot believes about your Pokémon', () => {
    render(
      <BotExplanation
        explanations={[
          {
            ...EXPLANATION,
            beliefs: [
              {
                species: 'garchomp',
                guesses: [
                  {
                    probability: 0.62,
                    item: 'choicescarf',
                    ability: 'roughskin',
                    nature: 'jolly',
                    statPoints: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
                    moves: ['earthquake'],
                    variant: true,
                  },
                ],
              },
            ],
          },
        ]}
      />,
    );
    const beliefs = within(screen.getByRole('list', { name: 'Lo que cree el bot de tu equipo' }));
    expect(beliefs.getByText('Garchomp')).toBeTruthy();
    expect(beliefs.getByText('62 %')).toBeTruthy();
    expect(beliefs.getByText(/Pañuelo Elección · Alegre · 32 Atq 32 Vel · Terremoto/)).toBeTruthy();
    expect(beliefs.getByText('Reparto propio')).toBeTruthy();
  });
});

describe('battle store', () => {
  it('collects explanations, replaces them on snapshots and remembers the saved replay', () => {
    const status = { turn: 2, rewindableTurns: [], undoTarget: null, ended: false, winner: null };
    const update: ServerMessage = {
      type: 'battle:update',
      battleId: 'b1',
      lines: [],
      request: null,
      status,
      explanations: [EXPLANATION],
    };
    useBattle.getState().receive(update);
    useBattle.getState().receive({ ...update, explanations: [{ ...EXPLANATION, turn: 2 }] });
    expect(useBattle.getState().explanations.map((explanation) => explanation.turn)).toEqual([
      1, 2,
    ]);

    useBattle.getState().receive({
      type: 'battle:snapshot',
      battleId: 'b1',
      log: [],
      request: null,
      status: { ...status, ended: true },
      explanations: [EXPLANATION],
    });
    expect(useBattle.getState().explanations).toEqual([EXPLANATION]);
    useBattle.getState().receive({ type: 'battle:replay-saved', battleId: 'b1', replayId: 'r1' });
    expect(useBattle.getState().savedReplayId).toBe('r1');
  });

  it('end panel saves the replay once and then links to it', () => {
    const onSave = vi.fn();
    const props = {
      status: {
        turn: 3,
        rewindableTurns: [],
        undoTarget: null,
        ended: true,
        winner: 'p1' as const,
      },
      seed: 's',
      rivalName: 'Bot',
      busy: false,
      onRematch: vi.fn(),
      onExport: vi.fn(),
      onSave,
      onNew: vi.fn(),
    };
    const router = createMemoryRouter([
      { path: '/', element: <EndPanel {...props} savedReplayId={null} /> },
    ]);
    render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar replay' }));
    expect(onSave).toHaveBeenCalledOnce();
    cleanup();
    const saved = createMemoryRouter([
      { path: '/', element: <EndPanel {...props} savedReplayId="r1" /> },
    ]);
    render(<RouterProvider router={saved} />);
    expect(screen.getByRole('link', { name: /Ver replay/ }).getAttribute('href')).toBe(
      '/replays/r1',
    );
  });
});

describe('replay viewer steps', () => {
  const log = [
    '|start',
    '|switch|p2a: Garchomp|Garchomp, L50|185/185',
    '|turn|1',
    '|move|p2a: Garchomp|Earthquake|p1a: Incineroar',
    '|turn|2',
    '|win|Bot',
  ];
  const replay = {
    id: 'r1',
    name: 'Jugador contra Bot',
    botLevel: 2,
    opponentKind: 'random',
    replay: {
      version: 1,
      mode: 'singles',
      ruleset: 'champions-regmc',
      formatid: 'x',
      options: { teamPreview: true, openTeamSheets: false },
      seed: 's',
      players: { p1: { name: 'Jugador', team: [] }, p2: { name: 'Bot', team: [] } },
      inputLog: [],
      log,
      winner: 'p2',
      turns: 2,
    },
    playerLog: log.map((line) => line.replace('185/185', '100/100')),
    explanations: [EXPLANATION],
  } satisfies SavedReplay;

  it('steps through the start of every turn and the end', () => {
    expect(replaySteps(log)).toEqual([
      { turn: 1, lines: 3, end: false },
      { turn: 2, lines: 5, end: false },
      { turn: 2, lines: 6, end: true },
    ]);
  });

  it('shows the bot reasons of the turn just played, hiding unseen moves as the player', () => {
    // Start of turn 2: turn 1 was just played.
    const all = replayFrame(replay, 'all', 1, 'es');
    expect(all.explanations).toEqual([EXPLANATION]);
    expect(all.view.sides.p2.active[0]?.hp).toBe(185);

    const player = replayFrame(replay, 'player', 1, 'es');
    const [explanation] = player.explanations;
    // Earthquake was used, Dragon Claw was not.
    expect(explanation?.options[0]?.actions[0]).toMatchObject({ kind: 'move', move: 'earthquake' });
    expect(explanation?.options[1]?.actions[0]).toEqual({ kind: 'hidden', user: 'garchomp' });
    expect(player.view.sides.p2.active[0]?.maxhp).toBe(100);

    expect(replayFrame(replay, 'all', 0, 'es').explanations).toEqual([]);
  });
});

describe('calculator', () => {
  const RESULT: CalcResponse = {
    attacker: { species: 'garchomp' },
    defender: { species: 'incineroar', hp: 202, maxhp: 202 },
    rolls: [164, 194],
    min: 164,
    max: 194,
    minPercent: 81.2,
    maxPercent: 96,
    koChance: 0,
    hitsToKo: { best: 2, worst: 2 },
    accuracy: 1,
    moveType: 'Ground',
  };

  beforeEach(() => {
    useCalc.setState({
      attacker: standardSide('garchomp'),
      defender: standardSide('incineroar'),
      field: emptyCalcField(),
    });
  });

  it('describes the knock-out chances', () => {
    expect(koText(RESULT, { hpPercent: 100 })).toBe('2 golpes para KO');
    expect(koText({ ...RESULT, koChance: 0.625 }, { hpPercent: 50 })).toBe(
      '62,5 % de KO de un golpe desde el 50 % de PS',
    );
    expect(koText({ ...RESULT, koChance: 1, accuracy: 0.9 }, { hpPercent: 100 })).toBe(
      'KO seguro (si acierta: 90 %)',
    );
    expect(koText({ ...RESULT, hitsToKo: { best: 2, worst: 3 } }, { hpPercent: 100 })).toBe(
      '2–3 golpes para KO',
    );
  });

  it('asks the server for every attacker move with the current state', async () => {
    const fetchMock = vi.fn(async () => Response.json(RESULT));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <RouterProvider router={createMemoryRouter([{ path: '/', element: <CalculatorPage /> }])} />,
    );

    const moves = useCalc.getState().attacker.set.moves;
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(moves.length));
    const bodies = fetchMock.mock.calls.map((call) =>
      JSON.parse(String((call as unknown as [string, RequestInit])[1].body)),
    );
    expect(bodies.map((body) => body.move).sort()).toEqual([...moves].sort());
    expect(await screen.findAllByText('81.2–96 %')).not.toHaveLength(0);

    fireEvent.change(screen.getByLabelText('PS del defensor (%)'), { target: { value: '50' } });
    await waitFor(() =>
      expect(
        JSON.parse(
          String((fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body),
        ).defender.hpPercent,
      ).toBe(50),
    );

    // Critical hits, and the doubles-only effects only in doubles.
    fireEvent.click(screen.getByLabelText('Crítico'));
    await waitFor(() =>
      expect(
        JSON.parse(
          String((fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body),
        ).crit,
      ).toBe(true),
    );
    expect(screen.queryByLabelText('Refuerzo')).toBeNull();
    useCalc.getState().updateField({ mode: 'doubles', helpingHand: true });
    await waitFor(() =>
      expect(
        JSON.parse(
          String((fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body),
        ).field,
      ).toMatchObject({ doubles: true, helpingHand: true }),
    );
    expect(screen.getByLabelText('Refuerzo')).toBeTruthy();
  });
});

describe('replay list', () => {
  const SUMMARY: ReplaySummary = {
    id: 'r1',
    name: 'Jugador contra Bot Experto',
    mode: 'singles',
    players: { p1: 'Jugador', p2: 'Bot Experto' },
    species: { p1: ['garchomp'], p2: ['incineroar'] },
    winner: 'p1',
    turns: 12,
    botLevel: 3,
    opponentKind: 'random',
    updatedAt: '2026-10-08T10:00:00.000Z',
  };

  it('renames a replay in place', async () => {
    let name = SUMMARY.name;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        name = JSON.parse(String(init.body)).name;
        return Response.json({ replay: { id: 'r1', name }, updatedAt: SUMMARY.updatedAt });
      }
      if (url.endsWith('/meta')) return Response.json({ botLevels: [] });
      return Response.json({ replays: [{ ...SUMMARY, name }] });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <RouterProvider router={createMemoryRouter([{ path: '/', element: <ReplaysPage /> }])} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Renombrar' }));
    const input = screen.getByLabelText('Nombre del replay');
    fireEvent.change(input, { target: { value: '  Remontada  ' } });
    fireEvent.submit(input);

    expect(await screen.findByRole('link', { name: 'Remontada' })).toBeTruthy();
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch?.[0]).toBe('/api/replays/r1');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ name: 'Remontada' });
  });
});
