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
      className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-panel"
    >
      <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold tracking-wide text-muted uppercase">
        Registro
      </h2>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed"
        aria-live="polite"
      >
        {entries.length === 0 && <p className="text-muted">El combate aún no ha empezado.</p>}
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
        <h3 className="sticky top-0 mt-3 mb-1 flex items-center gap-2 bg-panel py-1 text-xs font-bold tracking-wide text-accent uppercase first:mt-0">
          <span>{entry.text}</span>
          <span className="h-px flex-1 bg-border" />
        </h3>
      );
    case 'end':
      return (
        <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 font-semibold">
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
