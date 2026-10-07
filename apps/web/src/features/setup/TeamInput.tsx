/**
 * A team pasted in Showdown export format, checked as you type (`checkTeam` from core, the
 * same rules as the server; Showdown's validator has the final word when the battle starts).
 */
import { checkTeam, type PokemonSet, parseShowdownTeam } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { itemName, speciesName } from '@colleja/narration';
import { type ReactNode, useId, useMemo } from 'react';
import { PokemonIcon } from '../../components/PokemonIcon';
import { useSettings } from '../../stores/settings';

export interface TeamCheck {
  sets: PokemonSet[];
  problems: string[];
}

export function useTeamCheck(text: string, mode: GameMode): TeamCheck {
  return useMemo(() => {
    if (!text.trim()) return { sets: [], problems: [] };
    const { sets, problems } = parseShowdownTeam(text);
    return { sets, problems: [...problems, ...checkTeam(sets, mode)] };
  }, [text, mode]);
}

export function TeamInput({
  label,
  value,
  onChange,
  check,
  actions,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  check: TeamCheck;
  actions?: ReactNode;
  placeholder?: string;
}) {
  const id = useId();
  const locale = useSettings((state) => state.namesLocale);
  const empty = !value.trim();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <div className="flex gap-2">{actions}</div>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        rows={12}
        placeholder={placeholder}
        aria-invalid={!empty && check.problems.length > 0}
        className="min-h-48 w-full resize-y rounded-lg border border-border bg-panel-2 px-3 py-2 font-mono text-xs leading-relaxed text-text placeholder:text-faint focus:border-accent focus:outline-none"
      />
      {check.sets.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Pokémon leídos">
          {check.sets.map((set, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: sets have no id; the order is the identity.
              key={index}
              className="flex items-center gap-1.5 rounded-md border border-border bg-panel-2 py-0.5 pr-2 pl-0.5 text-xs"
            >
              <PokemonIcon species={set.species} size={28} />
              <span className="font-medium">{speciesName(set.species, locale)}</span>
              {set.item && <span className="text-muted">@ {itemName(set.item, locale)}</span>}
            </li>
          ))}
        </ul>
      )}
      {!empty && check.problems.length > 0 && (
        <ul
          className="space-y-1 rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-xs text-bad"
          role="alert"
        >
          {check.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {!empty && check.problems.length === 0 && (
        <p className="text-xs text-good">Equipo correcto ({check.sets.length} Pokémon).</p>
      )}
    </div>
  );
}
