/** End of the battle: result, seed, replay (save or download) and rematch. */
import type { BattleStatus } from '@colleja/protocol';
import { Link } from 'react-router';
import { IconCheck, IconDownload } from '../../../components/icons';
import { Button, buttonClass } from '../../../components/ui';

export function EndPanel({
  status,
  seed,
  rivalName,
  busy,
  onRematch,
  onExport,
  onSave,
  savedReplayId,
  onNew,
}: {
  status: BattleStatus;
  seed: string;
  rivalName: string;
  busy: boolean;
  onRematch: () => void;
  onExport: () => void;
  onSave: () => void;
  /** Set once this ending is saved in the replay list. */
  savedReplayId: string | null;
  onNew: () => void;
}) {
  const result =
    status.winner === 'p1'
      ? { title: 'Victoria', tone: 'text-accent-fg' }
      : status.winner === 'p2'
        ? { title: 'Derrota', tone: 'text-rival' }
        : { title: 'Empate', tone: 'text-text' };
  return (
    <section className="rise rounded-md border border-line bg-surface shadow-panel">
      <div className="flex flex-wrap items-end justify-between gap-6 p-6">
        <div>
          <p className={`display text-7xl ${result.tone}`}>{result.title}</p>
          <p className="eyebrow mt-3 text-faint">
            {status.winner === 'p2' ? `Contra ${rivalName} · ` : ''}
            {status.turn} {status.turn === 1 ? 'turno' : 'turnos'} · semilla{' '}
            <code className="font-mono tracking-normal normal-case">{seed}</code>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={onRematch} disabled={busy}>
            Revancha
          </Button>
          {savedReplayId ? (
            <Link
              to={`/replays/${savedReplayId}`}
              className={`${buttonClass('secondary')} text-good`}
            >
              <IconCheck size={14} />
              Ver replay
            </Link>
          ) : (
            <Button onClick={onSave} disabled={busy}>
              Guardar replay
            </Button>
          )}
          <Button variant="ghost" onClick={onExport} disabled={busy}>
            <IconDownload size={14} />
            Descargar
          </Button>
          <Button variant="ghost" onClick={onNew}>
            Cambiar equipos
          </Button>
        </div>
      </div>
    </section>
  );
}
