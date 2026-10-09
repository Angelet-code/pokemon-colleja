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
 * One Mega Evolution per side: in a lineup only the first holder fights as a Mega.
 */
import type { SeededRandom } from '@colleja/core';
import { type Combatant, makeCombatant, megaSpeciesOf } from '../analysis/combatant';
import { duelScore } from '../analysis/singles-plan';
import { battleForm, type FoeMember, type Situation } from '../analysis/situation';
import { teamChainValue } from '../analysis/team-chain';
import { combinations } from '../analysis/team-selection';

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
}

export const PREVIEW_SETTINGS: Record<'singles' | 'doubles', PreviewSettings> = {
  singles: {
    groups: 4,
    pickTemperature: 40,
    pickUniform: 0.3,
    leadTemperature: 15,
    averageWeight: 0.3,
    noise: 1,
  },
  // Doubles chooses as level 2 (same weight and noise); the rest is only for the prediction.
  doubles: {
    groups: 0,
    pickTemperature: 40,
    pickUniform: 0.3,
    leadTemperature: 15,
    averageWeight: 0.3,
    noise: 2,
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
}

/** A group of the player's and how likely the bot thinks it is. */
interface FoeGroup {
  members: number[];
  probability: number;
  /** Chance of each member leading (same order as `members`). */
  leads: number[];
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
  const duels = own.map((mine) => foes.map((foe) => duelScore(situation, mine, foe.combatant)));
  const leadsPerSide = situation.doubles ? 2 : 1;
  const foeGroups = predictGroups(duels, foes.length, picked, leadsPerSide, settings);
  const brought = foes.map((_, f) =>
    foeGroups.reduce((sum, group) => sum + (group.members.includes(f) ? group.probability : 0), 0),
  );
  const lead = foes.map((_, f) =>
    foeGroups.reduce((sum, group) => {
      const index = group.members.indexOf(f);
      return sum + (index < 0 ? 0 : group.probability * (group.leads[index] ?? 0));
    }, 0),
  );
  const size = Math.min(picked, own.length);
  const options = situation.doubles
    ? doublesOptions(duels, size, settings)
    : singlesOptions(situation, own, foes, foeGroups, size, settings);
  for (const option of options) option.score += random.next() * settings.noise;
  options.sort((a, b) => b.score - a.score);
  const chosen = options[0];
  if (!chosen) return null;
  return { options, chosen, own, foes, duels, brought, lead };
}

/**
 * The player's groups, likeliest first, with their leads: coverage of the bot's six from the
 * player's side, as a softmax mixed with an even spread.
 */
function predictGroups(
  duels: readonly (readonly number[])[],
  foeCount: number,
  picked: number,
  leadsPerSide: number,
  settings: PreviewSettings,
): FoeGroup[] {
  // The player's side of each duel.
  const theirs = Array.from({ length: foeCount }, (_, f) => duels.map((row) => -(row[f] ?? 0)));
  const average = theirs.map((row) => row.reduce((a, b) => a + b, 0) / Math.max(1, row.length));
  const groups = combinations(foeCount, Math.min(picked, foeCount)).map((members) => ({
    members,
    score: coverage(theirs, members, settings.averageWeight),
  }));
  const top = Math.max(...groups.map((group) => group.score));
  const exp = groups.map((group) => Math.exp((group.score - top) / settings.pickTemperature));
  const sum = exp.reduce((a, b) => a + b, 0) || 1;
  const even = 1 / groups.length;
  return groups
    .map((group, i) => {
      const leads = leadChances(
        group.members.map((f) => average[f] ?? 0),
        leadsPerSide,
        settings,
      );
      return {
        members: group.members,
        probability:
          (1 - settings.pickUniform) * ((exp[i] ?? 0) / sum) + settings.pickUniform * even,
        leads,
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
 * members' average duel, and a member's chance adds up the sets it is in.
 */
function leadChances(
  averages: readonly number[],
  leadsPerSide: number,
  settings: PreviewSettings,
): number[] {
  const sets = combinations(averages.length, Math.min(leadsPerSide, averages.length)).map(
    (leads) => ({
      leads,
      value: leads.reduce((sum, member) => sum + (averages[member] ?? 0), 0) / leads.length,
    }),
  );
  const top = Math.max(...sets.map((entry) => entry.value));
  const exp = sets.map((entry) => Math.exp((entry.value - top) / settings.leadTemperature));
  const sum = exp.reduce((a, b) => a + b, 0) || 1;
  const chances = averages.map(() => 0);
  sets.forEach((entry, i) => {
    for (const member of entry.leads)
      chances[member] = (chances[member] ?? 0) + (exp[i] ?? 0) / sum;
  });
  return chances;
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
        lineups.reduce(
          (sum, entry) => sum + entry.weight * teamChainValue(situation, line, entry.line),
          0,
        ) / weightSum;
      return { group, leads: 1, score };
    }),
  );
}

/**
 * Doubles: each own group of four by its coverage of the player's six (like level 2's
 * `selectByCoverage`, with the same noise), the two best on average leading.
 */
function doublesOptions(
  duels: readonly (readonly number[])[],
  size: number,
  settings: PreviewSettings,
): PreviewOption[] {
  const average = duels.map((row) => row.reduce((a, b) => a + b, 0) / Math.max(1, row.length));
  return combinations(duels.length, size).map((members) => ({
    group: [...members].sort((a, b) => (average[b] ?? 0) - (average[a] ?? 0)),
    leads: Math.min(2, size),
    score: coverage(duels, members, settings.averageWeight),
  }));
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
