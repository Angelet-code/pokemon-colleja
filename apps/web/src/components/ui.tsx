/**
 * Building blocks of the design system (docs/adr/0009-sistema-de-diseno.md): buttons, panels,
 * segmented controls, switches, fields, chips and notices. Pages compose these instead of
 * repeating class strings.
 */
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useId,
} from 'react';
import { IconClose, IconWarning } from './icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 font-display font-semibold tracking-[0.06em] whitespace-nowrap uppercase transition-[background-color,border-color,color,filter] duration-150 select-none disabled:pointer-events-none disabled:opacity-35';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'chamfer bg-accent text-on-accent hover:brightness-105 active:brightness-95 [--cut:8px]',
  secondary:
    'rounded-sm border border-line-strong bg-surface-2 text-text hover:border-text/60 hover:bg-surface-3',
  ghost: 'rounded-sm text-muted hover:bg-surface-3 hover:text-text',
  danger: 'rounded-sm border border-bad/40 text-bad hover:border-bad hover:bg-bad/10',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[13px]',
  md: 'h-9 px-3.5 text-sm',
  lg: 'h-12 px-7 text-lg',
};

/** Classes of a button, also for links that look like one. */
export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md'): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button type="button" className={`${buttonClass(variant, size)} ${className}`} {...props} />
  );
}

/** Square button with only an icon: `label` is its accessible name and tooltip. */
export function IconButton({
  label,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:bg-surface-3 hover:text-text disabled:pointer-events-none disabled:opacity-35 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  actions,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`@container rounded-md border border-line bg-surface shadow-panel ${className}`}
    >
      {(title || actions) && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2">
          {title && <h2 className="eyebrow text-muted">{title}</h2>}
          {actions}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Small figure after the label ("6 → 3"); not part of the accessible name. */
  hint?: ReactNode;
  title?: string;
}

/** A row of mutually exclusive options (radio group); the picked one is inverted. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = 'md',
  stretch = false,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  /** Fill the available width with equal options. */
  stretch?: boolean;
}) {
  const name = useId();
  const sizes = {
    sm: 'h-6 px-2 text-xs',
    md: 'h-8 px-3 text-sm',
    lg: 'h-11 px-5 text-base',
  };
  return (
    <fieldset
      className={`${stretch ? 'flex' : 'inline-flex'} rounded-sm border border-line-strong p-0.5`}
    >
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={String(option.value)}
            title={option.title}
            className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xs font-display font-semibold tracking-[0.06em] whitespace-nowrap uppercase transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-fg ${sizes[size]} ${
              stretch ? 'flex-1' : ''
            } ${selected ? 'bg-text text-bg' : 'text-muted hover:text-text'}`}
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
            {option.hint && (
              <span aria-hidden="true" className="text-[0.8em] opacity-55">
                {option.hint}
              </span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
}

/** A checkbox drawn as a switch. */
export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  className = '',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`group flex cursor-pointer items-center gap-2.5 ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-4 w-7 shrink-0 rounded-full bg-surface-3 ring-1 ring-line-strong transition-colors peer-checked:bg-accent peer-checked:ring-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-fg after:absolute after:top-0.5 after:left-0.5 after:size-3 after:rounded-full after:bg-muted after:transition-transform peer-checked:after:translate-x-3 peer-checked:after:bg-on-accent"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
    </label>
  );
}

export const inputClass =
  'h-9 w-full rounded-sm border border-line bg-surface-2 px-3 text-sm text-text placeholder:text-faint transition-colors hover:border-line-strong focus:border-accent-fg focus:outline-none aria-[invalid=true]:border-bad/70';

export const textareaClass =
  'w-full resize-y rounded-sm border border-line bg-surface-2 px-3 py-2.5 font-mono text-xs leading-relaxed text-text placeholder:text-faint transition-colors hover:border-line-strong focus:border-accent-fg focus:outline-none aria-[invalid=true]:border-bad/70';

/** A labelled control: small condensed label above. */
export function Field({
  label,
  children,
  className = '',
  hideLabel = false,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  hideLabel?: boolean;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the `children`.
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className={hideLabel ? 'sr-only' : 'eyebrow text-faint'}>{label}</span>
      {children}
    </label>
  );
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className}`} {...props} />;
}

export function Select({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${inputClass} cursor-pointer pr-8 ${className}`} {...props}>
      {children}
    </select>
  );
}

type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'rival';

const CHIP_TONES: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-muted',
  accent: 'bg-accent text-on-accent',
  good: 'bg-good/12 text-good',
  warn: 'bg-warn/14 text-warn',
  bad: 'bg-bad/12 text-bad',
  rival: 'bg-rival/14 text-rival',
};

/** Small condensed label (state, mode, MEGA…). */
export function Chip({
  tone = 'neutral',
  children,
  title,
  className = '',
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-xs px-1.5 font-display text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase ${CHIP_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Legal / N problems, the same everywhere. */
export function LegalityChip({ problems }: { problems: string[] }) {
  if (problems.length === 0) return <Chip tone="good">Legal</Chip>;
  return (
    <Chip tone="bad" title={problems.join('\n')}>
      {problems.length} problema{problems.length === 1 ? '' : 's'}
    </Chip>
  );
}

/** Inline message: errors, warnings and import notes. */
export function Notice({
  tone = 'bad',
  title,
  items,
  onClose,
  children,
  role = 'alert',
}: {
  tone?: 'bad' | 'warn';
  title?: ReactNode;
  items?: string[];
  onClose?: () => void;
  children?: ReactNode;
  role?: 'alert' | 'status';
}) {
  const colors = tone === 'bad' ? 'border-bad/50 text-bad' : 'border-warn/50 text-warn';
  return (
    <div
      role={role}
      className={`flex items-start gap-3 rounded-sm border-l-2 bg-surface px-3 py-2.5 text-sm ${colors}`}
    >
      <IconWarning size={16} className="mt-0.5" />
      <div className="min-w-0 flex-1 text-text">
        {title && <p className="font-semibold">{title}</p>}
        {children}
        {items && items.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
      {onClose && (
        <IconButton label="Cerrar aviso" onClick={onClose} className="-my-1 size-7">
          <IconClose size={14} />
        </IconButton>
      )}
    </div>
  );
}

/** Page title row: big condensed title on the left, controls on the right. */
export function PageHeader({
  title,
  kicker,
  children,
}: {
  title: ReactNode;
  kicker?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {kicker && <div className="eyebrow mb-2 text-faint">{kicker}</div>}
        <h1 className="display text-4xl sm:text-5xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Quiet loading line. */
export function Loading({ children = 'Cargando…' }: { children?: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted" role="status">
      <span className="size-1.5 animate-pulse bg-accent" aria-hidden="true" />
      {children}
    </p>
  );
}

/** Empty state of a list. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="text-muted">{children}</p>
      {action}
    </div>
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
