/**
 * Picks one of the saved teams (your team) or saved opponents (the bot's). Only legal ones
 * can battle; the others are shown with their problems.
 */
import type { TeamSummary } from '@colleja/protocol';
import type { ReactNode } from 'react';
import { PokemonIcon } from '../../components/PokemonIcon';

export function SavedTeamPicker<T extends TeamSummary>({
  teams,
  value,
  onChange,
  legend,
  name,
  empty,
  detail,
}: {
  teams: T[] | null;
  value: string;
  onChange: (team: T) => void;
  legend: string;
  /** Name of the radio group. */
  name: string;
  /** Shown when there is nothing saved. */
  empty: ReactNode;
  /** Extra text next to the state (e.g. the difficulty of an opponent). */
  detail?: (team: T) => string;
}) {
  if (teams === null) return <p className="text-sm text-muted">Cargando…</p>;
  if (teams.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      {teams.map((team) => {
        const selected = team.id === value;
        return (
          <label
            key={team.id}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
              selected ? 'border-accent bg-accent/10' : 'border-border hover:bg-panel-2'
            } ${team.valid ? '' : 'opacity-60'}`}
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
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{team.name}</span>
              <span className={`text-xs ${team.valid ? 'text-good' : 'text-bad'}`}>
                {team.valid
                  ? 'Legal'
                  : `${team.problems.length} problema${team.problems.length === 1 ? '' : 's'}: edítalo para poder combatir`}
              </span>
              {detail && <span className="text-xs text-muted"> · {detail(team)}</span>}
            </span>
            <span className="flex flex-wrap justify-end gap-0.5">
              {team.species.map((species, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: members have no id; the order is the identity.
                <PokemonIcon key={index} species={species} size={32} />
              ))}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
