/** Display helpers for the battle screen. */
import type { BoostId, ViewPokemon } from '@colleja/core';
import { getName, type Locale } from '@colleja/data';
import { boostShort, effectName, weatherName } from '@colleja/narration';

export function hpPercent(hp: number, maxhp: number): number {
  if (maxhp <= 0) return 0;
  return Math.max(0, Math.min(100, (hp / maxhp) * 100));
}

/** Green above half, yellow above a fifth, red below (as in the games). */
export function hpTone(percent: number): 'good' | 'warn' | 'bad' {
  if (percent > 50) return 'good';
  if (percent > 20) return 'warn';
  return 'bad';
}

const BOOST_ORDER: BoostId[] = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'];

/** `Atq +2`, `Vel −1`… in a stable order. */
export function boostLabels(
  pokemon: ViewPokemon,
  locale: Locale,
): { label: string; value: number }[] {
  return BOOST_ORDER.flatMap((stat) => {
    const value = pokemon.boosts[stat];
    if (!value) return [];
    const sign = value > 0 ? '+' : '−';
    return [{ label: `${boostShort(stat, locale)} ${sign}${Math.abs(value)}`, value }];
  });
}

/** Field effects worth showing: weather, terrain and the pseudo-weathers (Trick Room…). */
export function fieldEffects(
  field: { weather: string | null; terrain: string | null; pseudoWeather: string[] },
  locale: Locale,
): string[] {
  const effects: string[] = [];
  if (field.weather) effects.push(weatherName(field.weather, locale));
  if (field.terrain) effects.push(effectName(field.terrain, locale));
  for (const effect of field.pseudoWeather) effects.push(effectName(effect, locale));
  return effects;
}

/** Side conditions (`reflect`, `tailwind`, `spikes` ×2…) with their localised names. */
export function sideConditions(conditions: Record<string, number>, locale: Locale): string[] {
  return Object.entries(conditions).map(([id, layers]) => {
    const name = getName('moves', id, locale);
    return layers > 1 ? `${name} ×${layers}` : name;
  });
}
