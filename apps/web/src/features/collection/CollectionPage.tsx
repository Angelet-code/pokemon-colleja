/** «PC de Bill» (`/pc`): the Pokémon the player owns in the real game, just to know it. */
import { getName, getSpecies, type Locale, type SpeciesId } from '@colleja/data';
import { useEffect, useMemo } from 'react';
import { Combobox } from '../../components/Combobox';
import { IconClose } from '../../components/icons';
import { PokemonIcon } from '../../components/PokemonIcon';
import { TypeBadge } from '../../components/TypeBadge';
import { Empty, IconButton, Loading, Notice, PageHeader } from '../../components/ui';
import { useSettings } from '../../stores/settings';
import { speciesOptions } from '../teams/options';
import { useCollection } from './collection-store';

export function CollectionPage() {
  const locale = useSettings((state) => state.namesLocale);
  const { species, error, saving, load, add, remove } = useCollection();

  useEffect(() => {
    void load(true);
  }, [load]);

  const allSpecies = useMemo(() => speciesOptions(locale), [locale]);
  const missing = useMemo(() => {
    const owned = new Set(species ?? []);
    return allSpecies.filter((option) => !owned.has(option.value));
  }, [allSpecies, species]);

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <PageHeader
        title={
          <>
            PC de Bill
            {species && species.length > 0 && (
              <span className="ml-3 text-faint">{species.length}</span>
            )}
          </>
        }
      >
        <div className="w-72 max-w-full">
          <Combobox
            label="Añadir Pokémon"
            hideLabel
            placeholder="Añadir Pokémon…"
            value={null}
            options={missing}
            onChange={(id) => id && !saving && void add(id)}
          />
        </div>
      </PageHeader>
      {error && <Notice tone="warn" title={error} />}
      {species === null && !error && <Loading />}
      {species?.length === 0 && <Empty>Tu PC está vacío.</Empty>}
      {species && species.length > 0 && (
        <ul
          className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2"
          aria-label="Pokémon de tu PC"
        >
          {species.map((id) => (
            <CollectionCard
              key={id}
              species={id}
              locale={locale}
              disabled={saving}
              onRemove={() => void remove(id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CollectionCard({
  species,
  locale,
  disabled,
  onRemove,
}: {
  species: string;
  locale: Locale;
  disabled: boolean;
  onRemove: () => void;
}) {
  const name = getName('species', species, locale);
  const types = getSpecies(species as SpeciesId)?.types ?? [];
  return (
    <li className="flex items-center gap-2 rounded-md border border-line bg-surface py-1.5 pr-1 pl-2 shadow-panel transition-colors hover:bg-surface-2">
      <PokemonIcon species={species} size={48} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium" title={name}>
          {name}
        </span>
        <span className="flex gap-1">
          {types.map((type) => (
            <TypeBadge key={type} type={type} locale={locale} />
          ))}
        </span>
      </div>
      <IconButton label={`Quitar ${name}`} onClick={onRemove} disabled={disabled}>
        <IconClose size={14} />
      </IconButton>
    </li>
  );
}
