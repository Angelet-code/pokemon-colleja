/**
 * `@colleja/bot`: rival bots. Browser-safe: depends on `core`, `data` and `@smogon/calc`.
 * - Level 0 `RandomAgent`: random legal actions.
 * - Level 1 `AggressiveAgent`: maximum expected damage this turn.
 * - Level 2 `TacticalAgent`: simulates the consequences of each option (duels in singles,
 *   2 vs 2 turns in doubles).
 * See docs/guias/bot.md.
 */
export * from './agents/aggressive-agent';
export * from './agents/tactical-agent';
export * from './analysis/combatant';
export * from './analysis/damage';
export * from './analysis/doubles-plan';
export * from './analysis/doubles-sim';
export * from './analysis/duel';
export * from './analysis/evaluation';
export * from './analysis/opponent-model';
export * from './analysis/singles-plan';
export * from './analysis/situation';
export * from './analysis/team-selection';
export * from './levels';
export * from './random-agent';
