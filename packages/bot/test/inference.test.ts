import { type AgentContext, BattleView, type PokemonSet } from '@colleja/core';
import { getStandardSets } from '@colleja/data';
import type { BattleSession } from '@colleja/engine';
import { describe, expect, it } from 'vitest';
import { styleAdjustment } from '../src/agents/expert-agent';
import { OpponentModel } from '../src/analysis/opponent-model';
import { inferBeliefs, type SetBeliefs, spreadVariants } from '../src/inference/beliefs';
import { extractObservations } from '../src/inference/observations';
import { RivalStyle, rivalActions } from '../src/inference/style';
import { scenario, set } from './helpers';

const hippowdon = set('hippowdon', ['earthquake', 'slackoff', 'whirlwind', 'stealthrock'], {
  item: 'leftovers',
  nature: 'careful',
  spread: { hp: 32, atk: 0, spa: 0, spd: 32, def: 2 },
});
/** Garchomp's standard "Setup Sweeper" without its Mega Stone (Lum Berry). */
const sweeper = standard('garchomp', 'lumberry');
const bulky = standard('garchomp', 'rockyhelmet');

function standard(species: string, item: string): PokemonSet {
  const found = getStandardSets(species, 'singles').find((s) => s.item === item);
  if (!found) throw new Error(`Sin set estándar de ${species} con ${item}`);
  const { species: id, ability, nature, statPoints, moves } = found;
  return { species: id, item, ability, nature, statPoints, moves };
}

/** Turn 1 with both sides using Earthquake; the bot's (p1) context afterwards. */
function afterEarthquakes(rival: PokemonSet, seed = 'deduce'): AgentContext {
  const session = scenario('singles', [hippowdon], [rival], { seed });
  play(session, 'move 1', `move ${rival.moves.indexOf('earthquake') + 1}`);
  const context = session.getAgentContext('p1');
  if (!context) throw new Error('p1 no tiene que elegir');
  return context;
}

function play(session: BattleSession, p1: string, p2: string) {
  expect(session.choose('p1', p1).ok).toBe(true);
  expect(session.choose('p2', p2).ok).toBe(true);
}

function beliefsOf(context: AgentContext): SetBeliefs {
  return inferBeliefs(context, BattleView.from(context.log), new OpponentModel('singles'));
}

const sameSpread = (a: PokemonSet, b: PokemonSet) =>
  a.nature === b.nature && JSON.stringify(a.statPoints) === JSON.stringify(b.statPoints);

describe('observations', () => {
  it('reads hits both ways, with exact and % HP, and who moved first', () => {
    const context = afterEarthquakes(sweeper);
    const observations = extractObservations(context.log, 'p2');
    const hits = observations.filter((o) => o.kind === 'hit');
    expect(hits).toHaveLength(2);
    const [first, second] = hits;
    // Garchomp (Jolly, 32 Speed) moves first and hits Hippowdon: exact HP.
    expect(first?.attacker.species).toBe('garchomp');
    expect(first?.defender.hp).toBe(first?.defender.maxhp);
    expect(first?.hpAfter).toBeLessThan(first?.defender.hp ?? 0);
    // Hippowdon hits Garchomp: its HP in %.
    expect(second?.defender.maxhp).toBe(100);
    const order = observations.find((o) => o.kind === 'order');
    expect(order?.kind === 'order' && order.first.species).toBe('garchomp');
    // Garchomp moved without Mega Evolving.
    expect(observations.some((o) => o.kind === 'nomega')).toBe(true);
  });

  it('keeps only a lower bound for a knock-out', () => {
    const glass = set('pikachu', ['thunderbolt', 'quickattack', 'irontail', 'protect'], {
      nature: 'timid',
      spread: { hp: 2, atk: 0, spa: 32, spe: 32 },
    });
    const session = scenario('singles', [hippowdon], [glass], { seed: 'ko' });
    play(session, 'move 1', 'move 1');
    const ko = extractObservations(session.getLog('p1'), 'p2').find(
      (o) => o.kind === 'hit' && o.hpAfter === 0,
    );
    expect(ko?.kind === 'hit' && ko.atLeast).toBe(true);
  });
});

describe('set beliefs', () => {
  it('finds the standard set behind the damage and the speed seen', () => {
    const hypotheses = beliefsOf(afterEarthquakes(sweeper)).of('garchomp') ?? [];
    const [top] = hypotheses;
    expect(top?.set.item).toBe('lumberry');
    expect(top?.probability).toBeGreaterThan(0.5);
    // The defensive set (no Attack, no Speed) is ruled out by both the damage and the order.
    const defensive = hypotheses.find((h) => h.set.item === 'rockyhelmet');
    expect(defensive?.probability ?? 0).toBeLessThan(0.01);
  });

  it('knows the defensive set when that is what hits', () => {
    const [top] = beliefsOf(afterEarthquakes(bulky)).of('garchomp') ?? [];
    expect(top?.set.item).toBe('rockyhelmet');
  });

  it('comes up with a spread when no standard set fits (custom sets)', () => {
    // Faster than every standard Garchomp, slower than a Choice Scarf one.
    const greninja = set('greninja', ['surf', 'darkpulse', 'icebeam', 'uturn'], {
      nature: 'timid',
      spread: { hp: 2, atk: 0, spa: 32, spe: 32 },
    });
    const scarf = set('garchomp', ['earthquake', 'outrage', 'stoneedge', 'firefang'], {
      item: 'choicescarf',
      nature: 'jolly',
      spread: { hp: 2, atk: 32, spa: 0, spe: 32 },
    });
    const session = scenario('singles', [greninja], [scarf], { seed: 'pañuelo' });
    play(session, 'move 1', 'move 1');
    const context = {
      side: 'p1',
      mode: 'singles',
      log: session.getLog('p1'),
      team: session.getTeam('p1'),
      opponentTeam: null,
    } as unknown as AgentContext;
    const [top] = beliefsOf(context).of('garchomp') ?? [];
    expect(top?.variant).toBe(true);
    expect(top?.set.item).toBe('choicescarf');
  });

  it('depends only on what the bot saw', () => {
    // Different hidden moves, same battle so far: same beliefs.
    const other = { ...sweeper, moves: ['earthquake', 'protect', 'rockslide', 'swordsdance'] };
    const a = beliefsOf(afterEarthquakes(sweeper));
    const b = beliefsOf(afterEarthquakes(other));
    expect(b.entries()).toEqual(a.entries());
  });

  it('applies the Item Clause to the rest of the rival team', () => {
    const context = afterEarthquakes(sweeper);
    const log = [
      ...context.log.filter((line) => !line.startsWith('|turn|2')),
      '|-item|p2a: Garchomp|Rocky Helmet',
      '|turn|2',
    ];
    // Garchomp shows a Rocky Helmet: no other rival holds one.
    const beliefs = beliefsOf({ ...context, log });
    for (const [species, hypotheses] of beliefs.entries()) {
      if (species === 'garchomp') continue;
      if (hypotheses.length === 0) continue;
      const others = hypotheses.filter((h) => h.set.item !== 'rockyhelmet');
      if (others.length > 0) expect(others).toHaveLength(hypotheses.length);
    }
  });

  it('builds legal spread variants', () => {
    const variants = spreadVariants(sweeper, new Set());
    expect(variants.length).toBeGreaterThanOrEqual(4);
    for (const variant of variants) {
      const values = Object.values(variant.statPoints);
      expect(values.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(66);
      expect(Math.max(...values)).toBeLessThanOrEqual(32);
      expect(sameSpread(variant, sweeper) && variant.item === sweeper.item).toBe(false);
    }
    expect(variants.some((variant) => variant.item === 'choicescarf')).toBe(true);
    // A known item stays.
    expect(spreadVariants(sweeper, null).every((variant) => variant.item === 'lumberry')).toBe(
      true,
    );
  });
});

describe('rival style', () => {
  const log = (actions: string[]) =>
    actions.flatMap((action, i) => [`|turn|${i + 1}`, action, '|']).concat(['|turn|99']);

  it('reads what the rival did each turn', () => {
    const actions = rivalActions(
      log([
        '|move|p2a: Garchomp|Earthquake|p1a: Hippowdon',
        '|switch|p2a: Snorlax|Snorlax, L50, M|100/100',
        '|move|p2a: Garchomp|Outrage|p1a: Hippowdon|[from]lockedmove',
      ]),
      'p2',
    );
    expect(actions.get(1)).toEqual(['move:earthquake']);
    expect(actions.get(2)).toEqual(['switch:snorlax']);
    expect(actions.get(3)).toBeUndefined();
  });

  it('learns whether the rival plays the obvious or counters', () => {
    const turns = 6;
    const played = log(Array.from({ length: turns }, () => '|move|p2a: Garchomp|Earthquake|'));
    const obvious = new RivalStyle();
    const counter = new RivalStyle();
    for (let turn = 1; turn <= turns; turn++) {
      obvious.record(turn, { obvious: ['move:earthquake'], counter: ['switch:snorlax'] });
      counter.record(turn, { obvious: ['switch:snorlax'], counter: ['move:earthquake'] });
    }
    const a = obvious.summary(played, 'p2');
    const b = counter.summary(played, 'p2');
    expect(a.obviousRate).toBeGreaterThan(0.75);
    expect(styleAdjustment(a).temperatureFactor).toBeLessThan(1);
    expect(styleAdjustment(a).counterWeight).toBe(0);
    expect(b.counterRate).toBeGreaterThan(0.5);
    expect(styleAdjustment(b).counterWeight).toBeGreaterThan(0.3);
    // No evidence yet: unchanged replies.
    expect(styleAdjustment(new RivalStyle().summary([], 'p2'))).toEqual({
      temperatureFactor: 1,
      counterWeight: 0,
    });
  });

  it('forgets predictions of turns undone by a rewind', () => {
    const style = new RivalStyle();
    style.record(1, { obvious: ['move:earthquake'], counter: [] });
    style.record(2, { obvious: ['move:earthquake'], counter: [] });
    style.record(1, { obvious: ['move:outrage'], counter: [] });
    const summary = style.summary(
      log(['|move|p2a: Garchomp|Earthquake|', '|move|p2a: Garchomp|Earthquake|']),
      'p2',
    );
    expect(summary.observed).toBe(1);
  });
});
