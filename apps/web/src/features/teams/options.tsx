/**
 * Options of the teambuilder pickers. Every option matches its name in both languages, so the
 * search works whatever the names setting; rows show the data that helps to choose.
 */
import type { PokemonSet } from '@colleja/core';
import {
  getAbility,
  getDescription,
  getLearnset,
  getMove,
  getName,
  getSpecies,
  type Locale,
  listNatures,
  listSpecies,
  type MoveId,
  type SpeciesId,
  type StandardSet,
} from '@colleja/data';
import { statShort } from '@colleja/narration';
import type { ComboOption } from '../../components/Combobox';
import { ItemIcon } from '../../components/ItemIcon';
import { PokemonIcon } from '../../components/PokemonIcon';
import { TypeBadge } from '../../components/TypeBadge';
import { CATEGORY_LABEL } from '../../lib/move-labels';
import type { ItemChoice } from './team-draft';

const other = (locale: Locale): Locale => (locale === 'es' ? 'en' : 'es');

/** Name in the chosen language plus the other one for the search. */
function names(kind: Parameters<typeof getName>[0], id: string, locale: Locale) {
  return { label: getName(kind, id, locale), search: getName(kind, id, other(locale)) };
}

export function speciesOptions(locale: Locale): ComboOption[] {
  return listSpecies('standard')
    .map((species) => {
      const { label, search } = names('species', species.id, locale);
      return {
        value: species.id,
        label,
        search: `${search} ${species.num}`,
        render: (
          <span className="flex items-center gap-2">
            <PokemonIcon species={species.id} size={32} />
            <span className="flex-1 truncate">{label}</span>
            <span className="flex gap-1">
              {species.types.map((type) => (
                <TypeBadge key={type} type={type} locale={locale} />
              ))}
            </span>
          </span>
        ),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}

export function abilityOptions(species: SpeciesId, locale: Locale): ComboOption[] {
  return (getSpecies(species)?.abilities ?? []).map((id) => {
    const { label, search } = names('abilities', id, locale);
    const description = getDescription('abilities', id, locale);
    return {
      value: id,
      label,
      search,
      render: (
        <span className="flex flex-col">
          <span>{label}</span>
          {description && <span className="text-xs text-muted">{description}</span>}
        </span>
      ),
    };
  });
}

const ITEM_CATEGORY: Record<string, string> = {
  'mega-stone': 'Megapiedra',
  berry: 'Baya',
  gem: 'Gema',
  held: 'Objeto',
};

export function itemOptions(
  choices: ItemChoice[],
  members: readonly PokemonSet[],
  locale: Locale,
): ComboOption[] {
  return choices
    .map(({ item, heldBy }) => {
      const { label, search } = names('items', item.id, locale);
      const holder = heldBy === null ? null : members[heldBy];
      return {
        value: item.id,
        label,
        search: `${search} ${ITEM_CATEGORY[item.category]}`,
        render: (
          <span className="flex items-center gap-2">
            <ItemIcon item={item.id} reserve />
            <span className="flex-1 truncate">{label}</span>
            <span className="shrink-0 text-xs text-muted">
              {holder ? (
                <span className="text-warn">
                  Ya lo lleva {getName('species', holder.species, locale)}
                </span>
              ) : (
                ITEM_CATEGORY[item.category]
              )}
            </span>
          </span>
        ),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}

export function natureOptions(locale: Locale): ComboOption[] {
  return listNatures()
    .map((nature) => {
      const { label, search } = names('natures', nature.id, locale);
      const effect =
        nature.plus && nature.minus
          ? `+${statShort(nature.plus, locale)} −${statShort(nature.minus, locale)}`
          : 'neutra';
      return {
        value: nature.id,
        label: `${label} (${effect})`,
        search,
        render: (
          <span className="flex justify-between gap-2">
            <span>{label}</span>
            <span className="text-xs text-muted">{effect}</span>
          </span>
        ),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}

/** Moves of the species' learnset only, with type, category, power, accuracy and PP. */
export function moveOptions(species: SpeciesId, locale: Locale, taken: MoveId[]): ComboOption[] {
  return getLearnset(species)
    .flatMap((id) => {
      const move = getMove(id);
      if (!move) return [];
      const { label, search } = names('moves', id, locale);
      const accuracy = typeof move.accuracy === 'number' ? `${move.accuracy} %` : '—';
      return [
        {
          value: id,
          label,
          search: `${search} ${getName('types', move.type, locale)} ${CATEGORY_LABEL[move.category]}`,
          disabled: taken.includes(id),
          render: (
            <span className="grid grid-cols-[1fr_auto] items-center gap-x-2">
              <span className="truncate">{label}</span>
              <span className="flex items-center gap-1.5">
                <TypeBadge type={move.type} locale={locale} />
                <span className="w-14 text-xs text-muted">{CATEGORY_LABEL[move.category]}</span>
              </span>
              <span className="text-xs text-faint">
                {getDescription('moves', id, locale)?.slice(0, 90) ?? ''}
              </span>
              <span className="text-right text-xs text-muted tabular-nums">
                {move.basePower || '—'} · {accuracy} · PP {move.pp}
              </span>
            </span>
          ),
        },
      ];
    })
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}

const ROLE_LABELS: Record<string, string> = {
  'Bulky Attacker': 'Atacante resistente',
  'Bulky Support': 'Apoyo resistente',
  'Setup Sweeper': 'Barredor con mejoras',
  'Bulky Setup': 'Mejoras resistente',
  'Fast Attacker': 'Atacante rápido',
  'Fast Support': 'Apoyo rápido',
  Wallbreaker: 'Rompemuros',
  'Offensive Protect': 'Ofensivo con Protección',
  'Doubles Bulky Setup': 'Mejoras resistente',
  'Doubles Setup Sweeper': 'Barredor con mejoras',
  'Doubles Support': 'Apoyo',
  'Doubles Fast Attacker': 'Atacante rápido',
  'Doubles Bulky Attacker': 'Atacante resistente',
  'Doubles Wallbreaker': 'Rompemuros',
  'Choice Item user': 'Objeto elección',
};

/** `Atacante rápido · Charizardita Y · Modesta` */
export function standardSetLabel(standard: StandardSet, locale: Locale): string {
  return [
    ROLE_LABELS[standard.role] ?? standard.role,
    standard.item ? getName('items', standard.item, locale) : null,
    getName('natures', standard.nature, locale),
    getAbility(standard.ability) ? getName('abilities', standard.ability, locale) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
