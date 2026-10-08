/**
 * Picks one of the saved teams (your team) or saved opponents (the bot's). Only legal ones
 * can battle; the others are shown with their problems.
 */
import type { TeamSummary } from '@colleja/protocol';
import type { ReactNode } from 'react';
import { PokemonIcon } from '../../components/PokemonIcon';
import { Chip, LegalityChip, Loading } from '../../components/ui';

export function SavedTeamPicker<T extends TeamSummary>({
  teams,
  value,
  onChange,
  legend,
  name,
  empty,
  detail,
  side = 'p1',
}: {
  teams: T[] | null;
  value: string;
  onChange: (team: T) => void;
  legend: string;
  /** Name of the radio group. */
  name: string;
  /** Shown when there is nothing saved. */
  empty: ReactNode;
  /** Extra label next to the state (e.g. the difficulty of an opponent). */
  detail?: (team: T) => string;
  /** Colour of the selection mark: yours (volt) or the rival's. */
  side?: 'p1' | 'p2';
}) {
  if (teams === null) return <Loading />;
  if (teams.length === 0) return <p className="px-2 py-3 text-sm text-muted">{empty}</p>;
  const mark = side === 'p1' ? 'bg-accent' : 'bg-rival';
  return (
    <fieldset className="flex flex-col gap-0.5">
      <legend className="sr-only">{legend}</legend>
      {teams.map((team) => {
        const selected = team.id === value;
        return (
          <label
            key={team.id}
            className={`flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-fg ${
              selected ? 'bg-surface-2' : 'hover:bg-surface-2'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={team.id}
              aria-label={team.name}
              className="sr-only"
              checked={selected}
              onChange={() => onChange(team)}
            />
            <span
              aria-hidden="true"
              className={`size-2.5 shrink-0 ${selected ? mark : 'ring-1 ring-line-strong ring-inset'}`}
            />
            <span className="min-w-0 flex-1 truncate font-semibold">{team.name}</span>
            <span
              className={`hidden shrink-0 sm:flex ${team.valid ? '' : 'opacity-50'}`}
              aria-hidden="true"
            >
              {team.species.map((species, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: members have no id; the order is the identity.
                <PokemonIcon key={index} species={species} size={30} />
              ))}
            </span>
            {detail && team.valid ? (
              <Chip className="min-w-[72px] justify-center">{detail(team)}</Chip>
            ) : (
              <span className="flex min-w-[72px] justify-end">
                <LegalityChip problems={team.problems} />
              </span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
}
