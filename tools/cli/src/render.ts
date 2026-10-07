/** Text rendering of the field, teams and menus for the terminal. */
import {
  type BattleView,
  type BoostId,
  type PokemonSet,
  parseCondition,
  type RequestPokemon,
  type SideId,
  type ViewPokemon,
} from '@colleja/core';
import { STAT_IDS } from '@colleja/data';
import {
  abilityName,
  boostShort,
  effectName,
  itemName,
  moveName,
  natureName,
  speciesName,
  statShort,
  statusShort,
  weatherName,
} from './names';

const BAR_WIDTH = 20;

export function hpBar(hp: number, maxhp: number): string {
  const ratio = maxhp > 0 ? Math.max(0, Math.min(1, hp / maxhp)) : 0;
  const filled = hp > 0 ? Math.max(1, Math.round(ratio * BAR_WIDTH)) : 0;
  return `[${'█'.repeat(filled)}${'░'.repeat(BAR_WIDTH - filled)}]`;
}

function boosts(pokemon: ViewPokemon): string {
  return Object.entries(pokemon.boosts)
    .map(([stat, value]) => `${boostShort(stat as BoostId)} ${value > 0 ? '+' : ''}${value}`)
    .join(' ');
}

function activeLine(pokemon: ViewPokemon | null, exact: boolean): string {
  if (!pokemon) return '   (vacío)';
  const hp = exact
    ? `${pokemon.hp}/${pokemon.maxhp} PS`
    : `${Math.floor((pokemon.hp / (pokemon.maxhp || 100)) * 100)} %`;
  const parts = [
    `   ${speciesName(pokemon.species).padEnd(18)}`,
    hpBar(pokemon.hp, pokemon.maxhp),
    hp.padStart(exact ? 11 : 5),
  ];
  if (pokemon.fainted) parts.push('debilitado');
  if (pokemon.status) parts.push(statusShort(pokemon.status));
  const boostText = boosts(pokemon);
  if (boostText) parts.push(`(${boostText})`);
  return parts.join(' ');
}

function fieldLine(view: BattleView, me: SideId): string | null {
  const parts: string[] = [];
  if (view.field.weather) parts.push(`Clima: ${weatherName(view.field.weather)}`);
  if (view.field.terrain) parts.push(effectName(view.field.terrain));
  for (const effect of view.field.pseudoWeather) parts.push(effectName(effect));
  for (const side of ['p1', 'p2'] as const) {
    const owner = side === me ? 'tú' : 'rival';
    for (const [condition, layers] of Object.entries(view.sides[side].conditions)) {
      parts.push(`${effectName(condition)}${layers > 1 ? ` ×${layers}` : ''} (${owner})`);
    }
  }
  return parts.length > 0 ? ` ${parts.join(' · ')}` : null;
}

/** Field from `me`'s point of view, plus own bench from the request (exact HP). */
export function renderField(view: BattleView, me: SideId, bench: RequestPokemon[]): string {
  const rival: SideId = me === 'p1' ? 'p2' : 'p1';
  // The narrator already printed the turn header.
  const lines: string[] = [];
  const field = fieldLine(view, me);
  if (field) lines.push(field);
  lines.push(` Rival (${view.sides[rival].name})`);
  for (const pokemon of view.sides[rival].active) lines.push(activeLine(pokemon, false));
  const seen = view.sides[rival].pokemon.filter((p) => p.position === null);
  if (seen.length > 0) {
    lines.push(
      `   Vistos: ${seen.map((p) => `${speciesName(p.species)}${p.fainted ? ' (deb.)' : ''}`).join(', ')}`,
    );
  }
  lines.push(` Tú (${view.sides[me].name})`);
  for (const pokemon of view.sides[me].active) lines.push(activeLine(pokemon, true));
  if (bench.length > 0) {
    lines.push(
      `   Banquillo: ${bench
        .map((p) => {
          const condition = parseCondition(p.condition);
          const state = condition.fainted ? 'deb.' : `${condition.hp}/${condition.maxhp}`;
          return `${speciesName(p.details)} ${state}`;
        })
        .join(' · ')}`,
    );
  }
  return lines.join('\n');
}

/** One-line summary of a set: `Garchomp @ Vidasfera · Piel Tosca · Alegre · Terremoto / …`. */
export function describeSet(set: PokemonSet): string {
  const spread = STAT_IDS.filter((stat) => set.statPoints[stat] > 0)
    .map((stat) => `${set.statPoints[stat]} ${statShort(stat)}`)
    .join('/');
  const parts = [
    `${speciesName(set.species)}${set.item ? ` @ ${itemName(set.item)}` : ''}`,
    abilityName(set.ability),
    natureName(set.nature),
    spread || 'sin Stat Points',
    set.moves.map(moveName).join(' / '),
  ];
  return parts.join(' · ');
}
