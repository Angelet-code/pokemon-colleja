/**
 * Lineups for the whole-team estimate (`teamChainValue`): the living Pokémon of each side,
 * the one on the field first. The rival's are what the bot assumes (`Assumption`): the seen
 * ones as seen, plus the assumed sets of those not seen yet.
 */
import type { SandboxBattle } from '@colleja/core';
import { getSpecies } from '@colleja/data';
import { type Combatant, makeCombatant } from '../analysis/combatant';
import { fightingForm } from '../analysis/singles-plan';
import { battleForm, type Situation } from '../analysis/situation';
import type { Assumption } from './assumptions';

/** Own living Pokémon, the one on the field first (benched ones in their battle form). */
export function ownLineup(situation: Situation): Combatant[] {
  const alive = situation.own.filter((member) => !member.fainted);
  return [
    ...alive.filter((member) => member.active).map((member) => member.combatant),
    ...alive.filter((member) => !member.active).map((member) => fightingForm(situation, member)),
  ];
}

/**
 * The rival's living Pokémon under an assumption: the seen ones (the one on the field first)
 * and as many unseen ones as it brought and has not shown.
 */
export function foeLineup(situation: Situation, assumption: Assumption): Combatant[] {
  const side = situation.view.sides[situation.foe];
  const seen = situation.foes.filter((foe) => foe.view !== null);
  const line = [
    ...seen.filter((foe) => foe.position !== null && foe.combatant.hp > 0),
    ...seen.filter((foe) => foe.position === null && foe.combatant.hp > 0),
  ].map((foe) => foe.combatant);
  const unseen = Math.max(0, (side.teamSize ?? side.preview.length) - seen.length);
  const megaUsed = side.pokemon.some((pokemon) => pokemon.megaEvolved);
  for (const set of assumption.unseen.slice(0, unseen)) {
    line.push(fresh(situation, set, 1, megaUsed));
  }
  return line;
}

/** The rival's living Pokémon in a fork (as assumed), the one on the field first. */
export function forkFoeLineup(
  situation: Situation,
  leaf: SandboxBattle,
  assumption: Assumption,
): Combatant[] {
  const megaUsed = situation.view.sides[situation.foe].pokemon.some(
    (pokemon) => pokemon.megaEvolved,
  );
  const line: Combatant[] = [];
  for (const pokemon of leaf.pokemon(situation.foe)) {
    if (pokemon.fainted || pokemon.hp <= 0) continue;
    const base = baseSpecies(pokemon.species);
    const seen = situation.foes.find((foe) => foe.view && baseSpecies(foe.view.species) === base);
    let combatant = seen?.combatant;
    if (!combatant) {
      const set = assumption.team.find((candidate) => baseSpecies(candidate.species) === base);
      if (!set) continue;
      combatant = fresh(situation, set, pokemon.hp / pokemon.maxhp, megaUsed);
    }
    if (pokemon.active) line.unshift(combatant);
    else line.push(combatant);
  }
  return line;
}

function fresh(
  situation: Situation,
  set: Assumption['team'][number],
  hpFraction: number,
  megaUsed: boolean,
): Combatant {
  const combatant = makeCombatant({ side: situation.foe, set, hpFraction });
  return megaUsed ? combatant : battleForm(combatant);
}

function baseSpecies(species: string): string {
  const data = getSpecies(species);
  return data?.changesFrom ?? data?.id ?? species;
}
