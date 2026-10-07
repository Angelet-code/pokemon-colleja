import { TYPE_NAMES, type TypeChart, type TypeName } from '@colleja/data/schema';
import type { ShowdownContext } from './context';

/** Showdown's `damageTaken` codes → damage multiplier. */
const DAMAGE_TAKEN_MULTIPLIER: Record<number, number> = { 0: 1, 1: 2, 2: 0.5, 3: 0 };

/** 18×18 effectiveness matrix (no Stellar: Champions has no Terastallization). */
export function extractTypeChart({ dex }: ShowdownContext): TypeChart {
  const effectiveness = {} as TypeChart['effectiveness'];
  for (const attacking of TYPE_NAMES) {
    const row = {} as Record<TypeName, number>;
    for (const defending of TYPE_NAMES) {
      const code = dex.types.get(defending).damageTaken[attacking] ?? 0;
      const multiplier = DAMAGE_TAKEN_MULTIPLIER[code];
      if (multiplier === undefined) throw new Error(`Código de daño desconocido: ${code}`);
      row[defending] = multiplier;
    }
    effectiveness[attacking] = row;
  }
  return { types: [...TYPE_NAMES], effectiveness };
}
