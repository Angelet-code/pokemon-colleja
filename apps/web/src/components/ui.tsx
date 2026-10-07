/** Small shared building blocks (buttons, panels, segmented controls). */
import { type ButtonHTMLAttributes, type ReactNode, useId } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-text hover:brightness-110 border-transparent',
  secondary: 'bg-panel-2 text-text hover:bg-panel-3 border-border',
  ghost: 'bg-transparent text-muted hover:text-text hover:bg-panel-2 border-transparent',
  danger: 'bg-transparent text-bad hover:bg-bad/10 border-bad/40',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Panel({
  title,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`@container rounded-xl border border-border bg-panel ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          {title && (
            <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
          )}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  title?: string;
}

/** A row of mutually exclusive buttons (radio group). */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  const name = useId();
  return (
    <fieldset className="inline-flex rounded-lg border border-border bg-panel-2 p-0.5">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={String(option.value)}
            title={option.title}
            className={`cursor-pointer rounded-md font-medium transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
              size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1.5 text-sm'
            } ${selected ? 'bg-panel text-text shadow-sm' : 'text-muted hover:text-text'}`}
          >
            <input
              type="radio"
              name={name}
              value={String(option.value)}
              aria-label={typeof option.label === 'string' ? option.label : option.title}
              className="sr-only"
              checked={selected}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-[var(--accent)]"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** Renders Showdown's `**bold**` markup. */
export function RichText({ text }: { text: string }) {
  const parts = text.split('**');
  return (
    <>
      {parts.map((part, i) =>
        // biome-ignore lint/suspicious/noArrayIndexKey: static split of one string.
        i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>,
      )}
    </>
  );
}
