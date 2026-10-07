import type { MoveCategory, MoveData, SpeciesData, TypeName } from '@colleja/data/schema';
import { toID } from '@colleja/showdown';
import type { ShowdownContext } from './context';

/** Moves that never appear in learnsets but can show up in battle logs. */
const ALWAYS_INCLUDED = ['struggle'];

/** Union of the Champions learnsets of all selectable species (moves legal in Champions only). */
export function collectLegalMoveIds({ dex }: ShowdownContext, species: SpeciesData[]): Set<string> {
  const ids = new Set<string>(ALWAYS_INCLUDED);
  for (const entry of species) {
    if (entry.kind !== 'standard') continue;
    for (const id of dex.species.getMovePool(toID(entry.id))) {
      const move = dex.moves.get(id);
      if (move.exists && !move.isNonstandard) ids.add(move.id);
    }
  }
  return ids;
}

export function extractMoves({ dex, battle }: ShowdownContext, ids: Set<string>): MoveData[] {
  return [...ids].sort().map((id): MoveData => {
    const move = dex.moves.get(id);
    const secondaries = move.secondaries ?? (move.secondary ? [move.secondary] : []);
    // Same PP-Up rule as sim/pokemon.ts; Champions' calculatePP turns it into 8/12/16/20.
    const ppUps = move.noPPBoosts || move.id === 'trumpcard' ? 0 : 3;
    return {
      id: move.id,
      name: move.name,
      num: move.num,
      type: move.type as TypeName,
      category: move.category as MoveCategory,
      basePower: move.basePower,
      accuracy: move.accuracy,
      pp: battle.calculatePP(move, ppUps),
      priority: move.priority,
      target: move.target,
      flags: Object.entries(move.flags)
        .filter(([, enabled]) => enabled)
        .map(([flag]) => flag)
        .sort(),
      critRatio: move.critRatio ?? 1,
      secondaryChance:
        secondaries.length > 0 ? Math.max(...secondaries.map((s) => s.chance ?? 100)) : null,
      multihit: (move.multihit as MoveData['multihit']) ?? null,
      drain: (move.drain as MoveData['drain']) ?? null,
      recoil: (move.recoil as MoveData['recoil']) ?? null,
      selfSwitch: Boolean(move.selfSwitch),
    };
  });
}
