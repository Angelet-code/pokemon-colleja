/**
 * Lead positions of a replay (fase 21): at the start of turn 1, the lead factors from each
 * player's side. Each side knows its own group (the Pokémon it brought, as the whole replay
 * shows them; if fewer than four came out, the rest of its preview weighs the slots left) and
 * sees the rival like a spectator: its leads and its preview. Every set is assumed with
 * `OpponentModel` from the team preview only (nothing of what happens after turn 1).
 */
import {
  EffectTimers,
  extractLeadFeatures,
  OpponentModel,
  spectatorPosition,
  withOwnBack,
} from '@colleja/bot';
import { BattleView, detailsSpecies, type SideId } from '@colleja/core';
import { getSpecies, toId } from '@colleja/data';
import { previewSpecies, type StoredReplay } from '@colleja/metagame';

export interface LeadRow {
  id: string;
  side: SideId;
  rating: number;
  /** 1 if `side` won the battle. */
  won: 0 | 1;
  /** Its two leads (species ids, base formes). */
  leads: string[];
  x: number[];
}

const BROUGHT = 4;

/** Base species id of a details string (`Salamence-Mega, L50, M` → `salamence`). */
function baseSpecies(details: string): string {
  return previewSpecies(detailsSpecies(details)) ?? toId(detailsSpecies(details));
}

const num = (id: string) => getSpecies(id)?.num ?? -1;

/** The Pokémon each side brought, in order of appearance (the whole replay). */
export function broughtBySide(lines: readonly string[]): Record<SideId, string[]> {
  const brought: Record<SideId, string[]> = { p1: [], p2: [] };
  for (const line of lines) {
    const [, kind, who, details] = line.split('|');
    if (kind !== 'switch' && kind !== 'drag' && kind !== 'replace') continue;
    const side = who?.slice(0, 2);
    if ((side !== 'p1' && side !== 'p2') || !details) continue;
    const species = baseSpecies(details);
    if (!brought[side].some((other) => num(other) === num(species))) brought[side].push(species);
  }
  return brought;
}

export function replayLeads(replay: StoredReplay): LeadRow[] {
  const lines = replay.log.split('\n');
  const result = BattleView.from(lines);
  const winner = result.winner;
  if (!winner || result.gameType !== 'doubles') return [];
  const brought = broughtBySide(lines);
  const view = new BattleView();
  const timers = new EffectTimers();
  const model = new OpponentModel('doubles');
  for (const line of lines) {
    view.apply(line);
    timers.apply(line);
    if (line.startsWith('|turn|')) break;
  }
  if (view.turn !== 1) return [];
  const spectator = spectatorPosition(view, timers.left(), 'doubles', model);

  return (['p1', 'p2'] as const).flatMap((side): LeadRow[] => {
    const data = view.sides[side];
    const leads = data.pokemon
      .filter((pokemon) => pokemon.position !== null)
      .map((pokemon) => pokemon.baseSpecies);
    if (leads.length !== 2) return [];
    const leadNums = new Set(leads.map(num));
    const back = brought[side].filter((species) => !leadNums.has(num(species)));
    const known = new Set([...leadNums, ...back.map(num)]);
    const unseen = data.preview.filter((species) => !known.has(num(species)));
    const slots = Math.max(0, BROUGHT - leads.length - back.length);
    const rest = unseen.length > 0 ? Math.min(1, slots / unseen.length) : 0;
    const entries = [
      ...back.map((species) => ({ set: model.likelySetForSpecies(species), weight: 1 })),
      ...(rest > 0
        ? unseen.map((species) => ({ set: model.likelySetForSpecies(species), weight: rest }))
        : []),
    ];
    const position = withOwnBack(spectator, side, entries);
    return [
      {
        id: replay.id,
        side,
        rating: replay.rating,
        won: side === winner ? 1 : 0,
        leads,
        x: extractLeadFeatures(position, side).map((value) => Math.round(value * 1e6) / 1e6),
      },
    ];
  });
}
