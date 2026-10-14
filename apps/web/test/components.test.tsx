// @vitest-environment happy-dom
import { BattleView, type Choice, type MoveRequest, type SwitchRequest } from '@colleja/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionPanel } from '../src/features/battle/components/ActionPanel';
import { Field } from '../src/features/battle/components/Field';
import { TeamPreview } from '../src/features/battle/components/TeamPreview';
import type { TargetAim } from '../src/features/battle/target-aim';
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

/** The panel next to the field, as in the battle page: targets are clicked on the field. */
function Controls({
  request,
  onChoose,
}: {
  request: MoveRequest | SwitchRequest;
  onChoose: (choice: Choice) => void;
}) {
  const [aim, setAim] = useState<TargetAim | null>(null);
  return (
    <>
      <Field view={VIEW} own={request.side.pokemon} aim={aim} />
      <ActionPanel
        request={request}
        view={VIEW}
        onChoose={onChoose}
        disabled={false}
        onAim={setAim}
      />
    </>
  );
}

describe('ActionPanel (doubles)', () => {
  it('aims on the field, offers the Mega once and sends the full choice', () => {
    const onChoose = vi.fn<(choice: Choice) => void>();
    render(<Controls request={DOUBLES_MOVE} onChoose={onChoose} />);

    expect(screen.getByText('¿Qué hará Charizard?')).toBeTruthy();
    // Protect has no PP left.
    expect(screen.getByRole('button', { name: /Protección/ })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Megaevolucionar' }));
    fireEvent.click(screen.getByRole('button', { name: /Tajo Aéreo/ }));

    // Air Slash can hit both rivals and the ally (not itself).
    expect(screen.getByText('¿A quién apunta Tajo Aéreo?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apuntar a Dragonite' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apuntar a Incineroar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Apuntar a Charizard' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Apuntar a Gengar' }));

    // Second slot: the Mega is already taken this turn.
    expect(screen.getByText('¿Qué hará Incineroar?')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Megaevolucionar' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Apuntar a/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Refuerzo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Apuntar a Charizard' }));

    expect(onChoose).toHaveBeenCalledWith({
      type: 'actions',
      actions: [
        { type: 'move', move: 2, target: 1, mega: true },
        { type: 'move', move: 2, target: -1 },
      ],
    });
  });

  it('launches a spread attack with a click on any rival', () => {
    const onChoose = vi.fn<(choice: Choice) => void>();
    render(<Controls request={DOUBLES_MOVE} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: /Onda Ígnea/ }));
    expect(screen.getByText('¿Lanzar Onda Ígnea?')).toBeTruthy();
    // Heat Wave hits both rivals, never the ally.
    expect(screen.getByRole('button', { name: 'Lanzar Onda Ígnea (Gengar)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Incineroar\)/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Lanzar Onda Ígnea (Dragonite)' }));
    expect(screen.getByText('¿Qué hará Incineroar?')).toBeTruthy();
    fireEvent.keyDown(window, { key: '5' });
    expect(onChoose).toHaveBeenCalledWith({
      type: 'actions',
      actions: [
        { type: 'move', move: 1 },
        { type: 'switch', slot: 3 },
      ],
    });
  });

  it('goes back to the previous slot', () => {
    render(<Controls request={DOUBLES_MOVE} onChoose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Onda Ígnea/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Onda Ígnea/ })); // a second click launches it
    expect(screen.getByText('¿Qué hará Incineroar?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(screen.getByText('¿Qué hará Charizard?')).toBeTruthy();
  });

  it('handles forced switches with fewer replacements than slots', () => {
    const onChoose = vi.fn<(choice: Choice) => void>();
    render(<Controls request={DOUBLES_FORCED} onChoose={onChoose} />);
    expect(screen.getByText('¿Qué Pokémon sale en lugar de Charizard?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Garchomp/ }));
    expect(onChoose).toHaveBeenCalledWith({
      type: 'actions',
      actions: [{ type: 'switch', slot: 3 }, { type: 'pass' }],
    });
  });

  it('supports the keyboard shortcuts', () => {
    const onChoose = vi.fn<(choice: Choice) => void>();
    render(<Controls request={DOUBLES_MOVE} onChoose={onChoose} />);
    fireEvent.keyDown(window, { key: '2' }); // Air Slash…
    fireEvent.keyDown(window, { key: 'Escape' }); // …no, back to the moves
    fireEvent.keyDown(window, { key: '1' }); // Heat Wave
    fireEvent.keyDown(window, { key: 'Enter' }); // launched at both rivals
    fireEvent.keyDown(window, { key: '1' }); // Fake Out…
    fireEvent.keyDown(window, { key: '2' }); // …at the second rival
    expect(onChoose).toHaveBeenCalledWith({
      type: 'actions',
      actions: [
        { type: 'move', move: 1 },
        { type: 'move', move: 1, target: 2 },
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
