/** Comparisons recorded by the calculator: one row per pair, a click opens it again. */
import { getName, type Locale } from '@colleja/data';
import { useMemo, useState } from 'react';
import { normalizeSearch } from '../../components/Combobox';
import { Dialog } from '../../components/Dialog';
import { IconTrash } from '../../components/icons';
import { PokemonIcon } from '../../components/PokemonIcon';
import { IconButton, TextInput } from '../../components/ui';
import { useSettings } from '../../stores/settings';
import { type CalcHistoryEntry, useCalcHistory } from './calc-history';
import type { CalcSetup, CalcSide } from './calc-store';

export function CalcHistoryDialog({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (setup: CalcSetup) => void;
}) {
  const locale = useSettings((state) => state.namesLocale);
  const { entries, remove } = useCalcHistory();
  const [query, setQuery] = useState('');
  const rows = useMemo(() => filterHistory(entries, query, locale), [entries, query, locale]);

  return (
    <Dialog title="Historial" onClose={onClose}>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">Aún no has hecho ninguna comparación.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <TextInput
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar Pokémon"
            aria-label="Buscar en el historial"
          />
          {rows.length === 0 ? (
            <p className="text-sm text-muted">Ninguna comparación con ese Pokémon.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {rows.map(({ id, savedAt, setup }) => {
                const title = `${sideName(setup.attacker, locale)} vs ${sideName(setup.defender, locale)}`;
                return (
                  <li key={id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onOpen(setup)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-surface-3"
                    >
                      <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
                        <PokemonIcon species={setup.attacker.set.species} size={28} />
                        <span className="eyebrow text-faint">vs</span>
                        <PokemonIcon species={setup.defender.set.species} size={28} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
                      <time
                        className="shrink-0 text-xs text-faint tabular-nums"
                        dateTime={new Date(savedAt).toISOString()}
                      >
                        {formatDate(savedAt)}
                      </time>
                    </button>
                    <IconButton label={`Borrar ${title} del historial`} onClick={() => remove(id)}>
                      <IconTrash size={15} />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}

/**
 * Entries where every word typed starts a word of either Pokémon's name ("mil" finds Milotic,
 * "gar inc" Garchomp vs Incineroar), ignoring case and accents.
 */
export function filterHistory(
  entries: CalcHistoryEntry[],
  query: string,
  locale: Locale,
): CalcHistoryEntry[] {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return entries;
  return entries.filter(({ setup }) => {
    const names = normalizeSearch(
      `${sideName(setup.attacker, locale)} ${sideName(setup.defender, locale)}`,
    ).split(' ');
    return words.every((word) => names.some((name) => name.startsWith(word)));
  });
}

function sideName(side: CalcSide, locale: Locale): string {
  const name = getName('species', side.set.species, locale);
  return side.mega ? `Mega ${name}` : name;
}

function formatDate(time: number): string {
  return new Date(time).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
