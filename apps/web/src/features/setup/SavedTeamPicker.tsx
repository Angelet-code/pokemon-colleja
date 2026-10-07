/** Picks one of the teams saved in the teambuilder (only legal ones can battle). */
import type { TeamSummary } from '@colleja/protocol';
import { Link } from 'react-router';
import { PokemonIcon } from '../../components/PokemonIcon';

export function SavedTeamPicker({
  teams,
  value,
  onChange,
  pickSize,
}: {
  teams: TeamSummary[] | null;
  value: string;
  onChange: (id: string) => void;
  pickSize: number;
}) {
  if (teams === null) return <p className="text-sm text-muted">Cargando equipos…</p>;
  if (teams.length === 0) {
    return (
      <p className="text-sm text-muted">
        No tienes equipos guardados.{' '}
        <Link to="/equipos/nuevo" className="text-accent hover:underline">
          Crea uno
        </Link>{' '}
        o pega uno en formato de Showdown.
      </p>
    );
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">
        Equipo guardado (6 Pokémon; en combate eliges {pickSize})
      </legend>
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
              name="saved-team"
              value={team.id}
              aria-label={team.name}
              className="sr-only"
              checked={selected}
              onChange={() => onChange(team.id)}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{team.name}</span>
              <span className={`text-xs ${team.valid ? 'text-good' : 'text-bad'}`}>
                {team.valid
                  ? 'Legal'
                  : `${team.problems.length} problema${team.problems.length === 1 ? '' : 's'}: edítalo para poder combatir`}
              </span>
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
