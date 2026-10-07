// @vitest-environment happy-dom
import type { PokemonSet } from '@colleja/core';
import type {
  ListOpponentsResponse,
  MetaResponse,
  OpponentResponse,
  OpponentSummary,
  RandomTeamResponse,
  TeamResponse,
} from '@colleja/protocol';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetupPage } from '../src/features/setup/SetupPage';
import { DEFAULT_FORM, toStartMessage, useSetup } from '../src/features/setup/setup-store';
import { OPPONENT_DESTINATION, TEAM_DESTINATION } from '../src/features/teams/editor-destination';
import { OpponentsPage } from '../src/features/teams/OpponentsPage';
import { TeamEditorPage } from '../src/features/teams/TeamEditorPage';
import { addMember } from '../src/features/teams/team-draft';
import { useTeamEditor } from '../src/features/teams/team-editor-store';

const META: MetaResponse = {
  regulation: 'M-C',
  showdown: { commit: 'abc', date: '2026-10-01' },
  botLevels: [
    { level: 0, name: 'Aleatorio', description: 'Al azar.' },
    { level: 1, name: 'Agresivo', description: 'Daño.' },
    { level: 2, name: 'Táctico', description: 'Simula.' },
  ],
  defaultBotLevel: 2,
};

const GARCHOMP: PokemonSet = {
  species: 'garchomp',
  ability: 'roughskin',
  nature: 'jolly',
  statPoints: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  moves: ['earthquake', 'dragonclaw'],
};

const SUMMARY: OpponentSummary = {
  id: 'rival-1',
  name: 'Lluvia rival',
  mode: 'doubles',
  species: ['pelipper', 'archaludon'],
  valid: true,
  problems: [],
  updatedAt: '2026-10-08T10:00:00.000Z',
  botLevel: 1,
};

type Handler = (init: RequestInit | undefined, url: string) => Response | Promise<Response>;

/** A fake server: `"METHOD /path"` → handler. Unknown requests fail the test. */
function stubServer(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Petición inesperada: ${key}`);
    return handler(init, url);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const bodyOf = (init: RequestInit | undefined) => JSON.parse(String(init?.body));

beforeEach(() => {
  useSetup.setState(DEFAULT_FORM);
  useTeamEditor.getState().startNew(TEAM_DESTINATION, 'singles');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('team editor store', () => {
  it('saves teams to /api/teams and opponents (with their difficulty) to /api/opponents', async () => {
    const fetchMock = stubServer({
      'POST /api/teams': (init) => {
        const { team } = bodyOf(init);
        const response: TeamResponse = {
          team: { ...team, id: 'equipo-1' },
          problems: [],
          adjustments: [],
          updatedAt: '2026-10-08T10:00:00.000Z',
        };
        return Response.json(response, { status: 201 });
      },
      'POST /api/opponents': (init) => {
        const { opponent } = bodyOf(init);
        const response: OpponentResponse = {
          opponent: { ...opponent, id: 'rival-1' },
          problems: [],
          adjustments: [],
          updatedAt: '2026-10-08T10:00:00.000Z',
        };
        return Response.json(response, { status: 201 });
      },
    });
    const editor = useTeamEditor.getState();

    editor.startNew(TEAM_DESTINATION, 'singles');
    useTeamEditor.getState().edit((draft) => addMember(draft, 'garchomp'));
    expect(await useTeamEditor.getState().save()).toBe('equipo-1');
    const teamBody = bodyOf(fetchMock.mock.calls[0]?.[1]);
    expect(teamBody.team).not.toHaveProperty('botLevel');

    editor.startNew(OPPONENT_DESTINATION, 'doubles');
    useTeamEditor.getState().edit((draft) => ({ ...addMember(draft, 'garchomp'), botLevel: 0 }));
    expect(await useTeamEditor.getState().save()).toBe('rival-1');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/opponents');
    expect(bodyOf(fetchMock.mock.calls[1]?.[1]).opponent).toMatchObject({
      name: 'Rival nuevo',
      mode: 'doubles',
      botLevel: 0,
    });
    expect(useTeamEditor.getState()).toMatchObject({
      savedId: 'rival-1',
      destination: OPPONENT_DESTINATION,
    });
  });
});

function renderOpponentRoutes(initialEntry: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>Inicio</p> },
      { path: '/rivales', element: <OpponentsPage /> },
      { path: '/rivales/nuevo', element: <TeamEditorPage destination={OPPONENT_DESTINATION} /> },
      { path: '/rivales/:id', element: <TeamEditorPage destination={OPPONENT_DESTINATION} /> },
    ],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('opponents pages', () => {
  it('"Generar aleatorio" opens the editor with an unsaved draft and its difficulty', async () => {
    const random: RandomTeamResponse = { seed: 'x', team: [GARCHOMP], text: '' };
    const fetchMock = stubServer({
      'GET /api/meta': () => Response.json(META),
      'GET /api/opponents': () => Response.json({ opponents: [] } satisfies ListOpponentsResponse),
      'POST /api/teams/random': () => Response.json(random),
    });
    renderOpponentRoutes('/rivales');

    expect(await screen.findByText(/Aún no tienes rivales guardados/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Generar aleatorio para dobles' }));

    expect(await screen.findByText('Cambios sin guardar')).toBeTruthy();
    expect(screen.getByLabelText('Nombre del rival')).toHaveProperty('value', 'Rival aleatorio');
    const level = screen.getByRole('combobox', { name: /Dificultad/ });
    await waitFor(() =>
      expect(within(level).getByRole('option', { name: /Táctico/ })).toBeTruthy(),
    );
    expect(level).toHaveProperty('value', '2');
    expect(useTeamEditor.getState().draft).toMatchObject({ mode: 'doubles', members: [GARCHOMP] });
    expect(bodyOf(fetchMock.mock.calls.find(([url]) => url === '/api/teams/random')?.[1])).toEqual({
      mode: 'doubles',
    });
    // Nothing was saved.
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => init?.method === 'POST' && init.body?.toString().includes('opponent'),
      ),
    ).toBe(false);

    // Changing the difficulty is an edit like any other.
    fireEvent.change(level, { target: { value: '1' } });
    expect(useTeamEditor.getState().draft.botLevel).toBe(1);
  });

  it('lists the opponents with their difficulty and deletes one only after confirming', async () => {
    let opponents = [SUMMARY];
    const fetchMock = stubServer({
      'GET /api/meta': () => Response.json(META),
      'GET /api/opponents': () => Response.json({ opponents }),
      'DELETE /api/opponents/rival-1': () => {
        opponents = [];
        return new Response(null, { status: 204 });
      },
    });
    renderOpponentRoutes('/rivales');

    const card = (await screen.findByText('Lluvia rival')).closest('li');
    if (!card) throw new Error('no card');
    await waitFor(() => expect(within(card).getByText(/Dobles · Agresivo/)).toBeTruthy());

    fireEvent.click(within(card).getByRole('button', { name: 'Borrar' }));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/opponents/rival-1', { method: 'DELETE' });
    fireEvent.click(within(card).getByRole('button', { name: 'Sí, borrar' }));
    await waitFor(() => expect(screen.queryByText('Lluvia rival')).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith('/api/opponents/rival-1', { method: 'DELETE' });
  });

  it('"Usar como rival" takes the opponent and its difficulty to the start screen', async () => {
    stubServer({
      'GET /api/meta': () => Response.json(META),
      'GET /api/opponents': () => Response.json({ opponents: [SUMMARY] }),
    });
    const router = renderOpponentRoutes('/rivales');
    fireEvent.click(await screen.findByRole('button', { name: 'Usar como rival' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(useSetup.getState()).toMatchObject({
      opponentKind: 'saved',
      opponentId: 'rival-1',
      botLevel: 1,
      mode: 'doubles',
    });
  });
});

describe('start screen with a saved opponent', () => {
  it('applies the difficulty of the picked opponent, which can still be changed', async () => {
    stubServer({
      'GET /api/meta': () => Response.json(META),
      'GET /api/teams': () => Response.json({ teams: [] }),
      'GET /api/opponents': () => Response.json({ opponents: [SUMMARY] }),
    });
    const router = createMemoryRouter([{ path: '/', element: <SetupPage /> }]);
    render(<RouterProvider router={router} />);

    const rival = screen.getByRole('group', { name: 'Equipo rival' });
    fireEvent.click(within(rival).getByRole('radio', { name: 'Guardado' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Lluvia rival' }));
    expect(useSetup.getState()).toMatchObject({ opponentId: 'rival-1', botLevel: 1 });

    fireEvent.click(await screen.findByRole('radio', { name: 'Táctico' }));
    expect(useSetup.getState().botLevel).toBe(2);
    expect(screen.getByText(/se guardó con la dificultad Agresivo/)).toBeTruthy();
    expect(toStartMessage(useSetup.getState())).toMatchObject({
      opponent: { kind: 'saved', opponentId: 'rival-1' },
      botLevel: 2,
    });
  });
});
