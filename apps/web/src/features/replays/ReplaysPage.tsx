/** Saved replays (`/replays`): watch, download or delete the battles you chose to keep. */
import type { ReplaySummary } from '@colleja/protocol';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { PokemonIcon } from '../../components/PokemonIcon';
import { Button } from '../../components/ui';
import { api } from '../../lib/api';
import { downloadJson } from '../../lib/download';
import { botLevelName, useMeta } from '../../lib/use-meta';

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
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mis replays</h1>
        <p className="text-sm text-muted">
          Los combates que guardaste al terminar ("Guardar replay"). Revívelos turno a turno con los
          equipos completos y lo que valoró el bot en cada turno.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {replays === null && !error && <p className="text-muted">Cargando…</p>}
      {replays?.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted">
          Aún no has guardado ningún replay. Al terminar un combate, pulsa "Guardar replay".
        </p>
      )}
      <ul className="grid gap-3 md:grid-cols-2" aria-label="Replays guardados">
        {replays?.map((summary) => (
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
            onDelete={() => run(() => api.deleteReplay(summary.id))}
          />
        ))}
      </ul>
    </div>
  );
}

function ReplayCard({
  summary,
  levelName,
  onDownload,
  onDelete,
}: {
  summary: ReplaySummary;
  levelName: string;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const result =
    summary.winner === 'p1' ? 'Victoria' : summary.winner === 'p2' ? 'Derrota' : 'Empate';
  const tone =
    summary.winner === 'p1'
      ? 'text-good bg-good/15'
      : summary.winner === 'p2'
        ? 'text-bad bg-bad/15'
        : 'bg-panel-2';
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/replays/${summary.id}`}
            className="block truncate font-semibold hover:text-accent"
          >
            {summary.name}
          </Link>
          <p className="text-xs text-muted">
            {summary.mode === 'singles' ? 'Individuales' : 'Dobles'} · {levelName} ·{' '}
            {OPPONENT_LABEL[summary.opponentKind]} · {summary.turns} turnos ·{' '}
            {new Date(summary.updatedAt).toLocaleString('es-ES', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
          {result}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex gap-0.5">
          {summary.species.p1.map((species, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: team order is the identity.
            <PokemonIcon key={index} species={species} size={32} />
          ))}
        </span>
        <span className="text-xs text-muted">contra</span>
        <span className="flex gap-0.5">
          {summary.species.p2.map((species, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: team order is the identity.
            <PokemonIcon key={index} species={species} size={32} />
          ))}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {confirming ? (
          <>
            <span className="self-center text-sm">¿Borrar este replay?</span>
            <Button variant="danger" onClick={onDelete}>
              Sí, borrar
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              No
            </Button>
          </>
        ) : (
          <>
            <Link
              to={`/replays/${summary.id}`}
              className="inline-flex items-center rounded-lg border border-transparent bg-accent px-3 py-2 text-sm font-medium text-accent-text hover:brightness-110"
            >
              Ver
            </Link>
            <Button variant="ghost" onClick={onDownload}>
              Descargar
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Borrar
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
