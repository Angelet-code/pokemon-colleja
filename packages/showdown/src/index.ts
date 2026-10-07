/**
 * Single entry point to the vendored Pokémon Showdown simulator.
 *
 * Showdown is built as CommonJS into `vendor/pokemon-showdown/dist` by `npm run setup`, so it is
 * loaded with `createRequire` and re-exported together with its own type declarations.
 * This is the only module in the project allowed to reach into `vendor/`. Node-only.
 */
/// <reference path="../../../vendor/pokemon-showdown/dist/sim/global-types.d.ts" />
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type * as SimModule from '../../../vendor/pokemon-showdown/dist/sim/index';
import type * as RandomPlayerAIModule from '../../../vendor/pokemon-showdown/dist/sim/tools/random-player-ai';
import { SHOWDOWN_DIST } from './paths';

const require = createRequire(import.meta.url);

function load<T>(relativePath: string): T {
  try {
    return require(join(SHOWDOWN_DIST, relativePath)) as T;
  } catch (error) {
    throw new Error(
      `No se pudo cargar Pokémon Showdown (${relativePath}). Ejecuta "npm run setup" para compilarlo.`,
      { cause: error },
    );
  }
}

const sim = load<typeof SimModule>('sim/index.js');
const tools = load<typeof RandomPlayerAIModule>('sim/tools/random-player-ai.js');

export const { Battle, BattleStream, getPlayerStreams, Dex, Teams, TeamValidator, PRNG, toID } =
  sim;
export const { RandomPlayerAI } = tools;

export type Battle = SimModule.Battle;
export type BattleStream = SimModule.BattleStream;
export type TeamValidator = SimModule.TeamValidator;
export type PRNG = SimModule.PRNG;
export type RandomPlayerAI = RandomPlayerAIModule.RandomPlayerAI;
export type ModdedDex = typeof SimModule.Dex;
export type ShowdownPokemonSet = PokemonSet;
export type ShowdownPRNGSeed = PRNGSeed;
export type ShowdownID = ID;

export type { ChampionsFormatId, ChampionsFormatKey } from './formats';
export { CHAMPIONS_FORMATS, CHAMPIONS_MOD } from './formats';
export { SHOWDOWN_DIST, SHOWDOWN_ROOT } from './paths';
