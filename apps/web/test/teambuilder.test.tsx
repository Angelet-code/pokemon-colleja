// @vitest-environment happy-dom
import { championsStats, type PokemonSet } from '@colleja/core';
import { canLearn, getName, listMoves } from '@colleja/data';
import type { ListTeamsResponse } from '@colleja/protocol';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SetEditor } from '../src/features/teams/components/SetEditor';
import { StatPointsEditor } from '../src/features/teams/components/StatPointsEditor';
import { TeamsPage } from '../src/features/teams/TeamsPage';
import {
  exportMember,
  newDraft,
  replaceMembers,
  setStatPointOf,
} from '../src/features/teams/team-draft';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const GARCHOMP: PokemonSet = {
  species: 'garchomp',
  ability: 'roughskin',
  nature: 'jolly',
  statPoints: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  moves: ['earthquake', 'dragonclaw'],
};

function StatHarness({ initial }: { initial: PokemonSet }) {
  const [set, setSet] = useState(initial);
  return (
    <StatPointsEditor
      set={set}
      mode="singles"
      mega={set.item === 'garchompite' ? 'garchompmega' : null}
      locale="es"
      onChange={(stat, value) => setSet(setStatPointOf(set, stat, value, 'singles'))}
    />
  );
}

const output = (label: string) => screen.getByLabelText(label).textContent;

describe('StatPointsEditor', () => {
  it('shows the remaining points and the final stats live, clamped to 66/32', () => {
    render(<StatHarness initial={GARCHOMP} />);
    expect(output('Stat Points restantes')).toBe('2');
    expect(output('Ataque final')).toBe(String(championsStats(GARCHOMP).atk));
    expect(output('Velocidad final')).toBe('169');

    // Only 2 points left: asking for 10 gives 2.
    fireEvent.change(screen.getByLabelText('Stat Points de PS (número)'), {
      target: { value: '10' },
    });
    expect(output('Stat Points restantes')).toBe('0');
    expect(output('PS final')).toBe('185');
    expect(screen.getByLabelText('Stat Points de PS')).toHaveProperty('value', '2');

    fireEvent.change(screen.getByLabelText('Stat Points de Ataque'), { target: { value: '0' } });
    expect(output('Stat Points restantes')).toBe('32');
    expect(output('Ataque final')).toBe(
      String(championsStats({ ...GARCHOMP, statPoints: { ...GARCHOMP.statPoints, atk: 0 } }).atk),
    );
  });

  it('adds the stats of the Mega Evolution when holding its stone', () => {
    render(<StatHarness initial={{ ...GARCHOMP, item: 'garchompite' }} />);
    const mega = championsStats(GARCHOMP, { species: 'garchompmega' });
    expect(output('Ataque final (Mega)')).toBe(String(mega.atk));
    expect(output('Velocidad final (Mega)')).toBe(String(mega.spe));
  });
});

describe('SetEditor', () => {
  function renderEditor(set: PokemonSet = GARCHOMP) {
    const onChange = vi.fn<(set: PokemonSet) => void>();
    render(
      <SetEditor
        draft={replaceMembers(newDraft('singles'), [set])}
        index={0}
        locale="es"
        problems={{}}
        onChange={onChange}
        onRemove={vi.fn()}
      />,
    );
    return onChange;
  }

  it('only offers moves of the learnset', () => {
    const onChange = renderEditor();
    const slot = screen.getByRole('combobox', { name: 'Movimiento 3' });
    const unknown = listMoves().find((move) => !canLearn('garchomp', move.id));
    if (!unknown) throw new Error('every move is learnable?');

    fireEvent.focus(slot);
    fireEvent.change(slot, { target: { value: getName('moves', unknown.id) } });
    expect(
      screen.queryByRole('option', { name: new RegExp(`^${getName('moves', unknown.id)}`) }),
    ).toBeNull();

    fireEvent.change(slot, { target: { value: 'Danza Espada' } });
    fireEvent.click(screen.getByRole('option', { name: /^Danza Espada/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...GARCHOMP,
      moves: ['earthquake', 'dragonclaw', 'swordsdance'],
    });
  });

  it('does not offer a move already in another slot', () => {
    renderEditor();
    const slot = screen.getByRole('combobox', { name: 'Movimiento 3' });
    fireEvent.focus(slot);
    fireEvent.change(slot, { target: { value: 'Terremoto' } });
    expect(screen.getByRole('option', { name: /^Terremoto/ }).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });

  it('exports the set and imports another one in its place', () => {
    const onChange = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));
    const dialog = screen.getByRole('dialog', { name: /Exportar Garchomp/ });
    expect(within(dialog).getByRole('textbox')).toHaveProperty('value', exportMember(GARCHOMP));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));
    const importDialog = screen.getByRole('dialog', { name: /Sustituir/ });
    fireEvent.change(within(importDialog).getByRole('textbox'), {
      target: {
        value:
          'Gengar @ Gengarite\nAbility: Cursed Body\nEVs: 32 SpA / 32 Spe\nTimid Nature\n- Shadow Ball',
      },
    });
    fireEvent.click(within(importDialog).getByRole('button', { name: 'Importar' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ species: 'gengar', item: 'gengarite', moves: ['shadowball'] }),
    );
  });
});

describe('TeamsPage', () => {
  const LIST: ListTeamsResponse = {
    teams: [
      {
        id: 'equipo-1',
        name: 'Lluvia',
        mode: 'doubles',
        species: ['pelipper', 'archaludon'],
        valid: false,
        problems: ['El equipo debe tener 6 Pokémon (tiene 2).'],
        updatedAt: '2026-10-08T10:00:00.000Z',
      },
    ],
  };

  it('lists the saved teams and deletes one only after confirming', async () => {
    let teams = LIST.teams;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        teams = teams.filter((team) => !url.endsWith(team.id));
        return new Response(null, { status: 204 });
      }
      return Response.json({ teams });
    });
    vi.stubGlobal('fetch', fetchMock);
    const router = createMemoryRouter([{ path: '/equipos', element: <TeamsPage /> }], {
      initialEntries: ['/equipos'],
    });
    render(<RouterProvider router={router} />);

    const card = (await screen.findByText('Lluvia')).closest('li');
    if (!card) throw new Error('no card');
    expect(within(card).getByText('1 problema')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Usar en combate' })).toHaveProperty(
      'disabled',
      true,
    );

    fireEvent.click(within(card).getByRole('button', { name: 'Borrar' }));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), { method: 'DELETE' });
    fireEvent.click(within(card).getByRole('button', { name: 'No' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Borrar' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Sí, borrar' }));

    await waitFor(() => expect(screen.queryByText('Lluvia')).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith('/api/teams/equipo-1', { method: 'DELETE' });
    expect(await screen.findByText(/Aún no tienes equipos guardados/)).toBeTruthy();
  });
});
