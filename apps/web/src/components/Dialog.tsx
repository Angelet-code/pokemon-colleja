/** Modal dialog: closes with Esc or the backdrop, keeps the focus inside while open. */
import { type ReactNode, useEffect, useId, useRef } from 'react';

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
        className="absolute inset-0 cursor-default bg-black/50"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[90vh] w-full flex-col rounded-xl border border-border bg-panel shadow-2xl ${
          wide ? 'max-w-2xl' : 'max-w-md'
        }`}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id={titleId} className="font-semibold">
            {title}
          </h2>
          <button
            type="button"
            data-dialog-close
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="rounded p-1 text-muted hover:bg-panel-2 hover:text-text"
          >
            ✕
          </button>
        </header>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
