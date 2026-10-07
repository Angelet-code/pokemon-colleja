/**
 * `@colleja/engine`: battle engine on top of the vendored Showdown simulator (Node-only).
 * The rest of the project talks to it with `@colleja/core` types.
 */
export { type ResolvedFormat, resolveFormat } from './formats';
export { PERSPECTIVES, type Perspective, splitByPerspective } from './protocol';
export { REPLAY_VERSION, type ReplayData } from './replay';
export { AgentError, type DecideOptions, decideFor, type PlayOptions, playOut } from './runner';
export { toBattleSeed } from './seed';
export {
  type BattleConfig,
  type BattleEvent,
  type BattleListener,
  type BattlePlayer,
  BattleSession,
  type ChoiceResult,
} from './session';
export { fromShowdownSet, toShowdownSet } from './sets';
export { type TeamValidation, TeamValidationError, validateTeam } from './validate';
