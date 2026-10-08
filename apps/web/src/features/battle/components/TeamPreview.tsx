/** Team preview: see the rival's six and pick yours in order (the first ones lead). */
import { type Choice, type PokemonSet, type TeamPreviewRequest, teamChoice } from '@colleja/core';
import { type Locale, toId } from '@colleja/data';
import { abilityName, itemName, moveName, speciesName } from '@colleja/narration';
import { useState } from 'react';
import { PokemonIcon } from '../../../components/PokemonIcon';
import { Button } from '../../../components/ui';
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
    <section className="rise @container rounded-md border border-line bg-surface shadow-panel">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-4">
          <h2 className="display text-xl">Elige {size}</h2>
          <ol className="flex gap-1" aria-label="Tu elección">
            {Array.from({ length: size }, (_, index) => {
              const position = order[index];
              const entry = position ? request.side.pokemon[position - 1] : undefined;
              return (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed slots.
                  key={index}
                  className={`relative flex size-11 items-center justify-center rounded-sm ${
                    entry ? 'bg-surface-3' : 'border border-dashed border-line-strong'
                  }`}
                >
                  {entry ? (
                    <PokemonIcon species={toId(entry.details.split(',')[0] ?? '')} size={40} />
                  ) : (
                    <span className="display text-faint">{index + 1}</span>
                  )}
                  {index < leads && (
                    <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-accent px-1 font-display text-[9px] leading-3 font-bold tracking-wider text-on-accent uppercase">
                      Líder
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
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
      </header>
      <div className="grid gap-x-6 gap-y-4 p-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <h3 className="eyebrow mb-2.5 flex items-center gap-2 text-accent-fg">
            <span className="size-2 bg-accent" aria-hidden="true" />
            Tu equipo
          </h3>
          <ul className="grid gap-1">
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
                    className={`flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left transition-colors ${
                      picked >= 0 ? 'bg-surface-3' : 'hover:bg-surface-2'
                    }`}
                  >
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center font-display text-sm font-bold ${
                        picked >= 0
                          ? 'bg-accent text-on-accent'
                          : 'text-faint ring-1 ring-line-strong ring-inset'
                      }`}
                    >
                      {picked >= 0 ? picked + 1 : ''}
                    </span>
                    <PokemonIcon species={species} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {speciesName(species, locale)}
                      </span>
                      {set && <SetSummary set={set} locale={locale} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h3 className="eyebrow mb-2.5 flex items-center gap-2 text-rival">
            <span className="size-2 bg-rival" aria-hidden="true" />
            Rival
          </h3>
          <ul className="grid gap-1">
            {rivalSpecies.map((species, index) => {
              const set =
                rivalTeam?.find((entry) => entry.species === species) ?? rivalTeam?.[index];
              return (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: preview order is the identity.
                  key={index}
                  className="flex items-center gap-3 rounded-sm px-2 py-1.5"
                >
                  <span className="size-6 shrink-0" aria-hidden="true" />
                  <PokemonIcon species={species} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
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
    </section>
  );
}

function SetSummary({ set, locale }: { set: PokemonSet; locale: Locale }) {
  return (
    <span className="block truncate text-xs text-muted">
      {[set.item && itemName(set.item, locale), abilityName(set.ability, locale)]
        .filter(Boolean)
        .join(' · ')}
      <span className="text-faint">
        {' — '}
        {set.moves.map((move) => moveName(move, locale)).join(', ')}
      </span>
    </span>
  );
}
