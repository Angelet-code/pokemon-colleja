// @vitest-environment happy-dom
import type {
  MetagameResponse,
  MetagameTeamSummary,
  MetaResponse,
  OpponentResponse,
} from '@colleja/protocol';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetupPage } from '../src/features/setup/SetupPage';
import { DEFAULT_FORM, toStartMessage, useSetup } from '../src/features/setup/setup-store';
import { monthName, percent } from '../src/features/teams/MetagameSection';
import { OpponentsPage } from '../src/features/teams/OpponentsPage';
import { DEFAULT_OPPONENT_LEVEL } from '../src/features/teams/team-draft';

const META: MetaResponse = {
  regulation: 'M-C',
  showdown: { commit: 'abc', date: '2026-10-01' },
  botLevels: [{ level: 3, name: 'Experto', description: 'Busca.' }],
  defaultBotLevel: 3,
};

const team = (id: string, name: string, mode: 'singles' | 'doubles', weight: number) =>
  ({
    id,
    snapshotId: '2026-09-1760',
    name,
    mode,
    species: ['garchomp', 'pelipper'],
    shiny: [false, false],
    valid: true,
    problems: [],
    updatedAt: '2026-10-12T00:00:00.000Z',
    archetype: '',
    weight,
  }) satisfies MetagameTeamSummary;

const METAGAME: MetagameResponse = {
  snapshot: {
    id: '2026-09-1760',
    month: '2026-09',
    cutoff: 1760,
    createdAt: '2026-10-12T00:00:00.000Z',
    sources: [
      {
        mode: 'doubles',
        format: 'gen9championsvgc2026regmc',
        battles: 1_631_943,
        teamsFrom: 'replays',
        samples: 4000,
        coverage: 0.68,
        discarded: 0,
      },
    ],
  },
  teams: [
    team('doubles-01', 'Lluvia · Mega-Swampert + Pelipper', 'doubles', 0.6),
    team('doubles-02', 'Sol · Mega-Charizard Y + Garchomp', 'doubles', 0.4),
    team('singles-01', 'Mega-Salamence + Garchomp', 'singles', 1),
  ],
  older: [],
  update: { running: false, step: null, error: null },
};

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

function stubServer(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const handler = routes[`${init?.method ?? 'GET'} ${url}`];
    if (!handler) throw new Error(`Petición inesperada: ${init?.method ?? 'GET'} ${url}`);
    return handler(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderRivals() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>Inicio</p> },
      { path: '/rivales', element: <OpponentsPage /> },
      { path: '/rivales/:id', element: <p>Editor</p> },
    ],
    { initialEntries: ['/rivales?seccion=meta'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  useSetup.setState(DEFAULT_FORM);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('metagame section', () => {
  it('formats months and shares in Spanish', () => {
    expect(monthName('2026-09')).toBe('septiembre de 2026');
    expect(percent(0.136)).toBe('13,6 %');
  });

  it('lists the teams of each mode with their share, read only', async () => {
    stubServer({
      'GET /api/metagame': () => Response.json(METAGAME),
      'GET /api/metagame/latest': () =>
        Response.json({ month: '2026-10', newer: true, error: null }),
    });
    renderRivals();
    const doubles = await screen.findByRole('list', { name: 'Meta de dobles' });
    expect(within(doubles).getAllByRole('listitem')).toHaveLength(2);
    expect(within(doubles).getByText('60,0 %')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Meta de individuales' })).toBeTruthy();
    expect(await screen.findByText('Smogon ya tiene el meta de octubre de 2026.')).toBeTruthy();
    // Nothing to edit or delete.
    expect(screen.queryByRole('button', { name: 'Borrar' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Editar' })).toBeNull();
  });

  it('uses a team as the rival and copies one to «Mis rivales»', async () => {
    const fetchMock = stubServer({
      'GET /api/metagame': () => Response.json(METAGAME),
      'GET /api/metagame/latest': () => Response.json({ month: null, newer: false, error: null }),
      'POST /api/metagame/2026-09-1760/teams/doubles-02/copy': () => {
        const response = {
          opponent: { id: 'copia-1' },
          problems: [],
          adjustments: [],
          updatedAt: '',
        } as unknown as OpponentResponse;
        return Response.json(response, { status: 201 });
      },
    });
    const router = renderRivals();
    const doubles = await screen.findByRole('list', { name: 'Meta de dobles' });
    const [first, second] = within(doubles).getAllByRole('listitem');

    fireEvent.click(within(second as HTMLElement).getByRole('button', { name: /Copiar/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/rivales/copia-1'));
    const copy = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/copy'));
    expect(JSON.parse(String(copy?.[1]?.body))).toEqual({ botLevel: DEFAULT_OPPONENT_LEVEL });

    await router.navigate('/rivales?seccion=meta');
    const again = await screen.findByRole('list', { name: 'Meta de dobles' });
    fireEvent.click(
      within(within(again).getAllByRole('listitem')[0] as HTMLElement).getByRole('button', {
        name: 'Usar como rival',
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(useSetup.getState()).toMatchObject({
      opponentKind: 'metagame',
      metagameSnapshotId: '2026-09-1760',
      metagameTeamId: 'doubles-01',
      mode: 'doubles',
    });
    expect(first).toBeTruthy();
  });

  it('starts the update and shows what it is doing', async () => {
    let running = false;
    stubServer({
      'GET /api/metagame': () =>
        Response.json(
          running
            ? { ...METAGAME, update: { running: true, step: 'Descargando…', error: null } }
            : { ...METAGAME, snapshot: null, teams: [] },
        ),
      'GET /api/metagame/latest': () => Response.json({ month: null, newer: false, error: null }),
      'POST /api/metagame/update': () => {
        running = true;
        return Response.json({ running: true, step: 'Empezando…', error: null }, { status: 202 });
      },
    });
    renderRivals();
    expect(await screen.findByText('Aún no hay meta.')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Actualizar meta' })[0] as HTMLElement);
    expect(await screen.findByText('Descargando…')).toBeTruthy();
  });
});

describe('start screen with a metagame team', () => {
  it('offers the teams of the mode and sends the chosen one', async () => {
    stubServer({
      'GET /api/meta': () => Response.json(META),
      'GET /api/teams': () => Response.json({ teams: [] }),
      'GET /api/opponents': () => Response.json({ opponents: [] }),
      'GET /api/metagame': () => Response.json(METAGAME),
    });
    useSetup.setState({ ...DEFAULT_FORM, mode: 'doubles' });
    const router = createMemoryRouter([{ path: '/', element: <SetupPage /> }]);
    render(<RouterProvider router={router} />);

    const rival = screen.getByRole('group', { name: 'Equipo rival' });
    fireEvent.click(within(rival).getByRole('radio', { name: 'Meta' }));
    const picker = await screen.findByRole('group', { name: 'Equipo del meta' });
    expect(within(picker).getAllByRole('radio')).toHaveLength(2);
    fireEvent.click(
      within(picker).getByRole('radio', { name: 'Sol · Mega-Charizard Y + Garchomp' }),
    );
    expect(toStartMessage(useSetup.getState()).opponent).toEqual({
      kind: 'metagame',
      snapshotId: '2026-09-1760',
      teamId: 'doubles-02',
    });
  });
});
