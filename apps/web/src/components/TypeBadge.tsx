import type { Locale } from '@colleja/data';
import { typeName } from '@colleja/narration';
import { typeColor } from '../lib/type-colors';

export function TypeBadge({ type, locale }: { type: string; locale: Locale }) {
  return (
    <span
      className="inline-block rounded px-1.5 py-px text-[11px] font-semibold text-white"
      style={{ background: typeColor(type) }}
    >
      {typeName(type, locale)}
    </span>
  );
}
