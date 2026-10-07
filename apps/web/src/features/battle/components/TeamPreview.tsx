/** Team preview: see the rival's six and pick yours in order (the first ones lead). */
import { type Choice, type PokemonSet, type TeamPreviewRequest, teamChoice } from '@colleja/core';
import { type Locale, toId } from '@colleja/data';
import { abilityName, itemName, moveName, speciesName } from '@colleja/narration';
import { useState } from 'react';
import { PokemonIcon } from '../../../components/PokemonIcon';
import { Button, Panel } from '../../../components/ui';
import { useSettings } from '../../../stores/settings';

export function TeamPreview({
  request,
  team,
  rivalSpecies,
  rivalTeam,
  mode,
  onChoose,
  disabled,
}: {
  request: TeamPreviewRequest;
  /** Your sets as built (same order as the request). */
  team: PokemonSet[];
  rivalSpecies: string[];
  /** Only with Open Team Sheets. */
  rivalTeam: PokemonSet[] | null;
  mode: 'singles' | 'doubles';
  onChoose: (choice: Choice) => void;
  disabled: boolean;
}) {
  const locale = useSettings((state) => state.namesLocale);
  const size = request.maxChosenTeamSize ?? request.side.pokemon.length;
  const [order, setOrder] = useState<number[]>([]);
  const leads = mode === 'doubles' ? 2 : 1;

  function toggle(position: number) {
    setOrder((current) =>
      current.includes(position)
        ? current.filter((entry) => entry !== position)
        : current.length < size
          ? [...current, position]
          : current,
    );
  }

  return (
    <Panel
      title={`Vista previa · elige ${size}`}
      actions={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setOrder([])} disabled={order.length === 0}>
            Limpiar
          </Button>
          <Button
            variant="primary"
            disabled={order.length !== size || disabled}
            onClick={() => onChoose(teamChoice(order))}
          >
            Confirmar equipo
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 p-4 @3xl:grid-cols-2">
        <div>
          <p className="mb-2 text-xs text-muted">
            Pulsa en orden:{' '}
            {leads === 1 ? 'el primero sale de líder' : 'los dos primeros salen de líderes'}.
          </p>
          <ul className="grid gap-1.5">
            {request.side.pokemon.map((pokemon, index) => {
              const position = index + 1;
              const picked = order.indexOf(position);
              const set = team[index];
              const species = toId(pokemon.details.split(',')[0] ?? '');
              return (
                <li key={pokemon.ident}>
                  <button
                    type="button"
                    onClick={() => toggle(position)}
                    aria-pressed={picked >= 0}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition focus-visible:outline-2 focus-visible:outline-accent ${
                      picked >= 0 ? 'border-accent bg-accent/10' : 'border-border hover:bg-panel-2'
                    }`}
                  >
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        picked >= 0 ? 'bg-accent text-accent-text' : 'bg-panel-3 text-faint'
                      }`}
                    >
                      {picked >= 0 ? picked + 1 : '·'}
                    </span>
                    <PokemonIcon species={species} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {speciesName(species, locale)}
                      </span>
                      {set && <SetSummary set={set} locale={locale} />}
                    </span>
                    {picked >= 0 && picked < leads && (
                      <span className="rounded bg-accent/15 px-1.5 text-[10px] font-bold text-accent uppercase">
                        Líder
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs text-muted">Equipo rival</p>
          <ul className="grid gap-1.5">
            {rivalSpecies.map((species, index) => {
              const set =
                rivalTeam?.find((entry) => entry.species === species) ?? rivalTeam?.[index];
              return (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: preview order is the identity.
                  key={index}
                  className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5"
                >
                  <PokemonIcon species={species} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {speciesName(species, locale)}
                    </span>
                    {set && <SetSummary set={set} locale={locale} />}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function SetSummary({ set, locale }: { set: PokemonSet; locale: Locale }) {
  return (
    <span className="block truncate text-[11px] text-muted">
      {[set.item && itemName(set.item, locale), abilityName(set.ability, locale)]
        .filter(Boolean)
        .join(' · ')}
      {' — '}
      {set.moves.map((move) => moveName(move, locale)).join(', ')}
    </span>
  );
}
