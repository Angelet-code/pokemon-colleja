/** Shared frame of the saved teams and saved opponents lists. */
import type { TeamSummary } from '@colleja/protocol';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../../components/ui';

export interface SavedList<T extends TeamSummary> {
  /** `null` while loading. */
  items: T[] | null;
  error: string | null;
  setError: (error: string | null) => void;
  /** Runs an action (delete, duplicate…) and reloads the list; errors are shown. */
  run: (action: () => Promise<unknown>) => Promise<void>;
}

export function useSavedList<T extends TeamSummary>(load: () => Promise<T[]>): SavedList<T> {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `load` is a new closure on every render: keep the first one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the loader never changes.
  const refresh = useCallback(async () => {
    try {
      setItems(await load());
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        await refresh();
      } catch (cause) {
        setError(messageOf(cause));
      }
    },
    [refresh],
  );

  return { items, error, setError, run };
}

export function SavedListLayout({
  title,
  intro,
  newPath,
  newLabel,
  listLabel,
  empty,
  list,
  actions,
  renderImport,
  dialogs,
  children,
}: {
  title: string;
  intro: ReactNode;
  newPath: string;
  newLabel: string;
  /** Accessible name of the list. */
  listLabel: string;
  empty: string;
  list: SavedList<TeamSummary>;
  /** More buttons next to "Importar". */
  actions?: ReactNode;
  renderImport: (close: () => void) => ReactNode;
  /** Other open dialogs of the page. */
  dialogs?: ReactNode;
  /** The cards. */
  children: ReactNode;
}) {
  const [importing, setImporting] = useState(false);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted">{intro}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions}
          <Button onClick={() => setImporting(true)}>Importar</Button>
          <Link
            to={newPath}
            className="inline-flex items-center rounded-lg border border-transparent bg-accent px-3 py-2 text-sm font-medium text-accent-text hover:brightness-110"
          >
            {newLabel}
          </Link>
        </div>
      </div>

      {list.error && (
        <p role="alert" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          {list.error}
        </p>
      )}
      {list.items === null && !list.error && <p className="text-muted">Cargando…</p>}
      {list.items?.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted">
          {empty}
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={listLabel}>
        {children}
      </ul>

      {importing && renderImport(() => setImporting(false))}
      {dialogs}
    </div>
  );
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
