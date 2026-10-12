import { readFileSync } from 'node:fs';
import { FEATURES } from '@colleja/bot';
import {
  type FetchLike,
  fetchReplays,
  type ReplayStore,
  type StoredReplay,
} from '@colleja/metagame';
import { describe, expect, it } from 'vitest';
import { splitByBattle } from '../src/dataset';
import { type PositionRow, replayPositions } from '../src/positions';

/** A real Champions doubles replay, trimmed and with the players renamed (Ana and Bea). */
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/trick-room.json', import.meta.url), 'utf8'),
) as StoredReplay;

const featureIndex = (id: string) => FEATURES.findIndex((feature) => feature.id === id);

describe('positions of a replay (fase 17)', () => {
  it('gives each turn from both sides, with the winner', () => {
    const rows = replayPositions(fixture);
    expect(rows.map((row) => `${row.turn}${row.side}`)).toEqual([
      '1p1',
      '1p2',
      '2p1',
      '2p2',
      '3p1',
      '3p2',
      '4p1',
      '4p2',
    ]);
    // Bea (p2) wins: Ana forfeits.
    expect(rows.every((row) => row.won === (row.side === 'p2' ? 1 : 0))).toBe(true);
    expect(rows.every((row) => row.x.length === FEATURES.length)).toBe(true);
    expect(replayPositions(fixture)).toEqual(rows);
  });

  it('sees each position from the other side as its mirror', () => {
    const rows = replayPositions(fixture);
    const antisymmetric = ['hp', 'alive', 'fieldHp', 'fieldSpeed', 'answers', 'mega', 'tailwind'];
    for (let i = 0; i < rows.length; i += 2) {
      const [p1, p2] = [rows[i] as PositionRow, rows[i + 1] as PositionRow];
      for (const id of antisymmetric) {
        expect(p1.x[featureIndex(id)]).toBeCloseTo(-(p2.x[featureIndex(id)] ?? 0), 6);
      }
      expect(p1.x[featureIndex('koFor')]).toBe(p2.x[featureIndex('koAgainst')]);
      expect(p1.x[featureIndex('damageFor')]).toBe(p2.x[featureIndex('damageAgainst')]);
    }
  });

  it('only uses what was seen up to each turn', () => {
    const full = replayPositions(fixture);
    // The same battle cut right after turn 2 started (plus a winner, to keep its positions).
    const lines = fixture.log.split('\n');
    const cut = lines.indexOf('|turn|2') + 1;
    const truncated = { ...fixture, log: [...lines.slice(0, cut), '|win|Bea'].join('\n') };
    const early = replayPositions(truncated);
    expect(early).toEqual(full.filter((row) => row.turn <= 2));
  });

  it('counts Trick Room in favour of the slower side', () => {
    const rows = replayPositions(fixture);
    const trickRoom = (turn: number, side: 'p1' | 'p2') =>
      rows.find((row) => row.turn === turn && row.side === side)?.x[featureIndex('trickRoom')] ?? 0;
    // Set during turn 2 by Bea's slow team (Farigiraf, Torkoal, Sylveon): in her favour.
    expect(trickRoom(2, 'p2')).toBe(0);
    expect(trickRoom(3, 'p2')).toBeGreaterThan(0);
    expect(trickRoom(4, 'p2')).toBeGreaterThan(0);
    expect(trickRoom(3, 'p2')).toBeCloseTo(-trickRoom(3, 'p1'), 6);
  });

  it('skips replays without a winner', () => {
    const log = fixture.log.replace('|win|Bea', '');
    expect(replayPositions({ ...fixture, log })).toEqual([]);
  });

  it('splits by battle, never a battle in both halves', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].flatMap((id) =>
      [1, 2, 3].map((turn) => ({ id, turn }) as PositionRow),
    );
    const { train, test } = splitByBattle(rows, 'x', 0.3);
    const trainIds = new Set(train.map((row) => row.id));
    expect(test.length + train.length).toBe(rows.length);
    expect(test.some((row) => trainIds.has(row.id))).toBe(false);
    expect(splitByBattle(rows, 'x', 0.3)).toEqual({ train, test });
  });
});

describe('replay download (fase 17)', () => {
  /** A fake replay server: listings newest first, pages of 51 (the 51st says "there is more"). */
  function fakeServer(count: number) {
    const listings = Array.from({ length: count }, (_, i) => ({
      id: `gen9championsvgc2026regmc-${1000 - i}`,
      uploadtime: 10_000 - i * 10,
      rating: i % 3 === 0 ? null : 1300 + (i % 5) * 50,
      players: ['a', 'b'],
      private: 0,
    }));
    const urls: string[] = [];
    const fetch: FetchLike = async (url) => {
      urls.push(url);
      const json = async (): Promise<unknown> => {
        const search = /search\.json\?(.*)$/.exec(url);
        if (search) {
          const before = Number(new URLSearchParams(search[1]).get('before') ?? Infinity);
          return listings.filter((row) => row.uploadtime < before).slice(0, 51);
        }
        const id = /\/([\w-]+)\.json$/.exec(url)?.[1];
        const row = listings.find((entry) => entry.id === id);
        return { ...row, log: `|win|a\n`, format: 'f', formatid: 'f' };
      };
      return { ok: true, status: 200, json };
    };
    return { listings, urls, fetch };
  }

  function memoryStore(): ReplayStore & { saved: Map<string, StoredReplay>; cursor?: number } {
    const saved = new Map<string, StoredReplay>();
    const store = {
      saved,
      cursor: undefined as number | undefined,
      has: (id: string) => saved.has(id),
      save: (replay: StoredReplay) => void saved.set(replay.id, replay),
      readCursor: () => store.cursor,
      writeCursor: (before: number) => {
        store.cursor = before;
      },
    };
    return store;
  }

  it('downloads only rated enough replays, paced, and resumes where it stopped', async () => {
    const server = fakeServer(130);
    const store = memoryStore();
    let clock = 0;
    const waits: number[] = [];
    const options = {
      format: 'gen9championsvgc2026regmc',
      store,
      minRating: 1400,
      intervalMs: 1000,
      fetch: server.fetch,
      now: () => clock,
      sleep: async (ms: number) => {
        waits.push(ms);
        clock += ms;
      },
    };
    const first = await fetchReplays({ ...options, limit: 10 });
    expect(first.downloaded).toBe(10);
    // Never two requests within the interval: every request after the first waited.
    expect(waits.length).toBe(first.requests - 1);
    expect(waits.every((ms) => ms <= 1000 && ms > 0)).toBe(true);
    const eligible = server.listings.filter((row) => (row.rating ?? 0) >= 1400);
    expect([...store.saved.keys()]).toEqual(eligible.slice(0, 10).map((row) => row.id));

    // Next run: the rest, without downloading anything twice.
    const second = await fetchReplays({ ...options, limit: 1000 });
    expect(second.exhausted).toBe(true);
    expect(store.saved.size).toBe(eligible.length);
    const downloads = server.urls.filter((url) => !url.includes('search.json'));
    expect(new Set(downloads).size).toBe(downloads.length);
  });
});
