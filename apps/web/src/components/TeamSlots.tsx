/** Six square slots with the team's icons; empty slots show a dash (or `?` when hidden). */
import { getName } from '@colleja/data';
import { PokemonIcon } from './PokemonIcon';

export function TeamSlots({
  species,
  size = 6,
  hidden = false,
  label,
}: {
  species: string[];
  size?: number;
  /** The team exists but is not known yet (random rival). */
  hidden?: boolean;
  label?: string;
}) {
  return (
    <ul className="grid grid-cols-6 gap-1.5" aria-label={label}>
      {Array.from({ length: size }, (_, index) => {
        const id = species[index];
        return (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed slots.
            key={index}
            title={id ? getName('species', id) : undefined}
            className="flex aspect-square items-center justify-center rounded-sm bg-surface-2"
          >
            {id ? (
              <PokemonIcon species={id} size={64} />
            ) : (
              <span className="display text-2xl text-line-strong" aria-hidden="true">
                {hidden ? '?' : '–'}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
