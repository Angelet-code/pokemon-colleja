/** Shared frame of the saved teams and saved opponents lists. */
import type { TeamSummary } from '@colleja/protocol';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { IconPlus, IconUpload } from '../../../components/icons';
import { Button, buttonClass, Empty, Loading, Notice, PageHeader } from '../../../components/ui';

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
  newPath: string;
  newLabel: string;
  /** Accessible name of the list. */
  listLabel: string;
  empty: string;
  list: SavedList<TeamSummary>;
  /** More buttons before "Importar". */
  actions?: ReactNode;
  renderImport: (close: () => void) => ReactNode;
  /** Other open dialogs of the page. */
  dialogs?: ReactNode;
  /** The rows. */
  children: ReactNode;
}) {
  const [importing, setImporting] = useState(false);
  const count = list.items?.length ?? 0;
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <PageHeader
        title={
          <>
            {title}
            {count > 0 && <span className="ml-3 text-faint">{count}</span>}
          </>
        }
      >
        {actions}
        <Button onClick={() => setImporting(true)}>
          <IconUpload size={14} />
          Importar
        </Button>
        <Link to={newPath} className={buttonClass('primary')}>
          <IconPlus size={14} />
          {newLabel}
        </Link>
      </PageHeader>

      {list.error && <Notice tone="warn" title={list.error} />}
      {list.items === null && !list.error && <Loading />}
      {list.items?.length === 0 && <Empty>{empty}</Empty>}

      {count > 0 && (
        <ul
          className="overflow-hidden rounded-md border border-line bg-surface shadow-panel"
          aria-label={listLabel}
        >
          {children}
        </ul>
      )}

      {importing && renderImport(() => setImporting(false))}
      {dialogs}
    </div>
  );
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
