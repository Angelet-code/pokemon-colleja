/**
 * Damage calculator: `POST /api/calc`. Same code as the bots (`estimateDamage`, Champions as
 * generation 0 of `@smogon/calc`), so the calculator and the bot always agree.
 */
import { emptyField, estimateDamage, makeCombatant, megaEvolved } from '@colleja/bot';
import type { SideId } from '@colleja/core';
import { getMove, type MoveId } from '@colleja/data';
import {
  API_PREFIX,
  type CalcPokemon,
  CalcRequestSchema,
  type CalcResponse,
} from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import { parseBody } from './parse-body';

export function registerCalcRoutes(app: FastifyInstance): void {
  app.post(`${API_PREFIX}/calc`, async (request, reply) => {
    const body = parseBody(CalcRequestSchema, request.body, reply);
    if (!body) return reply;
    if (!getMove(body.move)) {
      return reply.code(400).send({ error: 'Petición no válida.', details: ['move: no existe.'] });
    }
    const attacker = combatant(body.attacker, 'p1');
    const defender = combatant(body.defender, 'p2');
    const field = emptyField(body.field.doubles);
    field.weather = body.field.weather ?? null;
    field.terrain = body.field.terrain ?? null;
    field.conditions = {
      p1: {},
      p2: Object.fromEntries((body.field.screens ?? []).map((screen) => [screen, 1])),
    };
    const estimate = estimateDamage(attacker, defender, body.move as MoveId, field);
    const percent = (damage: number) => Math.round((damage / defender.maxhp) * 1000) / 10;
    const response: CalcResponse = {
      attacker: { species: attacker.species },
      defender: { species: defender.species, hp: defender.hp, maxhp: defender.maxhp },
      rolls: estimate.max > 0 ? estimate.rolls : [],
      min: estimate.min,
      max: estimate.max,
      minPercent: percent(estimate.min),
      maxPercent: percent(estimate.max),
      koChance: estimate.koChance,
      hitsToKo: hitsToKo(defender.hp, estimate.min, estimate.max),
      accuracy: estimate.accuracy,
    };
    return response;
  });
}

function combatant(pokemon: CalcPokemon, side: SideId) {
  const base = makeCombatant({
    side,
    set: pokemon.set,
    hpFraction: (pokemon.hpPercent ?? 100) / 100,
    status: pokemon.status ?? null,
    boosts: pokemon.boosts ?? {},
  });
  return pokemon.mega ? megaEvolved(base) : base;
}

/** Hits to knock out `hp` with the best and the worst roll (ignoring recovery and items). */
function hitsToKo(hp: number, min: number, max: number): CalcResponse['hitsToKo'] {
  if (max <= 0) return null;
  const best = Math.ceil(hp / max);
  return { best, worst: min > 0 ? Math.ceil(hp / min) : best };
}
