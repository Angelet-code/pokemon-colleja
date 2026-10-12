import type { OpponentSummary, TeamSummary } from '@colleja/protocol';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BENCH_FORM,
  MAX_PER_RIVAL,
  MIN_PER_RIVAL,
  metagameRivals,
  rivalsForMode,
  selectedRivals,
  toBenchRequest,
  toggleRival,
} from '../src/features/bench/bench-form';

const team = (id: string, valid = true): TeamSummary => ({
  id,
  name: `Equipo ${id}`,
  mode: 'doubles',
  species: [],
  shiny: [],
  valid,
  problems: valid ? [] : ['Mal'],
  updatedAt: '2026-10-09T00:00:00.000Z',
});

const rival = (id: string, mode: 'singles' | 'doubles', valid = true): OpponentSummary => ({
  ...team(id, valid),
  name: `Rival ${id}`,
  mode,
  botLevel: 3,
});

const teams = [team('a'), team('b'), team('bad', false)];
const opponents = [
  rival('1', 'doubles'),
  rival('2', 'doubles'),
  rival('3', 'singles'),
  rival('4', 'doubles', false),
];

describe('bench form', () => {
  it('offers the legal rivals of the mode (all of them by default)', () => {
    expect(rivalsForMode(opponents, 'doubles').map((r) => r.id)).toEqual(['1', '2']);
    expect(rivalsForMode(opponents, 'both').map((r) => r.id)).toEqual(['1', '2', '3']);
    const form = { ...DEFAULT_BENCH_FORM, mode: 'doubles' as const };
    expect(selectedRivals(form, opponents).map((r) => r.id)).toEqual(['1', '2']);
    const toggled = toggleRival(form, opponents, '1');
    expect(toggled).toEqual(['2']);
    expect(toggleRival({ ...form, opponentIds: toggled }, opponents, '1')).toEqual(['2', '1']);
  });

  it('builds an adaptive request with the chosen precision and levels', () => {
    const built = toBenchRequest(
      { ...DEFAULT_BENCH_FORM, teamId: 'a', precision: 'p5', teamLevel: 2 },
      teams,
      opponents,
    );
    expect(built).toEqual({
      ok: true,
      request: {
        teamId: 'a',
        opponentIds: ['1', '2'],
        modes: ['doubles'],
        levels: { team: 2, opponent: 3 },
        budget: {
          kind: 'adaptive',
          margin: 0.05,
          minPerStratum: MIN_PER_RIVAL,
          maxBattles: MAX_PER_RIVAL * 2,
        },
      },
    });
  });

  it('builds fixed and A/B requests', () => {
    const fixed = toBenchRequest(
      {
        ...DEFAULT_BENCH_FORM,
        teamId: 'a',
        precision: 'fixed',
        battles: 2,
        versus: 'saved',
        versusTeamId: 'b',
      },
      teams,
      opponents,
    );
    expect(fixed.ok && fixed.request.budget).toEqual({ kind: 'fixed', battles: 2 });
    expect(fixed.ok && fixed.request.versus).toEqual({ kind: 'saved', teamId: 'b' });
  });

  it('benches against every legal metagame team of the mode', () => {
    const metagameTeam = (id: string, mode: 'singles' | 'doubles', valid = true) => ({
      ...team(id, valid),
      mode,
      snapshotId: '2026-09-1760',
      archetype: '',
      weight: 0.5,
    });
    const metagame = {
      snapshotId: '2026-09-1760',
      teams: [
        metagameTeam('doubles-01', 'doubles'),
        metagameTeam('doubles-02', 'doubles', false),
        metagameTeam('singles-01', 'singles'),
      ],
    };
    expect(metagameRivals(metagame.teams, 'doubles').map((entry) => entry.id)).toEqual([
      'doubles-01',
    ]);
    expect(metagameRivals(metagame.teams, 'both')).toHaveLength(2);
    const form = { ...DEFAULT_BENCH_FORM, teamId: 'a', rivalSource: 'metagame' as const };
    const built = toBenchRequest({ ...form, mode: 'both' }, teams, opponents, metagame);
    expect(built.ok && built.request).toMatchObject({
      metagame: { snapshotId: '2026-09-1760' },
      modes: ['singles', 'doubles'],
      budget: { maxBattles: MAX_PER_RIVAL * 2 },
    });
    expect(built.ok && built.request).not.toHaveProperty('opponentIds');
    const none = toBenchRequest(form, teams, opponents, null);
    expect(none.ok ? null : none.reason).toMatch(/Aún no hay meta/);
  });

  it('explains what is missing', () => {
    const reason = (form: Partial<typeof DEFAULT_BENCH_FORM>) => {
      const built = toBenchRequest({ ...DEFAULT_BENCH_FORM, ...form }, teams, opponents);
      return built.ok ? null : built.reason;
    };
    expect(reason({})).toBe('Elige tu equipo.');
    expect(reason({ teamId: 'bad' })).toMatch(/problemas/);
    expect(reason({ teamId: 'a', opponentIds: [] })).toBe('Elige al menos un rival.');
    expect(reason({ teamId: 'a', versus: 'saved', versusTeamId: 'a' })).toMatch(/otra versión/);
    expect(reason({ teamId: 'a', versus: 'text' })).toMatch(/Pega/);
  });
});
