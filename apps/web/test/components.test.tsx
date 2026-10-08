// @vitest-environment happy-dom
import { BattleView, type Choice } from '@colleja/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionPanel } from '../src/features/battle/components/ActionPanel';
import { TeamPreview } from '../src/features/battle/components/TeamPreview';
import { DOUBLES_FORCED, DOUBLES_MOVE, TEAM_PREVIEW } from './fixtures';

afterEach(cleanup);

/** Field with two Pokémon per side, as the doubles request expects. */
const VIEW = BattleView.from([
  '|player|p1|Yo|',
  '|player|p2|Bot|',
  '|gametype|doubles',
  '|switch|p1a: Charizard|Charizard, L50|155/155',
  '|switch|p1b: Incineroar|Incineroar, L50|202/202',
  '|switch|p2a: Gengar|Gengar, L50|100/100',
  '|switch|p2b: Dragonite|Dragonite, L50|100/100',
  '|turn|1',
]);

describe('ActionPanel (doubles)', () => {
  it('asks for a target, offers the Mega once and sends the full choice', () => {
    const onChoose = vi.fn<(choice: Choice) => void>();
    render(<ActionPanel request={DOUBLES_MOVE} view={VIEW} onChoose={onChoose} disabled={false} />);

    expect(screen.getByText('¿Qué hará Charizard?')).toBeTruthy();
    // Protect has no PP left.
    expect(screen.getByRole('button', { name: /Protección/ })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Megaevolucionar' }));
    fireEvent.click(screen.getByRole('button', { name: /Tajo Aéreo/ }));

    // Air Slash can hit both rivals and the ally (not itself).
    expect(screen.getByText('¿A quién apunta Tajo Aéreo?')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Dragonite/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Incineroar/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Gengar/ }));

    // Second slot: the Mega is already taken this turn.
    expect(screen.getByText('¿Qué hará Incineroar?')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Megaevolucionar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Refuerzo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Charizard/ }));

    expect(onChoose).toHaveBeenCalledWith({
      type: 'actions',
      actions: [
        { type: 'move', move: 2, target: 1, mega: true },
        { type: 'move', move: 2, target: -1 },
      ],
    });
  });

  it('goes back to the previous slot', () => {
    render(<ActionPanel request={DOUBLES_MOVE} view={VIEW} onChoose={vi.fn()} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Onda Ígnea/ }));
    expect(screen.getByText('¿Qué hará Incineroar?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(screen.getByText('¿Qué hará Charizard?')).toBeTruthy();
  });

  it('handles forced switches with fewer replacements than slots', () => {
    const onChoose = vi.fn<(choice: Choice) => void>();
    render(
      <ActionPanel request={DOUBLES_FORCED} view={VIEW} onChoose={onChoose} disabled={false} />,
    );
    expect(screen.getByText('¿Qué Pokémon sale en lugar de Charizard?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Garchomp/ }));
    expect(onChoose).toHaveBeenCalledWith({
      type: 'actions',
      actions: [{ type: 'switch', slot: 3 }, { type: 'pass' }],
    });
  });

  it('supports the keyboard shortcuts', () => {
    const onChoose = vi.fn<(choice: Choice) => void>();
    render(<ActionPanel request={DOUBLES_MOVE} view={VIEW} onChoose={onChoose} disabled={false} />);
    fireEvent.keyDown(window, { key: '1' }); // Heat Wave: no target needed
    fireEvent.keyDown(window, { key: '5' }); // Incineroar switches to Garchomp
    expect(onChoose).toHaveBeenCalledWith({
      type: 'actions',
      actions: [
        { type: 'move', move: 1 },
        { type: 'switch', slot: 3 },
      ],
    });
  });
});

describe('TeamPreview', () => {
  it('lets you pick exactly the team size, in order', () => {
    const onChoose = vi.fn<(choice: Choice) => void>();
    render(
      <TeamPreview
        request={TEAM_PREVIEW}
        team={[]}
        rivalSpecies={['gengar', 'dragonite']}
        rivalTeam={null}
        mode="singles"
        onChoose={onChoose}
        disabled={false}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Confirmar equipo' });
    for (const name of ['Garchomp', 'Charizard']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
    }
    expect(confirm).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: /Gholdengo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Kingambit/ })); // a 4th one is ignored
    expect(confirm).toHaveProperty('disabled', false);
    fireEvent.click(confirm);
    expect(onChoose).toHaveBeenCalledWith({ type: 'team', order: [3, 1, 6] });
  });
});
