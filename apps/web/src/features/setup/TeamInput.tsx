/**
 * A team pasted in Showdown export format, checked as you type (`checkTeam` from core, the
 * same rules as the server; Showdown's validator has the final word when the battle starts).
 * The members read are shown by the caller (the team's slots).
 */
import { checkTeam, type PokemonSet, parseShowdownTeam } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { type ReactNode, useId, useMemo } from 'react';
import { textareaClass } from '../../components/ui';

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
  const empty = !value.trim();

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        rows={10}
        placeholder={placeholder}
        aria-invalid={!empty && check.problems.length > 0}
        className={`${textareaClass} min-h-44`}
      />
      {!empty && check.problems.length > 0 && (
        <ul className="space-y-0.5 text-xs text-bad" role="alert">
          {check.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {actions && <div className="flex flex-wrap gap-1.5">{actions}</div>}
    </div>
  );
}
