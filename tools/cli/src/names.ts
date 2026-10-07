/** Spanish display names for the terminal, always resolved through `@colleja/data`. */
import { type BoostId, detailsSpecies } from '@colleja/core';
import { getMove, getName, type StatId, toId } from '@colleja/data';

export function speciesName(speciesOrDetails: string): string {
  return getName('species', toId(detailsSpecies(speciesOrDetails)));
}

export function moveName(move: string): string {
  return getName('moves', toId(move));
}

export function itemName(item: string): string {
  return getName('items', toId(item));
}

export function abilityName(ability: string): string {
  return getName('abilities', toId(ability));
}

export function natureName(nature: string): string {
  return getName('natures', toId(nature));
}

export function moveTypeName(move: string): string {
  const type = getMove(toId(move))?.type;
  return type ? getName('types', type) : '';
}

const STATUS_SHORT: Record<string, string> = {
  brn: 'QUE',
  par: 'PAR',
  psn: 'ENV',
  tox: 'ENV',
  slp: 'DOR',
  frz: 'CON',
};

export function statusShort(status: string | null): string {
  return status ? (STATUS_SHORT[status] ?? status.toUpperCase()) : '';
}

const BOOST_SHORT: Record<BoostId, string> = {
  atk: 'Atq',
  def: 'Def',
  spa: 'AtE',
  spd: 'DfE',
  spe: 'Vel',
  accuracy: 'Prec',
  evasion: 'Eva',
};

export function boostShort(stat: BoostId): string {
  return BOOST_SHORT[stat];
}

/** `hp` → `PS`, `spa` → `AtE`… */
export function statShort(stat: StatId): string {
  return stat === 'hp' ? 'PS' : BOOST_SHORT[stat];
}

export function boostName(stat: string): string {
  if (stat === 'accuracy') return 'Precisión';
  if (stat === 'evasion') return 'Evasión';
  return getName('stats', stat);
}

const WEATHER_NAMES: Record<string, string> = {
  sunnyday: 'Sol',
  raindance: 'Lluvia',
  sandstorm: 'Tormenta de arena',
  snowscape: 'Nieve',
  snow: 'Nieve',
  hail: 'Granizo',
  desolateland: 'Sol abrasador',
  primordialsea: 'Diluvio',
  deltastream: 'Turbulencias',
};

export function weatherName(weather: string): string {
  return WEATHER_NAMES[toId(weather)] ?? weather;
}

/** Field effects (terrains, Trick Room, screens, Tailwind…) are moves: use their Spanish name. */
export function effectName(effect: string): string {
  const colon = effect.indexOf(':');
  const name = colon < 0 ? effect : effect.slice(colon + 1).trim();
  return getName('moves', toId(name));
}
