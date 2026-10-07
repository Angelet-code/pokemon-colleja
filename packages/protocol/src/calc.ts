/**
 * Damage calculator (`POST /api/calc`). It runs on the server with the same code the bots use
 * (`estimateDamage` of `@colleja/bot`, `@smogon/calc` with Champions rules), so the web does
 * not load the calculator's data.
 */
import { z } from 'zod';
import { PokemonSetSchema } from './teams';

const boost = z.number().int().min(-6).max(6);

export const CALC_WEATHERS = ['sunnyday', 'raindance', 'sandstorm', 'snowscape'] as const;
export const CALC_TERRAINS = [
  'electricterrain',
  'grassyterrain',
  'psychicterrain',
  'mistyterrain',
] as const;
export const CALC_STATUSES = ['brn', 'par', 'psn', 'tox', 'slp', 'frz'] as const;
export const CALC_SCREENS = ['reflect', 'lightscreen', 'auroraveil'] as const;

/** One Pokémon of the calculation: its set and its state. */
export const CalcPokemonSchema = z.object({
  set: PokemonSetSchema,
  /** Mega Evolved (needs its Mega Stone; ignored otherwise). */
  mega: z.boolean().optional(),
  /** Current HP as a % of the max (default 100). */
  hpPercent: z.number().min(1).max(100).optional(),
  status: z.enum(CALC_STATUSES).optional(),
  boosts: z
    .object({ atk: boost, def: boost, spa: boost, spd: boost, spe: boost })
    .partial()
    .optional(),
});

export const CalcFieldSchema = z.object({
  /** Doubles: spread moves deal 75 %. */
  doubles: z.boolean(),
  weather: z.enum(CALC_WEATHERS).optional(),
  terrain: z.enum(CALC_TERRAINS).optional(),
  /** Screens on the defender's side. */
  screens: z.array(z.enum(CALC_SCREENS)).max(3).optional(),
});

export const CalcRequestSchema = z.object({
  attacker: CalcPokemonSchema,
  defender: CalcPokemonSchema,
  move: z.string().regex(/^[a-z0-9]{1,40}$/, 'Movimiento no válido.'),
  field: CalcFieldSchema,
});

export type CalcPokemon = z.infer<typeof CalcPokemonSchema>;
export type CalcField = z.infer<typeof CalcFieldSchema>;
export type CalcRequest = z.infer<typeof CalcRequestSchema>;

export interface CalcResponse {
  /** Species that attacks and defends (their Megas when Mega Evolved). */
  attacker: { species: string };
  defender: { species: string; hp: number; maxhp: number };
  /** Damage rolls (16 normally), absolute HP. Empty for status moves. */
  rolls: number[];
  min: number;
  max: number;
  /** Damage as a % of the defender's max HP (one decimal). */
  minPercent: number;
  maxPercent: number;
  /** Fraction of rolls that knock out the defender from its current HP. */
  koChance: number;
  /** Hits needed to knock it out from its current HP (best and worst roll), `null` if none. */
  hitsToKo: { best: number; worst: number } | null;
  /** Accuracy as a probability (1 = never misses). */
  accuracy: number;
}
