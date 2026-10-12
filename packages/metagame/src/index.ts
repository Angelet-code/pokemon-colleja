/**
 * `@colleja/metagame`: the metagame of the Showdown ladder as rivals (fase 20, ADR-0022).
 * Smogon's monthly usage stats give the sets; public replays give real teams of six and how
 * common each archetype is. Node-only (files, network, Showdown's validator). See
 * docs/guias/rivales.md#meta.
 */
export * from './naming';
export * from './priors';
export * from './replay-fetch';
export * from './replay-store';
export * from './sets';
export * from './smogon';
export * from './snapshot';
export * from './store';
export * from './teams';
export * from './update';
