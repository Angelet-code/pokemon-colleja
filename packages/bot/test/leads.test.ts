import { type PokemonSet, SeededRandom } from '@colleja/core';
import { getStandardSets } from '@colleja/data';
import { BattleSession } from '@colleja/engine';
import { standardToSet } from '@colleja/teamgen';
import { describe, expect, it } from 'vitest';
import { makeCombatant } from '../src/analysis/combatant';
import { DoublesSim, type SimTrace } from '../src/analysis/doubles-sim';
import { Situation } from '../src/analysis/situation';
import { ExpertAgent } from '../src/index';
import { leadMatchup } from '../src/search/lead-plan';
import { CLEAR_DUEL, leadChoice } from '../src/search/lead-reasons';
import { PREVIEW_SETTINGS, planPreview } from '../src/search/preview';
import { teamWith } from './helpers';

/** A standard doubles set of a species, with another item (Item Clause). */
function standard(species: string, item: string): PokemonSet {
  const [entry] = getStandardSets(species, 'doubles');
  if (!entry) throw new Error(`sin set estándar: ${species}`);
  return { ...standardToSet(entry), item };
}

const trickRoom = () => [
  standard('farigiraf', 'lifeorb'),
  standard('torkoal', 'charcoal'),
  standard('conkeldurr', 'blackbelt'),
  standard('kingambit', 'sitrusberry'),
  standard('whimsicott', 'focussash'),
  standard('basculegion', 'choicescarf'),
];

/** The bot's situation at doubles team preview (p1). */
function previewSituation(p1: PokemonSet[], p2: PokemonSet[]): Situation {
  const session = BattleSession.create({
    mode: 'doubles',
    seed: 'leads',
    options: { teamPreview: true, openTeamSheets: false },
    players: { p1: { name: 'Bot', team: p1 }, p2: { name: 'Rival', team: p2 } },
  });
  const context = session.getAgentContext('p1');
  if (!context) throw new Error('p1 no tiene que elegir');
  return new Situation(context);
}

describe('lead pairs played 2 vs 2 (fase 16)', () => {
  const situation = previewSituation(trickRoom(), teamWith('doubles', [], 'rival'));
  const combatant = (set: PokemonSet, side: 'p1' | 'p2') => makeCombatant({ side, set });

  it('plays a lineup outside the battle and records what happened', () => {
    // Farigiraf (Trick Room) and Torkoal against two random leads.
    const mine = trickRoom()
      .slice(0, 2)
      .map((set) => combatant(set, 'p1'));
    const rivals = teamWith('doubles', [], 'weak')
      .slice(0, 2)
      .map((set) => combatant(set, 'p2'));
    const trace: SimTrace = { events: [], damage: [] };
    const lineup = { mine, foe: rivals };
    const value = DoublesSim.evaluateLineup(
      situation,
      lineup,
      [{ kind: 'move', move: 'trickroom' }, { kind: 'auto' }],
      trace,
    );
    expect(Number.isFinite(value)).toBe(true);
    expect(trace.events).toContainEqual({
      turn: 1,
      kind: 'effect',
      side: 'mine',
      user: 'farigiraf',
      move: 'trickroom',
    });
    expect(trace.damage.some((entry) => entry.side === 'mine' && entry.share > 0)).toBe(true);
    for (const event of trace.events.filter((e) => e.kind === 'ko')) {
      expect(event.by.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic and finds the turn-1 plan', () => {
    const mine = trickRoom()
      .slice(0, 2)
      .map((set) => combatant(set, 'p1'));
    const foe = teamWith('doubles', [], 'fast')
      .slice(0, 2)
      .map((set) => combatant(set, 'p2'));
    const first = leadMatchup(situation, mine, foe, 4);
    expect(leadMatchup(situation, mine, foe, 4)).toEqual(first);
    expect(first.plans).toHaveLength(2);
  });

  it('explains the expected and its own leads with reasons, without changing the decision', () => {
    const session = BattleSession.create({
      mode: 'doubles',
      seed: 'leads',
      options: { teamPreview: true, openTeamSheets: false },
      players: {
        p1: { name: 'Bot', team: teamWith('doubles', [], 'own') },
        p2: { name: 'Rival', team: trickRoom() },
      },
    });
    const context = session.getAgentContext('p1');
    if (!context) throw new Error('p1 no tiene que elegir');
    const explained = new ExpertAgent({ seed: 'x' });
    const silent = new ExpertAgent({ seed: 'x' });
    expect(explained.choose(context)).toEqual(silent.choose(context));
    const leads = explained.explain()?.preview?.leads;
    expect(leads?.expected?.pair).toHaveLength(2);
    expect(leads?.expected?.versus).toHaveLength(2);
    expect(leads?.expected?.probability).toBeGreaterThan(0);
    expect(leads?.own?.pair).toHaveLength(2);
    // Its own leads are the ones it brings first.
    const chosen = explained.explain()?.options.find((option) => option.chosen);
    const leaders = chosen?.actions.flatMap((action) =>
      action.kind === 'bring' && action.lead ? [action.species] : [],
    );
    expect([...(leads?.own?.pair ?? [])].sort()).toEqual([...(leaders ?? [])].sort());
    // And the reason it gives is about those same leads.
    expect(leads?.choice?.leads.map((lead) => lead.species).sort()).toEqual(
      [...(leaders ?? [])].sort(),
    );
    expect(explained.choose(context)).toEqual(silent.choose(context));
  });
});

describe('why the bot leads with its pair (fase 17)', () => {
  it('gives the reasons of the same duels that decided the leads', () => {
    const situation = previewSituation(teamWith('doubles', [], 'own'), trickRoom());
    const plan = planPreview(situation, 4, PREVIEW_SETTINGS.doubles, new SeededRandom('why'));
    if (!plan) throw new Error('sin plan');
    const choice = leadChoice(plan);
    const rows = plan.chosen.duels;
    if (!choice || !rows) throw new Error('sin razón de la salida');
    const species = (index: number) => plan.own[index]?.set.species;
    const rival = (f: number) => plan.foes[f]?.combatant.set.species;
    const leads = plan.chosen.group.slice(0, 2);
    // The leads are the ones it brings first, and the rest stays behind.
    expect(choice.leads.map((lead) => lead.species)).toEqual(leads.map(species));
    expect(choice.behind).toEqual(plan.chosen.group.slice(2).map(species));
    // Each named duel is one of the duels that ranked the group, and clear.
    const average = (index: number) => {
      const row = rows[index] ?? [];
      return row.reduce((a, b) => a + b, 0) / row.length;
    };
    leads.forEach((index, i) => {
      const lead = choice.leads[i];
      const row = rows[index] ?? [];
      for (const name of lead?.beats ?? []) {
        expect(row[plan.foes.findIndex((_, f) => rival(f) === name)]).toBeGreaterThanOrEqual(
          CLEAR_DUEL,
        );
      }
      for (const name of lead?.fears ?? []) {
        expect(row[plan.foes.findIndex((_, f) => rival(f) === name)]).toBeLessThanOrEqual(
          -CLEAR_DUEL,
        );
      }
      for (const behind of plan.chosen.group.slice(2)) {
        expect(average(index)).toBeGreaterThanOrEqual(average(behind));
      }
    });
    expect(choice.leads.some((lead) => lead.beats.length + lead.fears.length > 0)).toBe(true);
  });
});
