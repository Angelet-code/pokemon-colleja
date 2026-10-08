/** Modal dialog: closes with Esc or the backdrop, keeps the focus inside while open. */
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { IconClose } from './icons';

export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // Latest `onClose` without re-running the focus effect on every render.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(
      'textarea, input, select, button:not([data-dialog-close])',
    );
    (first ?? panel.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar ventana"
        data-dialog-close
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-[var(--scrim)] backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`rise relative flex max-h-[90vh] w-full flex-col rounded-md border border-line-strong bg-surface shadow-2xl ${
          wide ? 'max-w-2xl' : 'max-w-md'
        }`}
      >
        <header className="flex items-center justify-between gap-4 border-b border-line py-2.5 pr-2.5 pl-5">
          <h2 id={titleId} className="display text-xl">
            {title}
          </h2>
          <button
            type="button"
            data-dialog-close
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="inline-flex size-8 items-center justify-center rounded-sm text-muted hover:bg-surface-3 hover:text-text"
          >
            <IconClose />
          </button>
        </header>
        <div className="scroll-thin overflow-y-auto p-5">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
