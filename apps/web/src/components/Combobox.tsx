/**
 * Searchable select (ARIA combobox + listbox): type to filter, arrows to move, Enter to pick,
 * Esc to cancel. Options match by every word of the query against their `search` text, without
 * accents, so "lanzal" finds "Lanzallamas" and "flameth" finds "Flamethrower"; with no such
 * match, a typo or two is forgiven ("ploriferacion" finds "Proliferación", see `lib/search`).
 */
import { type KeyboardEvent, type ReactNode, useId, useMemo, useRef, useState } from 'react';
import { indexForSearch, searchIndex } from '../lib/search';
import { IconChevronDown } from './icons';
import { inputClass } from './ui';

export interface ComboOption {
  value: string;
  /** Text shown in the input once picked. */
  label: string;
  /** Extra text to match (other-language name, type…). The label always matches. */
  search?: string;
  /** Row content in the list (defaults to the label). */
  render?: ReactNode;
  /** Small icon before the label, in the list and in the input once picked. */
  icon?: ReactNode;
  disabled?: boolean;
}

/** Rows rendered at most; typing narrows the rest. */
const MAX_VISIBLE = 80;

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
  clearIcon,
  trailing,
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
  /** Icon of the clearing row (e.g. «Sano»). */
  clearIcon?: ReactNode;
  /**
   * Details of the picked value shown right after its name, inside the box, while it is
   * closed (a move's type and figures). Typing hides them.
   */
  trailing?: ReactNode;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const selected = options.find((option) => option.value === value) ?? null;
  const indexed = useMemo(
    () => indexForSearch(options, (option) => `${option.label} ${option.search ?? ''}`),
    [options],
  );
  const rows = useMemo(() => {
    const matches = searchIndex(indexed, query);
    const clear: ComboOption[] =
      clearLabel && !query ? [{ value: '', label: clearLabel, icon: clearIcon }] : [];
    return [...clear, ...matches];
  }, [indexed, query, clearLabel, clearIcon]);
  // The icon shown in the input: the picked option's, or the clearing row's when empty.
  const shownIcon = open ? null : selected ? selected.icon : value === null ? clearIcon : null;
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
  const showTrailing = Boolean(trailing) && !open && selected !== null && !shownIcon;

  return (
    <div className="relative flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'eyebrow text-faint'}>
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
        value={open ? query : (selected?.label ?? (clearIcon ? clearLabel : undefined) ?? '')}
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
        className={`${inputClass} pr-7 ${shownIcon ? 'pl-9' : ''} ${showTrailing ? 'text-transparent' : ''}`}
      />
      {showTrailing && (
        // Closed with details: the name and its details are drawn over the input (whose own
        // text is hidden), so the details follow the name whatever its length.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-8 bottom-0 left-3 flex h-9 items-center gap-2.5 overflow-hidden text-sm"
        >
          <span className="shrink-0">{selected?.label}</span>
          {trailing}
        </span>
      )}
      {shownIcon && (
        <span className="pointer-events-none absolute bottom-0 left-2.5 flex h-9 items-center">
          {shownIcon}
        </span>
      )}
      <IconChevronDown
        size={14}
        className={`pointer-events-none absolute right-2.5 bottom-[11px] text-faint transition-transform ${open ? 'rotate-180' : ''}`}
      />
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="scroll-thin absolute top-full right-0 left-0 z-30 mt-1 max-h-80 min-w-64 overflow-y-auto rounded-sm border border-line-strong bg-surface py-1 shadow-2xl"
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
              className={`cursor-pointer border-l-2 px-3 py-1.5 text-sm ${
                index === active ? 'border-accent bg-surface-3' : 'border-transparent'
              } ${option.disabled ? 'cursor-not-allowed opacity-50' : ''} ${
                option.value === value ? 'font-semibold' : ''
              }`}
            >
              {option.render ??
                (option.icon ? (
                  <span className="flex items-center gap-2">
                    {option.icon}
                    {option.label}
                  </span>
                ) : (
                  option.label
                ))}
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
