/**
 * Showdown format ids for Pokémon Champions (Regulation M-C) that this project relies on.
 * Domain code should not use these directly: the engine adapter maps our own rulesets to them.
 */
export const CHAMPIONS_FORMATS = {
  /** Battle Stadium Singles, Reg M-C: bring 6, pick 3. */
  singles: 'gen9championsbssregmc',
  /** VGC 2026, Reg M-C: doubles, bring 6, pick 4. */
  doubles: 'gen9championsvgc2026regmc',
  /** Random battles (singles) with Champions random sets. */
  randomSingles: 'gen9championsrandombattle',
  /** Random battles (doubles) with Champions random sets. */
  randomDoubles: 'gen9championsrandomdoublesbattle',
} as const;

export type ChampionsFormatKey = keyof typeof CHAMPIONS_FORMATS;
export type ChampionsFormatId = (typeof CHAMPIONS_FORMATS)[ChampionsFormatKey];

/** Showdown mod that holds the Champions data and mechanics overrides. */
export const CHAMPIONS_MOD = 'champions';
