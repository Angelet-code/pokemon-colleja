// @vitest-environment happy-dom
import type { PokemonSet } from '@colleja/core';
import type { CollectionResponse } from '@colleja/protocol';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionPage } from '../src/features/collection/CollectionPage';
import { useCollection } from '../src/features/collection/collection-store';
import { SetEditor } from '../src/features/teams/components/SetEditor';
import { ownedSpeciesOptions, speciesOptions } from '../src/features/teams/options';
import { newDraft, replaceMembers } from '../src/features/teams/team-draft';

beforeEach(() => {
  useCollection.setState({ species: null, error: null, saving: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const response = (species: string[]): CollectionResponse => ({
  collection: { species },
  updatedAt: '2026-10-11T10:00:00.000Z',
});

/** A fake server holding the collection; the PUT answers with what it receives. */
function stubCollection(initial: string[]) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url !== '/api/collection') throw new Error(`Petición inesperada: ${url}`);
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { collection: { species: string[] } };
      return Response.json(response(body.collection.species));
    }
    return Response.json(response(initial));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const router = createMemoryRouter([{ path: '/pc', element: <CollectionPage /> }], {
    initialEntries: ['/pc'],
  });
  render(<RouterProvider router={router} />);
}

describe('PC de Bill', () => {
  it('lists the owned species and adds and removes them on the server', async () => {
    const fetchMock = stubCollection(['gyarados']);
    renderPage();
    const list = await screen.findByRole('list', { name: 'Pokémon de tu PC' });
    expect(within(list).getByText('Gyarados')).toBeTruthy();

    const picker = screen.getByRole('combobox', { name: 'Añadir Pokémon' });
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: 'Golurk' } });
    fireEvent.click(screen.getByRole('option', { name: /^Golurk/ }));
    await waitFor(() => expect(within(list).getByText('Golurk')).toBeTruthy());
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual({
      collection: { species: ['gyarados', 'golurk'] },
    });

    // Already owned: not offered again.
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: 'Gyarados' } });
    expect(screen.queryByRole('option', { name: /^Gyarados/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Gyarados' }));
    await waitFor(() => expect(within(list).queryByText('Gyarados')).toBeNull());
    expect(within(list).getByText('Golurk')).toBeTruthy();
  });

  it('says so when the PC is empty', async () => {
    stubCollection([]);
    renderPage();
    expect(await screen.findByText('Tu PC está vacío.')).toBeTruthy();
  });
});

describe('PC de Bill filter of the teambuilder', () => {
  it('keeps only the owned species, plus the current one', () => {
    const options = speciesOptions('es');
    expect(ownedSpeciesOptions(options, ['golurk', 'gyarados']).map((o) => o.value)).toEqual([
      'golurk',
      'gyarados',
    ]);
    expect(
      ownedSpeciesOptions(options, ['golurk'], 'garchomp')
        .map((o) => o.value)
        .sort(),
    ).toEqual(['garchomp', 'golurk']);
  });

  it('limits the species picker of the sheet', () => {
    const set: PokemonSet = {
      species: 'garchomp',
      ability: 'roughskin',
      nature: 'jolly',
      statPoints: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
      moves: ['earthquake'],
    };
    render(
      <SetEditor
        draft={replaceMembers(newDraft('doubles'), [set])}
        index={0}
        locale="es"
        problems={{}}
        onChange={vi.fn()}
        ownedSpecies={['golurk', 'gyarados']}
      />,
    );
    const picker = screen.getByRole('combobox', { name: 'Especie' });
    fireEvent.focus(picker);
    const listbox = document.getElementById(picker.getAttribute('aria-controls') ?? '');
    if (!listbox) throw new Error('no listbox');
    const names = within(listbox)
      .getAllByRole('option')
      .map((option) => option.textContent ?? '')
      .sort();
    expect(names).toEqual([
      expect.stringMatching(/^Garchomp/),
      expect.stringMatching(/^Golurk/),
      expect.stringMatching(/^Gyarados/),
    ]);
  });
});
