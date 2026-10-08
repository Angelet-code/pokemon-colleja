import type { Locale } from '@colleja/data';
import { typeName } from '@colleja/narration';
import { typeColor } from '../lib/type-colors';

export function TypeBadge({ type, locale }: { type: string; locale: Locale }) {
  return (
    <span
      className="inline-flex h-[18px] min-w-14 items-center justify-center rounded-xs px-1.5 font-display text-[11px] font-semibold tracking-[0.08em] text-white uppercase [text-shadow:0_1px_0_rgb(0_0_0/0.35)]"
      style={{ background: typeColor(type) }}
    >
      {typeName(type, locale)}
    </span>
  );
}
