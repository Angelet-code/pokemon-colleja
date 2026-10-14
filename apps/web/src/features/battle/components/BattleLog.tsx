/** The battle log in Spanish (Showdown templates), grouped by turn, following the last line. */
import type { NarrationEntry } from '@colleja/narration';
import { Fragment, type ReactNode, useEffect, useRef } from 'react';
import { RichText } from '../../../components/ui';
import { typeColor } from '../../../lib/type-colors';

/** `header` replaces the title (e.g. with tabs). */
export function BattleLog({ entries, header }: { entries: NarrationEntry[]; header?: ReactNode }) {
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
      {header ? (
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">{header}</div>
      ) : (
        <h2 className="eyebrow border-b border-line px-5 py-4 text-muted">Registro</h2>
      )}
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
        <h3 className="sticky top-0 z-10 mt-4 mb-1 flex items-center gap-2.5 bg-surface py-2 font-display text-[15px] font-bold tracking-[0.12em] text-text uppercase">
          <span>{entry.text}</span>
          <span className="h-px flex-1 bg-line-strong" />
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
        <p
          className={`border-l-[3px] py-px pl-5 text-muted ${SIDE_STYLE[entry.side ?? 'none'].minor}`}
        >
          <ActorText entry={entry} actorClass={SIDE_STYLE[entry.side ?? 'none'].minorActor} />
        </p>
      );
    case 'major':
      return (
        <p
          className={`rounded-r-sm border-l-[3px] py-1 pl-2.5 ${SIDE_STYLE[entry.side ?? 'none'].major} ${entry.spaced ? 'mt-1.5' : ''}`}
        >
          <ActorText entry={entry} actorClass={SIDE_STYLE[entry.side ?? 'none'].majorActor} />
        </p>
      );
  }
}

interface Highlight {
  name: string;
  node: ReactNode;
}

/**
 * The text with the first mention of the Pokémon it is about highlighted, and the move used in the
 * colour of its type.
 */
function ActorText({ entry, actorClass }: { entry: NarrationEntry; actorClass: string }) {
  const highlights: Highlight[] = [];
  if (entry.actor) {
    highlights.push({ name: entry.actor, node: <span className={actorClass}>{entry.actor}</span> });
  }
  if (entry.move) {
    const color = typeColor(entry.move.type);
    highlights.push({
      name: entry.move.name,
      node: (
        <span
          // A touch of the text colour keeps the darkest types (Ghost, Dark) readable in both themes.
          className="font-bold"
          style={{ color: `color-mix(in oklab, ${color} 80%, var(--text))` }}
        >
          {entry.move.name}
        </span>
      ),
    });
  }
  return <>{highlight(entry.text, highlights)}</>;
}

/** Replaces the first mention of each name, in order of appearance, with its highlighted node. */
function highlight(text: string, highlights: Highlight[]): ReactNode[] {
  const found = highlights
    .map((item) => ({ item, at: text.indexOf(item.name) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)[0];
  if (!found) return [<RichText key="text" text={text} />];
  let before = text.slice(0, found.at);
  let after = text.slice(found.at + found.item.name.length);
  // A name already in bold (`**Protección**`) loses its markers: the highlight replaces them.
  if (before.endsWith('**') && after.startsWith('**')) {
    before = before.slice(0, -2);
    after = after.slice(2);
  }
  const rest = highlights.filter((item) => item !== found.item);
  return [
    <RichText key={`before-${found.item.name}`} text={before} />,
    <Fragment key={found.item.name}>{found.item.node}</Fragment>,
    ...highlight(after, rest),
  ];
}

/**
 * Each line is marked with the colour of whose Pokémon it is about: yours (volt) or the rival's
 * (magenta). In an action, that Pokémon's name is a soft tinted tag; in a consequence, plain bold text
 * with only the side bar coloured, so colour marks who acts. Turn headers stay neutral.
 */
const ACTOR_TAG =
  'mx-0.5 rounded-sm px-1.5 py-px font-display font-bold tracking-[0.02em] uppercase';
const SIDE_STYLE = {
  own: {
    major: 'border-accent-fg bg-accent/6',
    majorActor: `${ACTOR_TAG} bg-accent/15 text-accent-fg`,
    minor: 'border-accent-fg/35',
    minorActor: 'font-semibold text-text',
  },
  rival: {
    major: 'border-rival bg-rival/5',
    majorActor: `${ACTOR_TAG} bg-rival/10 text-rival`,
    minor: 'border-rival/35',
    minorActor: 'font-semibold text-text',
  },
  none: {
    major: 'border-transparent',
    majorActor: '',
    minor: 'border-transparent',
    minorActor: '',
  },
} as const;
