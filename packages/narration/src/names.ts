/** Display names, always resolved through `@colleja/data` (Spanish by default, or English). */
import { type BoostId, detailsSpecies } from '@colleja/core';
import { getBattleText, getMove, getName, type Locale, type StatId, toId } from '@colleja/data';

export function speciesName(speciesOrDetails: string, locale: Locale = 'es'): string {
  return getName('species', toId(detailsSpecies(speciesOrDetails)), locale);
}

export function moveName(move: string, locale: Locale = 'es'): string {
  return getName('moves', toId(move), locale);
}

export function itemName(item: string, locale: Locale = 'es'): string {
  return getName('items', toId(item), locale);
}

export function abilityName(ability: string, locale: Locale = 'es'): string {
  return getName('abilities', toId(ability), locale);
}

export function natureName(nature: string, locale: Locale = 'es'): string {
  return getName('natures', toId(nature), locale);
}

/** `Fire` → `Fuego`. */
export function typeName(type: string, locale: Locale = 'es'): string {
  return getName('types', type, locale);
}

export function moveTypeName(move: string, locale: Locale = 'es'): string {
  const type = getMove(toId(move))?.type;
  return type ? typeName(type, locale) : '';
}

const STATUS_SHORT: Record<Locale, Record<string, string>> = {
  es: { brn: 'QUE', par: 'PAR', psn: 'ENV', tox: 'ENV', slp: 'DOR', frz: 'CON' },
  en: { brn: 'BRN', par: 'PAR', psn: 'PSN', tox: 'TOX', slp: 'SLP', frz: 'FRZ' },
};

export function statusShort(status: string | null, locale: Locale = 'es'): string {
  return status ? (STATUS_SHORT[locale][status] ?? status.toUpperCase()) : '';
}

const STATUS_NAMES: Record<Locale, Record<string, string>> = {
  es: {
    brn: 'Quemado',
    par: 'Paralizado',
    psn: 'Envenenado',
    tox: 'Gravemente envenenado',
    slp: 'Dormido',
    frz: 'Congelado',
  },
  en: {
    brn: 'Burned',
    par: 'Paralyzed',
    psn: 'Poisoned',
    tox: 'Badly poisoned',
    slp: 'Asleep',
    frz: 'Frozen',
  },
};

export function statusName(status: string, locale: Locale = 'es'): string {
  return STATUS_NAMES[locale][status] ?? status;
}

const BOOST_SHORT: Record<Locale, Record<BoostId, string>> = {
  es: {
    atk: 'Atq',
    def: 'Def',
    spa: 'AtE',
    spd: 'DfE',
    spe: 'Vel',
    accuracy: 'Prec',
    evasion: 'Eva',
  },
  en: {
    atk: 'Atk',
    def: 'Def',
    spa: 'SpA',
    spd: 'SpD',
    spe: 'Spe',
    accuracy: 'Acc',
    evasion: 'Eva',
  },
};

export function boostShort(stat: BoostId, locale: Locale = 'es'): string {
  return BOOST_SHORT[locale][stat];
}

/** `hp` → `PS`, `spa` → `AtE`… */
export function statShort(stat: StatId, locale: Locale = 'es'): string {
  if (stat === 'hp') return locale === 'es' ? 'PS' : 'HP';
  return BOOST_SHORT[locale][stat];
}

export function boostName(stat: string, locale: Locale = 'es'): string {
  return getBattleText(locale).stats[stat] ?? getName('stats', stat, locale);
}

/** `sunnyday` → `Sol`, using Showdown's weather names. */
export function weatherName(weather: string, locale: Locale = 'es'): string {
  const id = toId(weather);
  return (
    getBattleText(locale).default[id]?.weatherName ??
    getBattleText('en').default[id]?.weatherName ??
    weather
  );
}

/** Field effects (terrains, Trick Room, screens, Tailwind…) are moves: use their name. */
export function effectName(effect: string, locale: Locale = 'es'): string {
  const colon = effect.indexOf(':');
  const name = colon < 0 ? effect : effect.slice(colon + 1).trim();
  return getName('moves', toId(name), locale);
}
