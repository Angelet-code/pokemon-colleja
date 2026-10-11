/**
 * Team preview of the level 3 bot (ADR-0015). It first predicts what the other player will
 * bring: the player, seeing the bot's six, brings the group that best answers them (like
 * level 2's coverage, from their side), with some uncertainty, and leads with the members
 * that fare best. Then:
 * - Singles: each own group of three, with each possible lead, is valued by the whole-team
 *   chain (`teamChainValue`) against the player's likeliest groups and leads.
 * - Doubles: as level 2 (coverage of the player's six, the best two on average lead). Weighing
 *   the coverage by the prediction and choosing the leads against the player's likely leads
 *   lost strength in the arena (ADR-0015): the duel model misses what makes a good lead pair.
 *   A group's duels blend with the same duels under the Trick Room or Tailwind it sets up
 *   (`fieldShare`, ADR-0017), so its slow or fast attackers count with their setter. For the
 *   explanation, the player's lead pairs are played 2 vs 2 against the bot's likely leads
 *   (`LeadPlanner`, ADR-0018); choosing the bot's leads that way lost strength.
 * One Mega Evolution per side: in a lineup only the first holder fights as a Mega.
 * Weather setters (Drizzle…) bring their weather: each duel is fought in the weather of the
 * setters involved (the slowest one's), and an own group is valued in the weather its setters
 * bring (ADR-0016), so a rain team's Swift Swim and Water moves count only with Pelipper.
 * Both teams are also read as a whole for the explanation (`readTeam`, ADR-0017): their
 * archetypes, the group that keeps them together and the lead pair that starts the plan.
 */
import type { SeededRandom, SideId, TeamReading } from '@colleja/core';
import {
  type Combatant,
  makeCombatant,
  megaSpeciesOf,
  weatherAfter,
  weatherOf,
} from '../analysis/combatant';
import { duelScore } from '../analysis/singles-plan';
import { battleForm, type FoeMember, type Situation } from '../analysis/situation';
import { teamChainValue } from '../analysis/team-chain';
import { archetypeStrength, type MemberRead, readMembers, readTeam } from '../analysis/team-read';
import { combinations } from '../analysis/team-selection';
import { type LeadMatchup, leadMatchup } from './lead-plan';

export interface PreviewSettings {
  /** The player's likeliest groups played against in singles. */
  groups: number;
  /** Softmax temperature of the player's groups (coverage points). */
  pickTemperature: number;
  /** Share of the player's pick spread evenly over every group (they may not pick "best"). */
  pickUniform: number;
  /** Softmax temperature of the player's lead inside a group (duel points). */
  leadTemperature: number;
  /** Weight of the average duel next to the best answer per rival (coverage). */
  averageWeight: number;
  /** Random points added to each option, for variety (ties and near ties). */
  noise: number;
  /**
   * Share of the battle a group plays under the Trick Room or Tailwind it sets up (times how
   * complete that archetype is): its duels blend with the same duels under that field.
   */
  fieldShare: SpeedControlShares;
  /** Doubles lead pairs played 2 vs 2. */
  leads: LeadSettings;
}

export interface LeadSettings {
  /**
   * Turn-1 options kept per slot when playing lead pairs 2 vs 2 for the explanation (0 = no
   * simulation: the player's leads predicted by average duel and no lead reasons).
   */
  kept: number;
  /** The bot's likely lead pairs (its best groups') the player's pairs are played against. */
  botPairs: number;
  /** The player's likeliest lead pairs kept (the expected one is the first). */
  playerPairs: number;
  /** Softmax temperature of the player's lead pair inside a group (simulation points). */
  temperature: number;
}

const NO_LEADS: LeadSettings = { kept: 0, botPairs: 0, playerPairs: 0, temperature: 1 };

export const PREVIEW_SETTINGS: Record<'singles' | 'doubles', PreviewSettings> = {
  singles: {
    groups: 4,
    pickTemperature: 40,
    pickUniform: 0.3,
    leadTemperature: 15,
    averageWeight: 0.3,
    noise: 1,
    // Singles keeps its choice (fase 15): the archetypes are only read.
    fieldShare: { trickRoom: 0, tailwind: 0 },
    leads: NO_LEADS,
  },
  // Doubles chooses as level 2 (same weight and noise); the rest is only for the prediction.
  doubles: {
    groups: 0,
    pickTemperature: 40,
    pickUniform: 0.3,
    leadTemperature: 15,
    averageWeight: 0.3,
    noise: 2,
    // Measured with the saved rivals and random teams (ADR-0017).
    fieldShare: { trickRoom: 0.5, tailwind: 0.5 },
    // Only for the explanation: choosing the leads with it lost strength (ADR-0018).
    leads: { kept: 4, botPairs: 3, playerPairs: 6, temperature: 20 },
  },
};

/** One option of the bot: the Pokémon it brings (indexes into `own`), the leads first. */
export interface PreviewOption {
  group: number[];
  /** How many of `group` start on the field. */
  leads: number;
  score: number;
}

export interface PreviewPlan {
  /** Best first. */
  options: PreviewOption[];
  chosen: PreviewOption;
  /** What the bot read, for the explanation (`readPreview`). */
  own: Combatant[];
  foes: FoeMember[];
  duels: number[][];
  brought: number[];
  lead: number[];
  /** Both teams as a whole. */
  teams: { rival: TeamReading; own: TeamReading };
  /** Each member's part in each archetype, per side. */
  reads: { own: MemberRead[]; foe: MemberRead[] };
  /**
   * Doubles: the player's leads predicted by playing pairs 2 vs 2 (computed on demand, for the
   * explanation only: it never changes the decision).
   */
  leads?: () => LeadPrediction;
}

/** A pair of leads (indexes into `own` or `foes`) and how likely it is. */
export interface LeadPair {
  members: number[];
  probability: number;
  /** The likeliest group it leads (the player's pairs over all their groups). */
  group?: number[];
}

/** The player's likeliest lead pairs and the 2 vs 2 matchups the bot played. */
export interface LeadPrediction {
  /** The player's lead pairs, likeliest first (the ones the bot played against). */
  foePairs: LeadPair[];
  /** The bot's likely lead pairs the player's pairs were played against. */
  botPairs: number[][];
  planner: LeadPlanner;
  /** 0–1 per foe: chance that the player leads with it (replaces the duel-based one). */
  lead: number[];
}

/** A group of the player's and how likely the bot thinks it is. */
interface FoeGroup {
  members: number[];
  probability: number;
  /** Chance of each member leading (same order as `members`). */
  leads: number[];
  /** Each set of leads (indexes into `foes`) and its chance inside the group. */
  pairs: LeadPair[];
}

export function planPreview(
  situation: Situation,
  picked: number,
  settings: PreviewSettings,
  random: SeededRandom,
): PreviewPlan | null {
  const own = situation.own.map((member) => battleForm(member.combatant));
  const foes = situation.foes.filter((foe) => foe.view === null);
  if (own.length === 0 || foes.length === 0) return null;
  const duel = duelTable(situation, own, foes);
  // Each pair in its own weather (the setters among the two).
  const duels = own.map((mine, i) => foes.map((foe, f) => duel(i, f, [mine, foe.combatant])));
  const leadsPerSide = situation.doubles ? 2 : 1;
  const ownRead = readMembers(
    situation.me,
    situation.own.map((member) => [{ set: member.combatant.set, weight: 1 }]),
  );
  const foeRead = readMembers(
    situation.foe,
    foes.map((foe) =>
      foe.candidates.map((set, i) => ({
        set,
        weight: foe.weights ? (foe.weights[i] ?? 0) : 1,
      })),
    ),
  );
  // The player's side of each duel, with the speed control their group brings.
  const theirRows = (members: readonly number[]) => {
    const shares = speedControlShares(foeRead, members, settings);
    return foes.map((foe, f) =>
      members.includes(f)
        ? own.map(
            (mine, i) => -blendedDuel(duel, i, f, [mine, foe.combatant], shares, situation.foe),
          )
        : own.map((_, i) => -(duels[i]?.[f] ?? 0)),
    );
  };
  const foeGroups = predictGroups(duels, theirRows, foeRead, picked, leadsPerSide, settings);
  const brought = foes.map((_, f) =>
    foeGroups.reduce((sum, group) => sum + (group.members.includes(f) ? group.probability : 0), 0),
  );
  const lead = leadShares(foes.length, foeGroups);
  const size = Math.min(picked, own.length);
  const options = situation.doubles
    ? doublesOptions(situation, own, foes, duel, ownRead, size, settings)
    : singlesOptions(situation, own, foes, foeGroups, size, settings);
  const ownRows = (members: readonly number[]) => {
    const shares = speedControlShares(ownRead, members, settings);
    return own.map((mine, i) =>
      members.includes(i)
        ? foes.map((foe, f) => blendedDuel(duel, i, f, [mine, foe.combatant], shares, situation.me))
        : (duels[i] ?? []),
    );
  };
  const teams = {
    rival: readSide(foeRead, theirRows, size, leadsPerSide, settings),
    own: readSide(ownRead, ownRows, size, leadsPerSide, settings),
  };
  for (const option of options) option.score += random.next() * settings.noise;
  options.sort((a, b) => b.score - a.score);
  const chosen = options[0];
  if (!chosen) return null;
  let leads: LeadPrediction | undefined;
  const predictLeads = () => {
    leads ??= predictLeadPairs(situation, own, foes, options, settings, (pairValue) =>
      predictGroups(duels, theirRows, foeRead, picked, leadsPerSide, settings, pairValue),
    );
    return leads;
  };
  return {
    options,
    chosen,
    own,
    foes,
    duels,
    brought,
    lead,
    teams,
    reads: { own: ownRead, foe: foeRead },
    ...(situation.doubles && settings.leads.kept > 0 ? { leads: predictLeads } : {}),
  };
}

/** 0–1 per foe: chance that the player leads with it, over their groups. */
function leadShares(count: number, groups: readonly FoeGroup[]): number[] {
  return Array.from({ length: count }, (_, f) =>
    groups.reduce((sum, group) => {
      const index = group.members.indexOf(f);
      return sum + (index < 0 ? 0 : group.probability * (group.leads[index] ?? 0));
    }, 0),
  );
}

/**
 * The player's leads predicted by playing each of their pairs 2 vs 2 against the bot's likely
 * leads (those of its best groups, the chosen one first), and their likeliest pairs.
 */
function predictLeadPairs(
  situation: Situation,
  own: readonly Combatant[],
  foes: readonly FoeMember[],
  options: readonly PreviewOption[],
  settings: PreviewSettings,
  predict: (pairValue: (pair: readonly number[]) => number) => FoeGroup[],
): LeadPrediction {
  const planner = new LeadPlanner(situation, own, foes, settings.leads.kept);
  const botPairs = likelyPairs(options, settings.leads.botPairs);
  const groups = predict(
    (pair) =>
      botPairs.reduce((sum, versus) => sum + planner.matchup('foe', pair, versus).value, 0) /
      Math.max(1, botPairs.length),
  );
  return {
    foePairs: likeliestFoePairs(groups, settings.leads.playerPairs),
    botPairs,
    planner,
    lead: leadShares(foes.length, groups),
  };
}

/**
 * Lead pairs played 2 vs 2 (`leadMatchup`), each matchup once. A pair is two indexes into
 * `own` or `foes`; in a lineup only the first Mega Stone holder fights as a Mega.
 */
export class LeadPlanner {
  private readonly cache = new Map<string, LeadMatchup>();
  private readonly ownBase: Combatant[];
  private readonly foeForms: Combatant[];
  private readonly foeBase: Combatant[];

  constructor(
    readonly situation: Situation,
    private readonly own: readonly Combatant[],
    foes: readonly FoeMember[],
    private readonly kept: number,
  ) {
    this.ownBase = situation.own.map((member) => member.combatant);
    this.foeForms = foes.map((foe) => foe.combatant);
    this.foeBase = foes.map((foe) => baseOf(situation, foe.combatant));
  }

  /**
   * `pair` of `side` against `versus` of the other side, from `pair`'s point of view (its
   * turn-1 options, the other side attacking).
   */
  matchup(side: 'own' | 'foe', pair: readonly number[], versus: readonly number[]): LeadMatchup {
    const key = `${side}:${pair.join(',')}:${versus.join(',')}`;
    let result = this.cache.get(key);
    if (!result) {
      const [mine, foe] = this.lineups(side, pair, versus);
      result = leadMatchup(this.situation, mine, foe, this.kept);
      this.cache.set(key, result);
    }
    return result;
  }

  /** A Pokémon of `side` in its battle form (the one its lineups use when it is the Mega). */
  form(side: 'own' | 'foe', index: number): Combatant | undefined {
    return side === 'own' ? this.own[index] : this.foeForms[index];
  }

  /** The two lineups of a matchup, `pair`'s side first. */
  lineups(
    side: 'own' | 'foe',
    pair: readonly number[],
    versus: readonly number[],
  ): [Combatant[], Combatant[]] {
    const own = (members: readonly number[]) => lineup(members, this.ownBase, this.own);
    const foe = (members: readonly number[]) => lineup(members, this.foeBase, this.foeForms);
    return side === 'own' ? [own(pair), foe(versus)] : [foe(pair), own(versus)];
  }
}

/** The leads of the bot's best `count` groups (best first), each pair once. */
function likelyPairs(options: readonly PreviewOption[], count: number): number[][] {
  const pairs: number[][] = [];
  for (const option of [...options].sort((a, b) => b.score - a.score)) {
    if (pairs.length >= count) break;
    const pair = option.group.slice(0, 2).sort((a, b) => a - b);
    if (!pairs.some((other) => other.join() === pair.join())) pairs.push(pair);
  }
  return pairs;
}

/** The player's `count` likeliest lead pairs over all their groups, renormalised. */
function likeliestFoePairs(groups: readonly FoeGroup[], count: number): LeadPair[] {
  const total = new Map<string, LeadPair & { best: number }>();
  for (const group of groups) {
    for (const pair of group.pairs) {
      const members = [...pair.members].sort((a, b) => a - b);
      const key = members.join();
      const entry = total.get(key) ?? { members, probability: 0, best: -1 };
      const chance = group.probability * pair.probability;
      entry.probability += chance;
      if (chance > entry.best) {
        entry.best = chance;
        entry.group = group.members;
      }
      total.set(key, entry);
    }
  }
  const top = [...total.values()].sort((a, b) => b.probability - a.probability).slice(0, count);
  const sum = top.reduce((acc, pair) => acc + pair.probability, 0) || 1;
  return top.map(({ best: _, ...pair }) => ({ ...pair, probability: pair.probability / sum }));
}

/**
 * The player's groups, likeliest first, with their leads: coverage of the bot's six from the
 * player's side, as a softmax mixed with an even spread.
 */
function predictGroups(
  duels: readonly (readonly number[])[],
  theirRows: (members: readonly number[]) => number[][],
  foeRead: readonly MemberRead[],
  picked: number,
  leadsPerSide: number,
  settings: PreviewSettings,
  pairValue?: (pair: readonly number[]) => number,
): FoeGroup[] {
  const foeCount = foeRead.length;
  // The player's side of each duel.
  const theirs = Array.from({ length: foeCount }, (_, f) => duels.map((row) => -(row[f] ?? 0)));
  const average = theirs.map((row) => row.reduce((a, b) => a + b, 0) / Math.max(1, row.length));
  const groups = combinations(foeCount, Math.min(picked, foeCount)).map((members) => ({
    members,
    score: coverage(theirRows(members), members, settings.averageWeight),
  }));
  const top = Math.max(...groups.map((group) => group.score));
  const exp = groups.map((group) => Math.exp((group.score - top) / settings.pickTemperature));
  const sum = exp.reduce((a, b) => a + b, 0) || 1;
  const even = 1 / groups.length;
  return groups
    .map((group, i) => {
      const { chances, sets } = leadChances(
        group.members.map((f) => average[f] ?? 0),
        leadsPerSide,
        settings,
        pairValue && ((set) => pairValue(set.map((member) => group.members[member] as number))),
      );
      return {
        members: group.members,
        probability:
          (1 - settings.pickUniform) * ((exp[i] ?? 0) / sum) + settings.pickUniform * even,
        leads: chances,
        pairs: sets.map((set) => ({
          members: set.members.map((member) => group.members[member] as number),
          probability: set.probability,
        })),
      };
    })
    .sort((a, b) => b.probability - a.probability);
}

/**
 * How well a group answers the other side, like level 2's `selectByCoverage`: for each rival,
 * its best answer, plus a little of the members' average (`scores[member][rival]`).
 */
export function coverage(
  scores: readonly (readonly number[])[],
  members: readonly number[],
  averageWeight: number,
): number {
  const rivals = scores[members[0] ?? 0]?.length ?? 0;
  let best = 0;
  let total = 0;
  for (let rival = 0; rival < rivals; rival++) {
    best += Math.max(...members.map((member) => scores[member]?.[rival] ?? 0));
    for (const member of members) total += scores[member]?.[rival] ?? 0;
  }
  // `total / members`: the members' average, summed over the rivals.
  return best + (averageWeight * total) / Math.max(1, members.length);
}

/**
 * Chance of each member to start on the field: every set of leads is a softmax of its
 * members' average duel (or, with `simulated`, of its 2 vs 2 value), and a member's chance
 * adds up the sets it is in. Indexes are inside the group.
 */
function leadChances(
  averages: readonly number[],
  leadsPerSide: number,
  settings: PreviewSettings,
  simulated?: (set: readonly number[]) => number,
): { chances: number[]; sets: LeadPair[] } {
  const sets = combinations(averages.length, Math.min(leadsPerSide, averages.length)).map(
    (leads) => ({
      leads,
      value: simulated
        ? simulated(leads)
        : leads.reduce((sum, member) => sum + (averages[member] ?? 0), 0) / leads.length,
    }),
  );
  const temperature = simulated ? settings.leads.temperature : settings.leadTemperature;
  const top = Math.max(...sets.map((entry) => entry.value));
  const exp = sets.map((entry) => Math.exp((entry.value - top) / temperature));
  const sum = exp.reduce((a, b) => a + b, 0) || 1;
  const chances = averages.map(() => 0);
  sets.forEach((entry, i) => {
    for (const member of entry.leads)
      chances[member] = (chances[member] ?? 0) + (exp[i] ?? 0) / sum;
  });
  return {
    chances,
    sets: sets.map((entry, i) => ({ members: entry.leads, probability: (exp[i] ?? 0) / sum })),
  };
}

/** Singles: every own group of three with every lead, against the player's likeliest groups. */
function singlesOptions(
  situation: Situation,
  own: readonly Combatant[],
  foes: readonly FoeMember[],
  foeGroups: readonly FoeGroup[],
  size: number,
  settings: PreviewSettings,
): PreviewOption[] {
  const played = foeGroups.slice(0, Math.max(1, settings.groups));
  const total = played.reduce((sum, group) => sum + group.probability, 0) || 1;
  const ownBase = situation.own.map((member) => member.combatant);
  const foeBase = foes.map((foe) => baseOf(situation, foe.combatant));
  const foeForms = foes.map((foe) => foe.combatant);
  // The player's lineups (each lead with the rest behind) and their weight.
  const lineups = played.flatMap((group) =>
    group.members.map((lead, i) => ({
      line: lineup([lead, ...group.members.filter((member) => member !== lead)], foeBase, foeForms),
      weight: (group.probability / total) * (group.leads[i] ?? 0),
    })),
  );
  const weightSum = lineups.reduce((sum, entry) => sum + entry.weight, 0) || 1;
  return combinations(own.length, size).flatMap((members) =>
    members.map((lead) => {
      const group = [lead, ...members.filter((member) => member !== lead)];
      const line = lineup(group, ownBase, own);
      const score =
        lineups.reduce((sum, entry) => {
          // Both leads enter: the weather of their setters (later ones change it in the chain).
          const leads = [line[0] as Combatant, entry.line[0] as Combatant];
          const field = situation.withWeather(weatherAfter(leads, situation.field.weather));
          return sum + entry.weight * teamChainValue(field, line, entry.line);
        }, 0) / weightSum;
      return { group, leads: 1, score };
    }),
  );
}

/** Trick Room on, or Tailwind on one side, for a duel. */
interface SpeedControl {
  trickRoom: boolean;
  tailwind: SideId | null;
}

/**
 * Duel score of `own[mine]` against `foes[foe]` in the weather `setters` bring (and with
 * `control`, if given).
 */
type DuelTable = (
  mine: number,
  foe: number,
  setters: readonly Combatant[],
  control?: SpeedControl,
) => number;

/** Duel scores by field, each one computed once. */
function duelTable(
  situation: Situation,
  own: readonly Combatant[],
  foes: readonly FoeMember[],
): DuelTable {
  const cache = new Map<string, number>();
  return (mine, foe, setters, control) => {
    const weather = weatherAfter(setters, situation.field.weather);
    const key = `${mine}:${foe}:${weather}:${control?.trickRoom ?? ''}:${control?.tailwind ?? ''}`;
    let score = cache.get(key);
    if (score === undefined) {
      const attacker = own[mine] as Combatant;
      const defender = (foes[foe] as FoeMember).combatant;
      const field = situation.withWeather(weather);
      score = duelScore(control ? field.withSpeedControl(control) : field, attacker, defender);
      cache.set(key, score);
    }
    return score;
  };
}

/** Share of the battle a group plays under its own Trick Room and Tailwind. */
export interface SpeedControlShares {
  trickRoom: number;
  tailwind: number;
}

/**
 * How much of the battle a group plays under the speed control it sets up: `fieldShare` times
 * how complete that archetype is in the group (a setter with the attackers that profit).
 */
function speedControlShares(
  read: readonly MemberRead[],
  members: readonly number[],
  settings: PreviewSettings,
): SpeedControlShares {
  const { trickRoom, tailwind } = settings.fieldShare;
  return {
    trickRoom: trickRoom && trickRoom * archetypeStrength(read, 'trickroom', members, members),
    tailwind: tailwind && tailwind * archetypeStrength(read, 'tailwind', members, members),
  };
}

/**
 * A duel blended with the same duel under the group's speed control (Trick Room, or Tailwind
 * on `side`), each weighed by its share of the battle.
 */
function blendedDuel(
  duel: DuelTable,
  mine: number,
  foe: number,
  setters: readonly Combatant[],
  shares: SpeedControlShares,
  side: SideId,
): number {
  const base = duel(mine, foe, setters);
  let value = base;
  if (shares.trickRoom > 0) {
    value += shares.trickRoom * (duel(mine, foe, setters, TRICK_ROOM) - base);
  }
  if (shares.tailwind > 0) {
    const tailwind = side === 'p1' ? TAILWIND_P1 : TAILWIND_P2;
    value += shares.tailwind * (duel(mine, foe, setters, tailwind) - base);
  }
  return value;
}

const TRICK_ROOM: SpeedControl = { trickRoom: true, tailwind: null };
const TAILWIND_P1: SpeedControl = { trickRoom: false, tailwind: 'p1' };
const TAILWIND_P2: SpeedControl = { trickRoom: false, tailwind: 'p2' };

/**
 * Doubles: each own group of four by its coverage of the player's six (like level 2's
 * `selectByCoverage`, with the same noise), the two best on average leading. Each duel is
 * fought in the weather the group's setters and that rival bring, blended with the speed
 * control the group sets up.
 */
function doublesOptions(
  situation: Situation,
  own: readonly Combatant[],
  foes: readonly FoeMember[],
  duel: DuelTable,
  ownRead: readonly MemberRead[],
  size: number,
  settings: PreviewSettings,
): PreviewOption[] {
  return combinations(own.length, size).map((members) => {
    const setters = members.map((i) => own[i] as Combatant).filter((mine) => weatherOf(mine));
    const shares = speedControlShares(ownRead, members, settings);
    const duels = own.map((_, i) =>
      members.includes(i)
        ? foes.map((foe, f) =>
            blendedDuel(duel, i, f, [...setters, foe.combatant], shares, situation.me),
          )
        : foes.map(() => 0),
    );
    const average = duels.map((row) => row.reduce((a, b) => a + b, 0) / Math.max(1, row.length));
    return {
      group: [...members].sort((a, b) => (average[b] ?? 0) - (average[a] ?? 0)),
      leads: Math.min(2, size),
      score: coverage(duels, members, settings.averageWeight),
    };
  });
}

/**
 * One team as a whole (`readTeam`): ties between groups broken by their coverage and between
 * lead pairs by their average duel, from that team's side (`rows`: its duels when it brings
 * `members`, with the speed control they set up).
 */
function readSide(
  read: readonly MemberRead[],
  rows: (members: readonly number[]) => number[][],
  size: number,
  leadsPerSide: number,
  settings: PreviewSettings,
): TeamReading {
  const all = read.map((_, index) => index);
  const averages = rows(all).map((row) => row.reduce((a, b) => a + b, 0) / Math.max(1, row.length));
  return readTeam(
    read,
    size,
    leadsPerSide,
    (group) => coverage(rows(group), group, settings.averageWeight),
    (member) => averages[member] ?? 0,
  );
}

/**
 * A lineup in order: the first Mega Stone holder fights as a Mega (one per side), the rest in
 * their base form.
 */
function lineup(
  order: readonly number[],
  base: readonly Combatant[],
  forms: readonly Combatant[],
): Combatant[] {
  let megaUsed = false;
  return order.map((index) => {
    const form = forms[index] as Combatant;
    const plain = base[index] as Combatant;
    if (form === plain || megaUsed) return plain;
    megaUsed = true;
    return form;
  });
}

/** A rival's combatant in its base form (the preview's are in their battle form). */
function baseOf(situation: Situation, combatant: Combatant): Combatant {
  if (!megaSpeciesOf(combatant.set) || combatant.species === combatant.set.species) {
    return combatant;
  }
  return makeCombatant({ side: situation.foe, set: combatant.set });
}
