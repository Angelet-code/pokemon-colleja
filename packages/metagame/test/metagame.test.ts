import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkSetIssues } from '@colleja/core';
import { getItem, getSpecies } from '@colleja/data';
import { teamProblems } from '@colleja/engine';
import type { MetagameSnapshot } from '@colleja/protocol';
import { describe, expect, it } from 'vitest';
import {
  buildSet,
  buildSetPriors,
  buildSnapshot,
  clusterTeams,
  FileMetagameStore,
  ladderReplaysDir,
  type PreviewTeam,
  parseChaosFiles,
  parseMonths,
  parseSpread,
  previewSpecies,
  previewTeams,
  type SmogonClient,
  UsageIndex,
  updateMetagame,
} from '../src/index';
import { ARCHETYPES, fixtureStats, replay, tempDir, variant } from './helpers';

const doubles = fixtureStats('doubles');
const singles = fixtureStats('singles');

/** Teams of the three archetypes (with variations) as replays would give them. */
function samples(): PreviewTeam[] {
  const teams: string[][] = [];
  for (let i = 0; i < 12; i++) teams.push([...ARCHETYPES.floette]);
  for (let i = 0; i < 4; i++) teams.push(variant(ARCHETYPES.floette, 5, 'Kingambit'));
  for (let i = 0; i < 8; i++) teams.push([...ARCHETYPES.rain]);
  for (let i = 0; i < 5; i++) teams.push([...ARCHETYPES.sun]);
  // Alone (at most one species in common with the others): no archetype.
  teams.push(['Kingambit', 'Volcarona', 'Dragonite', 'Tyranitar', 'Excadrill', 'Corviknight']);
  return teams.map((team, index) => ({
    species: team.map((name) => previewSpecies(name) ?? ''),
    rating: 1600,
    uploadtime: 1_790_000_000 + index,
  }));
}

const megas = (snapshot: MetagameSnapshot, id: string) =>
  snapshot.teams
    .find((team) => team.id === id)
    ?.members.filter((set) => set.item && getItem(set.item)?.category === 'mega-stone').length;

describe('Smogon stats', () => {
  it('reads a chaos file, most used first', () => {
    expect(doubles.format).toBe('gen9championsvgc2026regmc');
    expect(doubles.cutoff).toBe(1760);
    expect(doubles.battles).toBeGreaterThan(1_000_000);
    const usages = doubles.species.map((entry) => entry.usage);
    expect(usages).toEqual([...usages].sort((a, b) => b - a));
    expect(() => buildSnapshot([], { month: '2026-09', cutoff: 0, createdAt: 'x' })).not.toThrow();
  });

  it('reads the month and file indexes', () => {
    const index = '<a href="2026-08/">2026-08/</a> <a href="2026-09/">2026-09/</a> <a href="../">';
    expect(parseMonths(index)).toEqual(['2026-08', '2026-09']);
    const folder =
      '<a href="gen9championsvgc2026regmc-1760.json">x</a><a href="gen9ou-0.json">y</a>';
    expect(parseChaosFiles(folder)).toEqual(['gen9championsvgc2026regmc-1760', 'gen9ou-0']);
  });

  it('parses spreads only within the Champions limits', () => {
    expect(parseSpread('Adamant:32/32/0/0/2/0')).toEqual({
      nature: 'adamant',
      statPoints: { hp: 32, atk: 32, def: 0, spa: 0, spd: 2, spe: 0 },
    });
    expect(parseSpread('Adamant:33/32/0/0/0/0')).toBeNull();
    expect(parseSpread('Adamant:32/32/32/0/0/0')).toBeNull();
    expect(parseSpread('Nope:0/0/0/0/0/0')).toBeNull();
  });
});

describe('team preview of replays', () => {
  it('maps preview names to species (formes and cosmetic formes)', () => {
    expect(previewSpecies('Floette-Eternal')).toBe('floetteeternal');
    expect(previewSpecies('Indeedee-F')).toBe('indeedeef');
    expect(previewSpecies('Garchomp-Fancy')).toBe('garchomp');
    expect(previewSpecies('Urshifu-*')).toBe(getSpecies('urshifu') ? 'urshifu' : null);
    expect(previewSpecies('Missingno-Glitch')).toBeNull();
  });

  it('reads both teams of six and nothing after turn 1', () => {
    const teams = previewTeams(replay(ARCHETYPES.floette, ARCHETYPES.rain, { rating: 1700 }));
    expect(teams).toHaveLength(2);
    expect(teams[0]?.species).toEqual([
      'floetteeternal',
      'incineroar',
      'rillaboom',
      'sneasler',
      'garchomp',
      'gholdengo',
    ]);
    expect(teams[0]?.rating).toBe(1700);
    expect(previewTeams(replay(ARCHETYPES.floette.slice(0, 5), ARCHETYPES.rain))).toHaveLength(1);
  });
});

describe('sets from the stats', () => {
  const usage = new UsageIndex(doubles);

  it('builds a Mega as its base species holding the stone, with a legal ability', () => {
    const set = buildSet('salamencemega', usage, 'doubles');
    expect(set?.species).toBe('salamence');
    expect(set?.item).toBe('salamencite');
    expect(getSpecies('salamence')?.abilities).toContain(set?.ability);
    expect(set?.moves.length).toBe(4);
  });

  it('never repeats an item (Item Clause)', () => {
    const first = buildSet('rillaboom', usage, 'doubles');
    const second = buildSet('rillaboom', usage, 'doubles', new Set([first?.item ?? '']));
    expect(second?.item).not.toBe(first?.item);
    expect(buildSet('salamencemega', usage, 'doubles', new Set(['salamencite']))).toBeNull();
  });
});

describe('sets that are played (fase 22)', () => {
  const usage = new UsageIndex(doubles);
  const priors = buildSetPriors(usage, 'doubles');

  it('gives several legal sets per species with weights adding up to 1', () => {
    expect(Object.keys(priors).length).toBeGreaterThan(20);
    for (const [species, list] of Object.entries(priors)) {
      expect(list.length).toBeGreaterThan(0);
      expect(list.reduce((sum, prior) => sum + prior.weight, 0)).toBeCloseTo(1, 9);
      for (const { set } of list) {
        expect(set.species).toBe(species);
        expect(checkSetIssues(set, 'doubles')).toEqual([]);
      }
      // Most likely first.
      const weights = list.map((prior) => prior.weight);
      expect(weights).toEqual([...weights].sort((a, b) => b - a));
    }
  });

  it('keys a Mega by its base species, with its stone and as often as it is brought', () => {
    const salamence = priors.salamence ?? [];
    const stone = salamence.filter((prior) => prior.set.item === 'salamencite');
    expect(stone.length).toBeGreaterThan(0);
    const share = stone.reduce((sum, prior) => sum + prior.weight, 0);
    expect(share).toBeGreaterThan(0.5);
    expect(priors.salamencemega).toBeUndefined();
  });

  it('is deterministic and goes into the snapshot by mode', () => {
    expect(buildSetPriors(new UsageIndex(doubles), 'doubles')).toEqual(priors);
    const snapshot = buildSnapshot([{ mode: 'doubles', stats: doubles, samples: [] }], {
      month: '2026-09',
      cutoff: 1760,
      createdAt: '2026-10-12T00:00:00.000Z',
      teams: 2,
    });
    expect(snapshot.sets?.doubles).toEqual(priors);
  });
});

describe('archetypes', () => {
  it('groups teams that share four species around the most common one', () => {
    const { archetypes, samples: count } = clusterTeams(samples(), 10);
    expect(count).toBe(30);
    expect(archetypes.map((archetype) => archetype.count)).toEqual([16, 8, 5]);
    expect(archetypes[0]?.species).toEqual(
      previewTeams(replay(ARCHETYPES.floette, []))[0]?.species,
    );
  });

  it('does not depend on the order of the samples', () => {
    const list = samples();
    const reversed = [...list].reverse();
    expect(clusterTeams(reversed, 10)).toEqual(clusterTeams(list, 10));
  });
});

describe('snapshot', () => {
  const build = (list: PreviewTeam[]) =>
    buildSnapshot(
      [
        { mode: 'doubles', stats: doubles, samples: list },
        { mode: 'singles', stats: singles, samples: [] },
      ],
      {
        month: '2026-09',
        cutoff: 1760,
        createdAt: '2026-10-12T00:00:00.000Z',
        minSamples: 20,
        teams: 6,
      },
    );

  it('is deterministic and independent of the order of the samples', () => {
    const list = samples();
    expect(build([...list].reverse())).toEqual(build(list));
  });

  it('gives legal teams with weights adding up to 1 per mode and unique names', () => {
    const snapshot = build(samples());
    expect(snapshot.id).toBe('2026-09-1760');
    expect(snapshot.sources.map((source) => [source.mode, source.teamsFrom])).toEqual([
      ['doubles', 'replays'],
      ['singles', 'teammates'],
    ]);
    for (const mode of ['doubles', 'singles'] as const) {
      const teams = snapshot.teams.filter((team) => team.mode === mode);
      expect(teams.length).toBeGreaterThan(0);
      expect(teams.reduce((sum, team) => sum + team.weight, 0)).toBeCloseTo(1, 9);
      expect(new Set(teams.map((team) => team.name)).size).toBe(teams.length);
      for (const team of teams) {
        expect(teamProblems(team.members, mode)).toEqual([]);
        expect(megas(snapshot, team.id)).toBeLessThanOrEqual(2);
      }
    }
    const [floette, rain, sun] = snapshot.teams.filter((team) => team.mode === 'doubles');
    expect(floette?.weight).toBeCloseTo(16 / 29, 9);
    expect(rain?.name).toMatch(/^Lluvia · /);
    expect(sun?.members.find((set) => set.species === 'charizard')?.item).toBe('charizarditey');
    expect(snapshot.sources[0]?.coverage).toBeCloseTo(29 / 30, 9);
  });

  it('grows teams from teammates when there are not enough replays', () => {
    const snapshot = build([]);
    expect(snapshot.sources[0]?.teamsFrom).toBe('teammates');
    expect(snapshot.sources[0]?.samples).toBe(0);
  });
});

describe('store and update', () => {
  const fakeSmogon = (months: string[]): SmogonClient => ({
    latestMonth: async () => months.at(-1) ?? null,
    chaos: async (_month, format) => (format.includes('vgc') ? doubles : singles),
  });

  it('saves snapshots and the active one is the newest', () => {
    const store = new FileMetagameStore(tempDir('metagame'));
    expect(store.active()).toBeNull();
    const base = buildSnapshot([{ mode: 'singles', stats: singles, samples: [] }], {
      month: '2026-08',
      cutoff: 1760,
      createdAt: 'x',
      teams: 2,
    });
    store.save(base);
    store.save({ ...base, id: '2026-09-1500', month: '2026-09', cutoff: 1500 });
    store.save({ ...base, id: '2026-09-1760', month: '2026-09' });
    expect(store.ids()).toEqual(['2026-09-1760', '2026-09-1500', '2026-08-1760']);
    expect(store.active()?.id).toBe('2026-09-1760');
    expect(store.get('../x')).toBeNull();
  });

  it('updates from the newest month with the stored replays (no network)', async () => {
    const datasets = tempDir('datasets');
    const dir = ladderReplaysDir('gen9championsvgc2026regmc', datasets);
    mkdirSync(dir, { recursive: true });
    for (const [index, team] of samples().entries()) {
      const stored = replay(
        team.species.map((id) => getSpecies(id)?.name ?? id),
        ARCHETYPES.sun,
        { rating: index === 0 ? 1200 : 1600 },
      );
      writeFileSync(join(dir, `${stored.id}.json`), JSON.stringify(stored));
    }
    const store = new FileMetagameStore(tempDir('metagame'));
    const steps: string[] = [];
    const snapshot = await updateMetagame(store, {
      smogon: fakeSmogon(['2026-08', '2026-09']),
      datasetsDir: datasets,
      replays: 0,
      teams: 4,
      now: () => new Date('2026-10-12T00:00:00Z'),
      onStep: (step) => steps.push(step),
    });
    expect(snapshot.id).toBe('2026-09-1760');
    expect(store.active()).toEqual(snapshot);
    // Both sides of 29 replays above the rating: below `MIN_SAMPLES`, so from teammates.
    expect(snapshot.sources[0]?.teamsFrom).toBe('teammates');
    expect(steps.at(-1)).toMatch(/guardado/);
  });

  it('goes on with the stored replays when the download fails', async () => {
    const store = new FileMetagameStore(tempDir('metagame'));
    const steps: string[] = [];
    const snapshot = await updateMetagame(store, {
      smogon: fakeSmogon(['2026-09']),
      datasetsDir: tempDir('datasets'),
      replays: 5,
      teams: 2,
      intervalMs: 0,
      sleep: async () => {},
      fetch: async () => {
        throw new Error('fetch failed');
      },
      onStep: (step) => steps.push(step),
    });
    expect(snapshot.teams.length).toBeGreaterThan(0);
    expect(steps.some((step) => step.includes('No se han podido descargar'))).toBe(true);
  });

  it('explains a missing month in Spanish', async () => {
    await expect(
      updateMetagame(new FileMetagameStore(tempDir('metagame')), {
        smogon: fakeSmogon([]),
        datasetsDir: tempDir('datasets'),
        replays: 0,
      }),
    ).rejects.toThrow(/Smogon aún no tiene/);
  });
});
