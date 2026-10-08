/** Left column of the editor: the members in order, their problems and the free slots. */
import type { PokemonSet } from '@colleja/core';
import type { Locale } from '@colleja/data';
import { itemName, speciesName } from '@colleja/narration';
import { useMemo } from 'react';
import { Combobox } from '../../../components/Combobox';
import { ItemIcon } from '../../../components/ItemIcon';
import { IconChevronDown, IconChevronUp } from '../../../components/icons';
import { PokemonIcon } from '../../../components/PokemonIcon';
import { Chip } from '../../../components/ui';
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
  const free = Math.max(0, size - members.length);
  return (
    <div className="flex flex-col gap-1">
      <ol className="flex flex-col gap-1" aria-label="Miembros del equipo">
        {members.map((set, index) => {
          const issues = issueCounts[index] ?? 0;
          const active = index === selected;
          const name = speciesName(set.species, locale);
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: members have no id; the position is the identity.
              key={index}
              className={`group relative flex items-center rounded-sm transition-colors ${
                active ? 'bg-surface-3' : 'hover:bg-surface-2'
              }`}
            >
              {active && (
                <span className="absolute inset-y-1.5 left-0 w-0.5 bg-accent" aria-hidden="true" />
              )}
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={active ? 'true' : undefined}
                className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 pr-1 pl-2 text-left"
              >
                <PokemonIcon species={set.species} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{set.nickname ?? name}</span>
                  <span className="flex items-center gap-1 text-xs text-faint">
                    {set.item && <ItemIcon item={set.item} size={20} className="-my-1" />}
                    <span className="truncate">
                      {set.item ? itemName(set.item, locale) : 'Sin objeto'}
                    </span>
                  </span>
                </span>
                {issues > 0 && (
                  <Chip tone="bad" title={`${issues} problema${issues === 1 ? '' : 's'}`}>
                    {issues}
                  </Chip>
                )}
              </button>
              <span className="flex flex-col pr-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  aria-label={`Subir ${name}`}
                  disabled={index === 0}
                  onClick={() => onMove(index, index - 1)}
                  className="rounded-xs p-0.5 text-muted hover:text-text disabled:invisible"
                >
                  <IconChevronUp size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Bajar ${name}`}
                  disabled={index === members.length - 1}
                  onClick={() => onMove(index, index + 1)}
                  className="rounded-xs p-0.5 text-muted hover:text-text disabled:invisible"
                >
                  <IconChevronDown size={14} />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      {free > 0 && (
        <div className="rounded-sm border border-dashed border-line-strong p-2">
          <Combobox
            label={`Añadir Pokémon (${members.length}/${size})`}
            hideLabel
            value={null}
            options={options}
            onChange={(species) => species && onAdd(species)}
            placeholder="Añadir Pokémon…"
          />
        </div>
      )}
      {Array.from({ length: Math.max(0, free - 1) }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: empty slots.
          key={index}
          className="h-[52px] rounded-sm border border-dashed border-line"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
