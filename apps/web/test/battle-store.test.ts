import type { ServerMessage, ServerMessageOf } from '@colleja/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { useBattle } from '../src/features/battle/battle-store';
import { DOUBLES_MOVE } from './fixtures';

const status = { turn: 1, rewindableTurns: [0, 1], undoTarget: 0, ended: false, winner: null };

const started: ServerMessage = {
  type: 'battle:started',
  battleId: 'b1',
  mode: 'doubles',
  seed: 'hola',
  botLevel: 2,
  options: { teamPreview: true, openTeamSheets: false },
  players: { p1: 'Yo', p2: 'Bot Táctico' },
  team: [],
  opponentTeam: null,
};

const LINES = [
  '|player|p1|Yo|',
  '|player|p2|Bot Táctico|',
  '|gametype|doubles',
  '|switch|p1a: Charizard|Charizard, L50|155/155',
  '|switch|p2a: Gengar|Gengar, L50|100/100',
  '|turn|1',
];
const PROTECT = '|move|p2a: Gengar|Protect|p2a: Gengar';

function update(lines: string[], request: ServerMessageOf<'battle:update'>['request']) {
  return { type: 'battle:update', battleId: 'b1', lines, request, status } as const;
}

describe('battle store', () => {
  beforeEach(() => useBattle.getState().leave());

  it('applies updates: log, request, narration and field state', () => {
    const { receive } = useBattle.getState();
    receive(started);
    receive(update(LINES, DOUBLES_MOVE));
    let state = useBattle.getState();
    expect(state.battleId).toBe('b1');
    expect(state.log).toEqual(LINES);
    expect(state.request).toBe(DOUBLES_MOVE);
    expect(state.screen.view.sides.p2.active[0]?.species).toBe('gengar');
    expect(state.screen.entries.map((entry) => entry.text)).toContain(
      '¡Bot Táctico saca a **Gengar**!',
    );

    // While the rival decides there is no request, but your team stays on screen.
    receive(update([PROTECT], null));
    state = useBattle.getState();
    expect(state.request).toBeNull();
    expect(state.ownSide).toBe(DOUBLES_MOVE.side);
    expect(state.screen.entries.at(-1)?.text).toBe('¡El Gengar rival ha usado **Protección**!');
  });

  it('starts over from a snapshot', () => {
    const { receive } = useBattle.getState();
    receive(started);
    receive(update(LINES, null));
    receive({
      type: 'battle:snapshot',
      battleId: 'b1',
      log: LINES.slice(0, 3),
      request: null,
      status: { ...status, turn: 0 },
    });
    const state = useBattle.getState();
    expect(state.log).toHaveLength(3);
    expect(state.screen.view.sides.p1.active).toEqual([]);
    expect(state.status?.turn).toBe(0);
  });

  it('re-narrates with names in English', () => {
    const { receive, setNamesLocale } = useBattle.getState();
    receive(started);
    receive(update([...LINES, PROTECT], null));
    setNamesLocale('en');
    expect(useBattle.getState().screen.entries.at(-1)?.text).toBe(
      '¡El Gengar rival ha usado **Protect**!',
    );
    setNamesLocale('es');
  });

  it('forgets a battle the server no longer has', () => {
    const { receive } = useBattle.getState();
    receive(started);
    receive({
      type: 'battle:error',
      battleId: 'b1',
      kind: 'not-found',
      message: 'Ese combate ya no existe en el servidor.',
    });
    const state = useBattle.getState();
    expect(state.battleId).toBeNull();
    expect(state.info).toBeNull();
    expect(state.error?.kind).toBe('not-found');
  });
});
