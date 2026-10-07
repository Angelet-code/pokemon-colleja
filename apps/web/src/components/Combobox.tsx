/**
 * Searchable select (ARIA combobox + listbox): type to filter, arrows to move, Enter to pick,
 * Esc to cancel. Options match by every word of the query against their `search` text, without
 * accents, so "lanzal" finds "Lanzallamas" and "flameth" finds "Flamethrower".
 */
import { type KeyboardEvent, type ReactNode, useId, useMemo, useRef, useState } from 'react';

export interface ComboOption {
  value: string;
  /** Text shown in the input once picked. */
  label: string;
  /** Extra text to match (other-language name, type…). The label always matches. */
  search?: string;
  /** Row content in the list (defaults to the label). */
  render?: ReactNode;
  disabled?: boolean;
}

/** Rows rendered at most; typing narrows the rest. */
const MAX_VISIBLE = 80;

export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, '');
}

export function Combobox({
  label,
  value,
  options,
  onChange,
  placeholder,
  emptyText = 'Sin resultados.',
  invalid = false,
  hideLabel = false,
  clearLabel,
}: {
  label: string;
  value: string | null;
  options: ComboOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyText?: string;
  invalid?: boolean;
  hideLabel?: boolean;
  /** When set, the first row clears the value (e.g. "Sin objeto"). */
  clearLabel?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const selected = options.find((option) => option.value === value) ?? null;
  const indexed = useMemo(
    () =>
      options.map((option) => ({
        option,
        text: normalizeSearch(`${option.label} ${option.search ?? ''}`),
      })),
    [options],
  );
  const rows = useMemo(() => {
    const words = normalizeSearch(query).split(' ').filter(Boolean);
    const matches = indexed
      .filter(({ text }) => words.every((word) => text.includes(word)))
      .map(({ option }) => option);
    const clear: ComboOption[] = clearLabel && !query ? [{ value: '', label: clearLabel }] : [];
    return [...clear, ...matches];
  }, [indexed, query, clearLabel]);
  const visible = rows.slice(0, MAX_VISIBLE);

  function openList() {
    setOpen(true);
    setQuery('');
    const index = rows.findIndex((row) => row.value === value);
    setActive(Math.max(0, index));
  }

  function pick(option: ComboOption | undefined) {
    if (!option || option.disabled) return;
    onChange(option.value === '' && clearLabel ? null : option.value);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) return openList();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => Math.min(visible.length - 1, Math.max(0, current + step)));
    } else if (event.key === 'Enter') {
      if (!open) return;
      event.preventDefault();
      pick(visible[active]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setQuery('');
    }
  }

  const activeId = open && visible[active] ? `${id}-opt-${active}` : undefined;

  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-xs font-medium text-muted'}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-invalid={invalid}
        autoComplete="off"
        spellCheck={false}
        value={open ? query : (selected?.label ?? '')}
        placeholder={open ? (selected?.label ?? placeholder) : placeholder}
        onFocus={openList}
        onClick={() => !open && openList()}
        onBlur={() => {
          setOpen(false);
          setQuery('');
        }}
        onChange={(event) => {
          if (!open) setOpen(true);
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className={`w-full rounded-lg border bg-panel-2 px-3 py-1.5 text-sm placeholder:text-faint focus:border-accent focus:outline-none ${
          invalid ? 'border-bad/70' : 'border-border'
        }`}
      />
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-panel py-1 shadow-xl"
        >
          {visible.map((option, index) => (
            // ARIA combobox pattern: the focus stays in the input (aria-activedescendant) and the
            // keyboard is handled there, so the options are neither focusable nor keyed.
            // biome-ignore lint/a11y/useFocusableInteractive: see above.
            // biome-ignore lint/a11y/useKeyWithClickEvents: see above.
            <div
              key={option.value || '__clear'}
              id={`${id}-opt-${index}`}
              role="option"
              aria-selected={option.value === (value ?? '')}
              aria-disabled={option.disabled || undefined}
              // Keep the focus in the input: the pick happens before the blur closes the list.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(option)}
              onMouseEnter={() => setActive(index)}
              className={`cursor-pointer px-3 py-1.5 text-sm ${
                index === active ? 'bg-panel-3' : ''
              } ${option.disabled ? 'cursor-not-allowed opacity-50' : ''} ${
                option.value === value ? 'font-semibold' : ''
              }`}
            >
              {option.render ?? option.label}
            </div>
          ))}
          {visible.length === 0 && <p className="px-3 py-2 text-sm text-muted">{emptyText}</p>}
          {rows.length > visible.length && (
            <p className="px-3 py-1.5 text-xs text-faint">
              {rows.length - visible.length} más: escribe para filtrar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
