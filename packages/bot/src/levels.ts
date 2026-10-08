/**
 * Bot levels available to the CLI, the arena and (phase 5) the UI.
 */
import type { BattleAgent } from '@colleja/core';
import { AggressiveAgent } from './agents/aggressive-agent';
import { ExpertAgent } from './agents/expert-agent';
import { TacticalAgent } from './agents/tactical-agent';
import { RandomAgent } from './random-agent';

export type BotLevel = 0 | 1 | 2 | 3;

export interface BotLevelInfo {
  level: BotLevel;
  /** Spanish display name. */
  name: string;
  /** Spanish one-line description for the UI. */
  description: string;
}

export const BOT_LEVELS: readonly BotLevelInfo[] = [
  { level: 0, name: 'Aleatorio', description: 'Elige al azar entre las acciones legales.' },
  {
    level: 1,
    name: 'Agresivo',
    description:
      'Busca el máximo daño cada turno: prioriza los KOs y megaevoluciona en cuanto puede.',
  },
  {
    level: 2,
    name: 'Táctico',
    description:
      'Calcula el daño, se protege, controla la velocidad, cambia si el enfrentamiento es malo y coordina los ataques en dobles.',
  },
  {
    level: 3,
    name: 'Experto',
    description:
      'Como el táctico, pero juega cada turno por adelantado con el simulador contra tus respuestas más probables antes de decidir.',
  },
];

/** Strongest level available: the default rival (product decision, 2026-10-07). */
export const DEFAULT_BOT_LEVEL: BotLevel = 3;

export function isBotLevel(value: number): value is BotLevel {
  return BOT_LEVELS.some((info) => info.level === value);
}

export function botLevelInfo(level: BotLevel): BotLevelInfo {
  return BOT_LEVELS.find((info) => info.level === level) as BotLevelInfo;
}

export function createBot(level: BotLevel, options: { seed?: string } = {}): BattleAgent {
  switch (level) {
    case 0:
      return new RandomAgent(options);
    case 1:
      return new AggressiveAgent(options);
    case 2:
      return new TacticalAgent(options);
    case 3:
      return new ExpertAgent(options);
  }
}
