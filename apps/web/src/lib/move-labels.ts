/** Spanish labels of move data (category, power, accuracy), shared by the battle and teambuilder. */
import { getMove, type MoveCategory, type MoveId } from '@colleja/data';

export const CATEGORY_LABEL: Record<MoveCategory, string> = {
  Physical: 'Físico',
  Special: 'Especial',
  Status: 'Estado',
};

/** `Físico · Potencia 100 · Precisión 90 %` (only the parts that apply). */
export function moveDetails(id: MoveId): string {
  const data = getMove(id);
  if (!data) return '';
  return [
    CATEGORY_LABEL[data.category],
    data.basePower ? `Potencia ${data.basePower}` : null,
    typeof data.accuracy === 'number' ? `Precisión ${data.accuracy} %` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
