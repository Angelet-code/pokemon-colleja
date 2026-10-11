/**
 * Why a pair of leads, in game terms (fase 16, ADR-0018): what the 2 vs 2 simulation of the
 * matchup did (KOs, pressure, Fake Out, redirection) plus the plan the pair starts (Trick Room,
 * Tailwind, weather, setup) and who it keeps behind. Built only for the explanation, after the
 * decision: it never touches the random generator.
 */
import type { LeadReading, LeadReason, PreviewAnalysis } from '@colleja/core';
import { getMove } from '@colleja/data';
import { type Combatant, effectiveSpeed } from '../analysis/combatant';
import type { SimTrace } from '../analysis/doubles-sim';
import {
  archetypeStrength,
  LEAD_SCOPE,
  type MemberRead,
  TEAM_ARCHETYPES,
} from '../analysis/team-read';
import { traceMatchup } from './lead-plan';
import type { LeadPlanner, PreviewPlan } from './preview';

/** From this strength (0–1) a plan counts as started by the pair. */
const COMBO_STRENGTH = 0.5;
/** From this chance (0–1) a member counts as a setter or an abuser. */
const ROLE_SHARE = 0.5;
/** Turns of the simulation that count for a KO (the first ones; the third is a guess). */
const KO_TURNS = 2;
/** Share of a rival's HP (0–1) taken away that counts as pressure. */
const PRESSURE_SHARE = 0.5;
/** Chance of a one-hit KO from which a benched member stays behind. */
const AVOID_KO_CHANCE = 0.5;
/** Reasons kept per pair (the plan first, then Fake Out and redirection, KOs, pressure…). */
const MAX_REASONS = 5;

export interface LeadReadingInput {
  planner: LeadPlanner;
  side: 'own' | 'foe';
  /** The pair and the other side's pair it plays against (indexes of each side). */
  pair: readonly number[];
  versus: readonly number[];
  /** The group the pair leads (indexes of its side). */
  group: readonly number[];
  /** The pair's side read as a whole. */
  read: readonly MemberRead[];
  probability?: number;
}

/**
 * The leads of a doubles preview plan with their reasons: the player's likeliest pair against
 * the bot's chosen leads, and the bot's leads against that pair.
 */
export function previewLeads(plan: PreviewPlan): PreviewAnalysis['leads'] {
  const { chosen, reads } = plan;
  const leads = plan.leads?.();
  const top = leads?.foePairs[0];
  if (!leads || !top) return undefined;
  const own = chosen.group.slice(0, chosen.leads);
  return {
    expected: leadReading({
      planner: leads.planner,
      side: 'foe',
      pair: top.members,
      versus: own,
      group: top.group ?? top.members,
      read: reads.foe,
      probability: top.probability,
    }),
    own: leadReading({
      planner: leads.planner,
      side: 'own',
      pair: own,
      versus: top.members,
      group: chosen.group,
      read: reads.own,
    }),
  };
}

/** A pair of leads and its reasons against `versus`. */
export function leadReading(input: LeadReadingInput): LeadReading {
  const { planner, side, pair, versus } = input;
  const other = side === 'own' ? 'foe' : 'own';
  const matchup = planner.matchup(side, pair, versus);
  const [mine, foe] = planner.lineups(side, pair, versus);
  const trace = traceMatchup(planner.situation, mine, foe, matchup.plans);
  const names = new Map<string, string>();
  for (const combatant of [...mine, ...foe]) names.set(combatant.species, combatant.set.species);
  const name = (species: string) => names.get(species) ?? species;
  const reasons = [
    ...comboReasons(input, foe),
    ...traceReasons(trace, name, mine),
    ...avoidReasons(input, other),
  ].slice(0, MAX_REASONS);
  return {
    pair: mine.map((combatant) => combatant.set.species),
    ...(input.probability !== undefined
      ? { probability: Math.round(input.probability * 100) / 100 }
      : {}),
    versus: foe.map((combatant) => combatant.set.species),
    reasons,
  };
}

/**
 * The plans the pair starts: its setters on the field and the abusers it needs (the group's
 * for speed control, its partner's otherwise), with the rival leads they outspeed with it.
 */
function comboReasons(input: LeadReadingInput, rivals: readonly Combatant[]): LeadReason[] {
  const { planner, side, pair, group, read } = input;
  const speed = (index: number) => {
    const combatant = planner.form(side, index);
    return combatant ? effectiveSpeed(combatant) : 0;
  };
  return TEAM_ARCHETYPES.flatMap((kind): LeadReason[] => {
    const abusersFrom = LEAD_SCOPE[kind] === 'setter' ? group : pair;
    if (archetypeStrength(read, kind, pair, abusersFrom) < COMBO_STRENGTH) return [];
    const role = (index: number) => read[index]?.roles[kind];
    const setters = pair.filter((index) => (role(index)?.setter ?? 0) >= ROLE_SHARE);
    const abusers = abusersFrom.filter((index) => {
      const entry = role(index);
      return entry !== undefined && entry.abuser * (1 - entry.setter) >= ROLE_SHARE;
    });
    if (setters.length === 0 || abusers.length === 0) return [];
    const outspeed = rivals.filter((rival) => {
      const theirs = effectiveSpeed(rival);
      return abusers.some((index) => {
        const mine = speed(index);
        if (kind === 'trickroom') return mine < theirs;
        if (kind === 'tailwind') return mine < theirs && mine * 2 > theirs;
        return false;
      });
    });
    const species = (index: number) => read[index]?.species ?? '';
    return [
      {
        kind: 'combo',
        archetype: kind,
        setters: setters.map(species),
        abusers: abusers.map(species),
        outspeed: outspeed.map((rival) => rival.set.species),
      },
    ];
  });
}

/** What the simulation did: Fake Out, redirection, KOs in the first turns and pressure. */
function traceReasons(
  trace: SimTrace,
  name: (species: string) => string,
  mine: readonly Combatant[],
): LeadReason[] {
  const reasons: LeadReason[] = [];
  for (const event of trace.events) {
    if (event.side !== 'mine' || event.turn !== 1) continue;
    if (event.kind === 'flinch') {
      reasons.push({ kind: 'fakeout', user: name(event.user), target: name(event.target) });
    } else if (
      event.kind === 'effect' &&
      (event.move === 'followme' || event.move === 'ragepowder')
    ) {
      const partner = mine.find((combatant) => combatant.species !== event.user);
      if (partner) {
        reasons.push({ kind: 'redirect', user: name(event.user), protects: partner.set.species });
      }
    }
  }
  const knocked = new Set<string>();
  for (const event of trace.events) {
    if (event.kind !== 'ko' || event.side !== 'foe' || event.turn > KO_TURNS) continue;
    knocked.add(event.target);
    reasons.push({
      kind: 'ko',
      by: event.by.map(name),
      target: name(event.target),
      turn: event.turn,
    });
  }
  const pressure = new Map<string, { by: string[]; share: number }>();
  for (const entry of trace.damage) {
    if (entry.side !== 'mine' || knocked.has(entry.target)) continue;
    const total = pressure.get(entry.target) ?? { by: [], share: 0 };
    total.share += entry.share;
    total.by.push(name(entry.attacker));
    pressure.set(entry.target, total);
  }
  for (const [target, { by, share }] of pressure) {
    if (share >= PRESSURE_SHARE) {
      reasons.push({ kind: 'pressure', by, target: name(target), damage: Math.round(share * 100) });
    }
  }
  return reasons;
}

/** Members of the group left behind because a rival lead knocks them out in one hit. */
function avoidReasons(input: LeadReadingInput, other: 'own' | 'foe'): LeadReason[] {
  const { planner, side, pair, versus, group } = input;
  const situation = planner.situation;
  return group.flatMap((index): LeadReason[] => {
    if (pair.includes(index)) return [];
    const member = planner.form(side, index);
    if (!member) return [];
    for (const rivalIndex of versus) {
      const rival = planner.form(other, rivalIndex);
      if (!rival) continue;
      const knocks = rival.moves.some((move) => {
        const data = getMove(move);
        if (!data || data.category === 'Status') return false;
        return situation.damage(rival, member, move).koChance >= AVOID_KO_CHANCE;
      });
      if (knocks) {
        return [{ kind: 'avoid', species: member.set.species, threat: rival.set.species }];
      }
    }
    return [];
  });
}
