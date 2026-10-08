/** The battle log in Spanish (Showdown templates), grouped by turn, following the last line. */
import type { NarrationEntry } from '@colleja/narration';
import { useEffect, useRef } from 'react';
import { RichText } from '../../../components/ui';

export function BattleLog({ entries }: { entries: NarrationEntry[] }) {
  const end = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever new entries arrive.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [entries.length]);

  return (
    <section
      aria-label="Registro del combate"
      className="flex h-full min-h-0 flex-col rounded-md border border-line bg-surface"
    >
      <h2 className="eyebrow border-b border-line px-5 py-4 text-muted">Registro</h2>
      <div
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-4 text-sm leading-relaxed"
        aria-live="polite"
      >
        {entries.length === 0 && <p className="pt-3 text-faint">Aún no ha pasado nada.</p>}
        {entries.map((entry, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the log only grows (or is rebuilt whole).
          <LogEntry key={index} entry={entry} />
        ))}
        <div ref={end} />
      </div>
    </section>
  );
}

function LogEntry({ entry }: { entry: NarrationEntry }) {
  switch (entry.kind) {
    case 'turn':
      return (
        <h3 className="sticky top-0 z-10 mt-3 mb-1 flex items-center gap-2.5 bg-surface py-2 font-display text-[13px] font-bold tracking-[0.12em] text-accent-fg uppercase">
          <span>{entry.text}</span>
          <span className="h-px flex-1 bg-line" />
        </h3>
      );
    case 'end':
      return (
        <p className="mt-3 border-y border-line py-2.5 font-display text-lg font-semibold tracking-[0.02em] uppercase">
          <RichText text={entry.text} />
        </p>
      );
    case 'minor':
      return (
        <p className="pl-3 text-muted">
          <RichText text={entry.text} />
        </p>
      );
    case 'major':
      return (
        <p className={entry.spaced ? 'mt-1.5' : ''}>
          <RichText text={entry.text} />
        </p>
      );
  }
}
