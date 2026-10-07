/** End of the battle: result, seed, replay (save or download) and rematch. */
import type { BattleStatus } from '@colleja/protocol';
import { Link } from 'react-router';
import { Button, Panel } from '../../../components/ui';

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
      ? { title: '¡Has ganado!', tone: 'text-good' }
      : status.winner === 'p2'
        ? { title: `Has perdido contra ${rivalName}`, tone: 'text-bad' }
        : { title: 'Empate', tone: 'text-text' };
  return (
    <Panel>
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <p className={`text-2xl font-bold ${result.tone}`}>{result.title}</p>
        <p className="text-sm text-muted">
          {status.turn} {status.turn === 1 ? 'turno' : 'turnos'} · semilla{' '}
          <code className="font-mono">{seed}</code>
        </p>
        <p className="text-xs text-muted">
          Puedes rebobinar a cualquier turno para probar otra jugada.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={onRematch} disabled={busy}>
            Revancha
          </Button>
          {savedReplayId ? (
            <Link
              to={`/replays/${savedReplayId}`}
              className="inline-flex items-center rounded-lg border border-good/40 bg-good/10 px-3 py-2 text-sm font-medium text-good hover:brightness-110"
            >
              ✓ Guardado · Ver replay
            </Link>
          ) : (
            <Button onClick={onSave} disabled={busy}>
              Guardar replay
            </Button>
          )}
          <Button variant="ghost" onClick={onExport} disabled={busy}>
            Descargar
          </Button>
          <Button variant="ghost" onClick={onNew}>
            Cambiar equipos
          </Button>
        </div>
      </div>
    </Panel>
  );
}
