/** Left column of the editor: the members in order, their problems and a slot to add one. */
import type { PokemonSet } from '@colleja/core';
import type { Locale } from '@colleja/data';
import { itemName, speciesName } from '@colleja/narration';
import { useMemo } from 'react';
import { Combobox } from '../../../components/Combobox';
import { PokemonIcon } from '../../../components/PokemonIcon';
import { speciesOptions } from '../options';

export function MemberList({
  members,
  size,
  selected,
  issueCounts,
  locale,
  onSelect,
  onAdd,
  onMove,
}: {
  members: PokemonSet[];
  size: number;
  selected: number;
  issueCounts: number[];
  locale: Locale;
  onSelect: (index: number) => void;
  onAdd: (species: string) => void;
  onMove: (from: number, to: number) => void;
}) {
  const options = useMemo(() => speciesOptions(locale), [locale]);
  return (
    <div className="flex flex-col gap-1.5">
      <ol className="flex flex-col gap-1.5" aria-label="Miembros del equipo">
        {members.map((set, index) => {
          const issues = issueCounts[index] ?? 0;
          const active = index === selected;
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: members have no id; the position is the identity.
              key={index}
              className={`group flex items-center rounded-lg border transition ${
                active ? 'border-accent bg-accent/10' : 'border-border bg-panel-2 hover:bg-panel-3'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={active ? 'true' : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-accent"
              >
                <PokemonIcon species={set.species} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {set.nickname ?? speciesName(set.species, locale)}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {set.item ? itemName(set.item, locale) : 'Sin objeto'}
                  </span>
                </span>
                {issues > 0 ? (
                  <span
                    className="shrink-0 rounded-full bg-bad/15 px-1.5 text-xs font-semibold text-bad"
                    title={`${issues} problema${issues === 1 ? '' : 's'}`}
                  >
                    {issues}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-good" title="Sin problemas">
                    ✓
                  </span>
                )}
              </button>
              <span className="flex flex-col pr-1 opacity-60 group-hover:opacity-100">
                <button
                  type="button"
                  aria-label={`Subir ${speciesName(set.species, locale)}`}
                  disabled={index === 0}
                  onClick={() => onMove(index, index - 1)}
                  className="rounded px-1 text-xs leading-none text-muted hover:text-text disabled:invisible"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Bajar ${speciesName(set.species, locale)}`}
                  disabled={index === members.length - 1}
                  onClick={() => onMove(index, index + 1)}
                  className="rounded px-1 text-xs leading-none text-muted hover:text-text disabled:invisible"
                >
                  ▼
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      {members.length < size && (
        <div className="rounded-lg border border-dashed border-border p-2">
          <Combobox
            label={`Añadir Pokémon (${members.length}/${size})`}
            value={null}
            options={options}
            onChange={(species) => species && onAdd(species)}
            placeholder="Busca una especie…"
          />
        </div>
      )}
    </div>
  );
}
