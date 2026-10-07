import { readFileSync } from 'node:fs';
import { RandomAgent } from '@colleja/bot';
import {
  actionsChoice,
  championsStats,
  formatShowdownTeam,
  moveAction,
  type PokemonSet,
  parseShowdownTeam,
  type SideId,
} from '@colleja/core';
import { type GameMode, listStandardSets, STAT_IDS } from '@colleja/data';
import { Battle, CHAMPIONS_FORMATS, type ShowdownID, Teams } from '@colleja/showdown';
import { describe, expect, it } from 'vitest';
import {
  BattleSession,
  fromShowdownSet,
  playOut,
  resolveFormat,
  TeamValidationError,
  toBattleSeed,
  toShowdownSet,
  validateTeam,
} from '../src/index';
import { createFixtureSession, fixtureTeam } from './helpers';

const MODES: GameMode[] = ['singles', 'doubles'];

function randomAgents(seed: string) {
  return {
    p1: new RandomAgent({ seed: `${seed}:p1` }),
    p2: new RandomAgent({ seed: `${seed}:p2` }),
  };
}

/** Plays with random agents until the battle ends or reaches `untilTurn`. */
async function playUntil(session: BattleSession, seed: string, untilTurn: number) {
  const agents = randomAgents(seed);
  while (!session.ended && session.turn < untilTurn) {
    const pending = session.pendingSides();
    if (pending.length === 0) throw new Error('No pending sides');
    for (const side of pending) {
      const context = session.getAgentContext(side);
      if (!context) continue;
      const result = session.choose(side, await agents[side].choose(context));
      expect(result).toEqual({ ok: true });
    }
  }
}

describe('stats: core = Showdown', () => {
  it.each(MODES)('matches the engine for every standard set (%s)', (mode) => {
    const sets: PokemonSet[] = listStandardSets(mode).map((standard) => ({
      species: standard.species,
      item: standard.item ?? undefined,
      ability: standard.ability,
      nature: standard.nature,
      statPoints: standard.statPoints,
      moves: standard.moves,
    }));
    expect(sets.length).toBeGreaterThan(400);

    for (let i = 0; i < sets.length; i += 6) {
      const chunk = sets.slice(i, i + 6);
      const team = Teams.pack(chunk.map((set) => toShowdownSet(set, 50)));
      const battle = new Battle({
        formatid: CHAMPIONS_FORMATS[mode] as ShowdownID,
        seed: 'sodium,00000000000000000000000000000000',
        p1: { name: 'A', team },
        p2: { name: 'B', team },
      });
      for (const [j, set] of chunk.entries()) {
        const pokemon = battle.p1.pokemon[j];
        if (!pokemon) throw new Error('missing pokemon');
        const expected = championsStats(set);
        const actual = { hp: pokemon.maxhp, ...pokemon.storedStats };
        for (const stat of STAT_IDS) {
          expect(actual[stat], `${set.species} ${set.nature} ${stat}`).toBe(expected[stat]);
        }
      }
      battle.destroy();
    }
  });
});

describe('set conversion', () => {
  it('agrees with Showdown import/export for the fixtures', () => {
    for (const name of ['equipo-a', 'equipo-b'] as const) {
      const text = readFileSync(
        new URL(`../../../tools/smoke/fixtures/${name}.txt`, import.meta.url),
        'utf8',
      );
      const ours = parseShowdownTeam(text).sets.map((set) => toShowdownSet(set, 50));
      const theirs = Teams.import(text) ?? [];
      expect(ours.map(stripGender)).toEqual(theirs.map(stripGender));
      // Our export is readable by Showdown and comes back identical.
      const reimported = (Teams.import(formatShowdownTeam(fixtureTeam(name))) ?? []).map(
        fromShowdownSet,
      );
      expect(reimported).toEqual(fixtureTeam(name));
    }
  });
});

function stripGender(set: { gender: string }) {
  return { ...set, gender: set.gender || '' };
}

describe('validateTeam', () => {
  it('accepts the fixture teams in both modes', () => {
    for (const mode of MODES) {
      expect(validateTeam(fixtureTeam('equipo-a'), mode)).toEqual({ ok: true, problems: [] });
    }
  });

  it('rejects illegal teams', () => {
    const team = fixtureTeam('equipo-a');
    const [incineroar, ...rest] = team;
    if (!incineroar) throw new Error('missing');
    const cases: PokemonSet[][] = [
      [{ ...incineroar, moves: ['knockoff', 'fakeout'] }, ...rest], // not learnable in Champions
      [{ ...incineroar, statPoints: { ...incineroar.statPoints, hp: 33 } }, ...rest],
      [incineroar, incineroar, ...rest.slice(1)], // Species Clause
      team.slice(0, 2), // too few Pokémon
    ];
    for (const invalid of cases) {
      const result = validateTeam(invalid, 'singles');
      expect(result.ok).toBe(false);
      expect(result.problems.length).toBeGreaterThan(0);
    }
  });

  it('refuses to create a battle with an illegal team', () => {
    const team = fixtureTeam('equipo-a').slice(0, 1);
    expect(() =>
      BattleSession.create({
        mode: 'singles',
        players: { p1: { name: 'A', team }, p2: { name: 'B', team: fixtureTeam('equipo-b') } },
      }),
    ).toThrow(TeamValidationError);
  });
});

describe('formats', () => {
  it('maps mode + options to Showdown format ids', () => {
    expect(resolveFormat('singles', { teamPreview: true }).formatid).toBe('gen9championsbssregmc');
    expect(resolveFormat('doubles', { teamPreview: true }).formatid).toBe(
      'gen9championsvgc2026regmc@@@!Open Team Sheets',
    );
    expect(resolveFormat('singles', { teamPreview: false }).formatid).toBe(
      'gen9championsbssregmc@@@!Team Preview',
    );
    expect(resolveFormat('doubles', { teamPreview: false })).toMatchObject({
      formatid: 'gen9championsvgc2026regmc@@@!Team Preview,!Open Team Sheets',
      baseFormatid: 'gen9championsvgc2026regmc',
      level: 50,
      pickedTeamSize: 4,
    });
  });

  it('turns any text into a stable Showdown seed', () => {
    expect(toBattleSeed('hola')).toBe(toBattleSeed('hola'));
    expect(toBattleSeed('hola')).toMatch(/^sodium,[0-9a-f]{32}$/);
    expect(toBattleSeed('sodium,abc123')).toBe('sodium,abc123');
    expect(toBattleSeed()).not.toBe(toBattleSeed());
  });
});

describe('BattleSession', () => {
  it.each(MODES)('plays a full %s battle between two random bots', async (mode) => {
    const session = createFixtureSession(mode, `full-${mode}`);
    const winner = await playOut(session, randomAgents(`full-${mode}`));
    expect(session.ended).toBe(true);
    expect(winner).toBe(session.winner);
    expect(session.turn).toBeGreaterThan(1);
    expect(session.getLog('omniscient').some((line) => line.startsWith('|error|'))).toBe(false);
    session.dispose();
  });

  it.each(MODES)('is deterministic: same seed + same inputs = same log (%s)', async (mode) => {
    const play = async () => {
      const session = createFixtureSession(mode, 'determinism');
      await playOut(session, randomAgents('determinism'));
      return session;
    };
    const first = await play();
    const second = await play();
    expect(second.getLog('omniscient')).toEqual(first.getLog('omniscient'));

    // A replay re-creates exactly the same battle.
    const replay = JSON.parse(JSON.stringify(first.exportReplay()));
    const replayed = BattleSession.fromReplay(replay);
    expect(replayed.getLog('omniscient')).toEqual(first.getLog('omniscient'));
    expect(replayed.winner).toBe(first.winner);
    expect(replay.turns).toBe(first.turn);
  });

  it.each(MODES)('rewinds to the start of a turn and replays identically (%s)', async (mode) => {
    const session = createFixtureSession(mode, `rewind-${mode}`);
    const snapshots = new Map<number, { log: string[]; p1: string[] }>();
    session.on((event) => {
      if (event.type === 'protocol' && event.perspective === 'omniscient') {
        for (const line of event.lines) {
          if (line.startsWith('|turn|')) {
            snapshots.set(Number(line.slice(6)), {
              log: [...session.getLog('omniscient')],
              p1: [...session.getLog('p1')],
            });
          }
        }
      }
    });
    await playUntil(session, `rewind-${mode}`, 8);
    const finalLog = [...session.getLog('omniscient')];
    const fullInput = [...session.inputLog];
    const reached = session.turn;
    expect(reached).toBeGreaterThanOrEqual(4);

    const k = 3;
    const rewinds: number[] = [];
    session.on((event) => {
      if (event.type === 'rewind') rewinds.push(event.turn);
    });
    session.rewindTo(k);
    expect(rewinds).toEqual([k]);
    expect(session.turn).toBe(k);
    expect(session.getLog('omniscient')).toEqual(snapshots.get(k)?.log);
    expect(session.getLog('p1')).toEqual(snapshots.get(k)?.p1);
    expect(session.pendingSides().length).toBeGreaterThan(0);

    // Re-applying the same choices gives exactly the same battle.
    const replayed = fullInput.slice(session.inputLog.length);
    for (const line of replayed) {
      const [, side = '', text = ''] = /^>(p[12]) (.*)$/.exec(line) ?? [];
      expect(session.choose(side as SideId, text)).toEqual({ ok: true });
    }
    expect(session.getLog('omniscient')).toEqual(finalLog);
    expect(session.turn).toBe(reached);
  });

  it('undo goes back one turn, and to the team preview from turn 1', async () => {
    const session = createFixtureSession('singles', 'undo');
    expect(session.undoTarget()).toBeNull();
    await playUntil(session, 'undo', 3);
    expect(session.turn).toBe(3);
    expect(session.undo()).toBe(2);
    expect(session.turn).toBe(2);
    expect(session.undo()).toBe(1);
    expect(session.undo()).toBe(0);
    expect(session.getRequest('p1')).toHaveProperty('teamPreview', true);
    expect(() => session.rewindTo(5)).toThrow();
  });

  it('rejects invalid choices without breaking', () => {
    const session = createFixtureSession('singles', 'invalid');
    expect(session.choose('p1', actionsChoice(moveAction(1))).ok).toBe(false); // team preview pending
    expect(session.choose('p1', { type: 'team', order: [1, 1, 2] }).ok).toBe(false);
    expect(session.choose('p1', { type: 'team', order: [1, 2, 3] })).toEqual({ ok: true });
    expect(session.choose('p1', { type: 'team', order: [1, 2, 3] }).ok).toBe(false); // already chose
    expect(session.choose('p2', 'team 1, 2, 3')).toEqual({ ok: true });
    expect(session.turn).toBe(1);

    // Raw text goes straight to Showdown, which rejects it with [Invalid choice].
    const raw = session.choose('p1', 'move 9');
    expect(raw.ok).toBe(false);
    if (!raw.ok) expect(raw.errors.join(' ')).toContain('[Invalid choice]');
    expect(session.isAwaiting('p1')).toBe(true);
    expect(session.choose('p1', actionsChoice(moveAction(1)))).toEqual({ ok: true });
  });

  it('without team preview, starts at turn 1 and hides the rival team', () => {
    const session = createFixtureSession('doubles', 'no-preview', {
      options: { teamPreview: false },
    });
    expect(session.turn).toBe(1);
    expect(session.rewindableTurns()).toEqual([1]);
    expect(session.getLog('p1').some((line) => line.startsWith('|poke|p2|'))).toBe(false);
    const request = session.getRequest('p1');
    // Default order: the first four, the first two leading.
    expect(request?.side.pokemon.slice(0, 4).map((p) => p.ident)).toEqual([
      'p1: Incineroar',
      'p1: Charizard',
      'p1: Garchomp',
      'p1: Sinistcha',
    ]);
  });

  it('shows the rival sets only with open team sheets', () => {
    const closed = createFixtureSession('singles', 'ots');
    expect(closed.getAgentContext('p1')?.opponentTeam).toBeNull();
    const open = createFixtureSession('singles', 'ots', { options: { openTeamSheets: true } });
    expect(open.getAgentContext('p1')?.opponentTeam).toEqual(fixtureTeam('equipo-b'));
  });

  it('hides the rival exact HP from each player', async () => {
    const session = createFixtureSession('singles', 'perspective');
    await playUntil(session, 'perspective', 2);
    const p2SwitchFromP1 = session.getLog('p1').find((line) => line.startsWith('|switch|p2a:'));
    const p2SwitchOmniscient = session
      .getLog('omniscient')
      .find((line) => line.startsWith('|switch|p2a:'));
    expect(p2SwitchFromP1).toMatch(/\|100\/100$/);
    expect(p2SwitchOmniscient).not.toMatch(/\|100\/100$/);
  });
});
