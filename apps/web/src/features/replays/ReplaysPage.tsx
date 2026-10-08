/** Saved replays (`/replays`): watch, rename, download or delete the battles you chose to keep. */
import type { ReplaySummary } from '@colleja/protocol';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { IconDownload, IconEdit, IconPlay, IconTrash } from '../../components/icons';
import { PokemonIcon } from '../../components/PokemonIcon';
import {
  Button,
  buttonClass,
  Empty,
  IconButton,
  Loading,
  Notice,
  PageHeader,
} from '../../components/ui';
import { api } from '../../lib/api';
import { downloadJson } from '../../lib/download';
import { botLevelName, useMeta } from '../../lib/use-meta';
import { RenameForm } from './RenameForm';

const OPPONENT_LABEL: Record<ReplaySummary['opponentKind'], string> = {
  random: 'rival aleatorio',
  team: 'rival pegado',
  saved: 'rival guardado',
};

export function ReplaysPage() {
  const meta = useMeta();
  const [replays, setReplays] = useState<ReplaySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setReplays((await api.listReplays()).replays);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <PageHeader
        title={
          <>
            Replays
            {replays && replays.length > 0 && (
              <span className="ml-3 text-faint">{replays.length}</span>
            )}
          </>
        }
      />
      {error && <Notice tone="warn" title={error} />}
      {replays === null && !error && <Loading />}
      {replays?.length === 0 && (
        <Empty>Aún no has guardado ningún replay. Se guardan al terminar un combate.</Empty>
      )}
      {replays && replays.length > 0 && (
        <ul
          className="overflow-hidden rounded-md border border-line bg-surface shadow-panel"
          aria-label="Replays guardados"
        >
          {replays.map((summary) => (
            <ReplayCard
              key={summary.id}
              summary={summary}
              levelName={botLevelName(meta, summary.botLevel)}
              onDownload={() =>
                run(async () => {
                  const { replay } = await api.getReplay(summary.id);
                  downloadJson(`replay-${summary.mode}-${replay.replay.seed}.json`, replay.replay);
                })
              }
              onRename={(name) => run(() => api.renameReplay(summary.id, name))}
              onDelete={() => run(() => api.deleteReplay(summary.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReplayCard({
  summary,
  levelName,
  onDownload,
  onRename,
  onDelete,
}: {
  summary: ReplaySummary;
  levelName: string;
  onDownload: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const result =
    summary.winner === 'p1'
      ? { label: 'Victoria', short: 'V', tone: 'bg-accent text-on-accent' }
      : summary.winner === 'p2'
        ? { label: 'Derrota', short: 'D', tone: 'bg-rival text-white' }
        : { label: 'Empate', short: 'E', tone: 'bg-surface-3 text-muted' };
  return (
    <li className="grid items-center gap-x-5 gap-y-3 border-b border-line px-4 py-3.5 transition-colors last:border-b-0 hover:bg-surface-2 md:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
      <span
        className={`display flex size-11 items-center justify-center text-2xl ${result.tone}`}
        title={result.label}
      >
        <span aria-hidden="true">{result.short}</span>
        <span className="sr-only">{result.label}</span>
      </span>
      <div className="min-w-0">
        {renaming ? (
          <RenameForm
            name={summary.name}
            onSave={async (name) => {
              await onRename(name);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <Link
            to={`/replays/${summary.id}`}
            className="display block truncate text-2xl hover:text-accent-fg"
          >
            {summary.name}
          </Link>
        )}
        <p className="eyebrow mt-1.5 text-faint">
          {summary.mode === 'singles' ? 'Individuales' : 'Dobles'} · {levelName} ·{' '}
          {OPPONENT_LABEL[summary.opponentKind]} · {summary.turns} turnos ·{' '}
          {new Date(summary.updatedAt).toLocaleString('es-ES', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </p>
      </div>
      <div className="flex items-center gap-2" aria-hidden="true">
        <span className="flex">
          {summary.species.p1.map((species, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: team order is the identity.
            <PokemonIcon key={index} species={species} size={34} />
          ))}
        </span>
        <span className="display text-sm text-faint italic">vs</span>
        <span className="flex">
          {summary.species.p2.map((species, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: team order is the identity.
            <PokemonIcon key={index} species={species} size={34} />
          ))}
        </span>
      </div>
      <div className="flex items-center gap-1 md:justify-end">
        {confirming ? (
          <>
            <span className="mr-1 text-sm">¿Borrar este replay?</span>
            <Button size="sm" variant="danger" onClick={onDelete}>
              Sí, borrar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              No
            </Button>
          </>
        ) : (
          <>
            <IconButton label="Renombrar" onClick={() => setRenaming(true)}>
              <IconEdit />
            </IconButton>
            <IconButton label="Descargar" onClick={onDownload}>
              <IconDownload />
            </IconButton>
            <IconButton label="Borrar" onClick={() => setConfirming(true)}>
              <IconTrash />
            </IconButton>
            <Link to={`/replays/${summary.id}`} className={`${buttonClass('primary', 'sm')} ml-2`}>
              <IconPlay size={12} />
              Ver
            </Link>
          </>
        )}
      </div>
    </li>
  );
}
