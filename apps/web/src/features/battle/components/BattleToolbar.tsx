/** Turn, undo, rewind to a turn, forfeit and replay. */
import type { BattleStatus } from '@colleja/protocol';
import { useState } from 'react';
import { Button } from '../../../components/ui';

export function BattleToolbar({
  status,
  busy,
  onUndo,
  onRewind,
  onForfeit,
  onExport,
  onLeave,
}: {
  status: BattleStatus | null;
  busy: boolean;
  onUndo: () => void;
  onRewind: (turn: number) => void;
  onForfeit: () => void;
  onExport: () => void;
  onLeave: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const turns = status?.rewindableTurns ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-auto text-sm font-semibold">
        {status === null
          ? 'Conectando…'
          : status.turn === 0
            ? 'Vista previa'
            : `Turno ${status.turn}`}
      </span>
      <Button
        onClick={onUndo}
        disabled={busy || status?.undoTarget === null || status === null}
        title="Vuelve al inicio del turno anterior"
      >
        ↶ Deshacer
      </Button>
      <label className="flex items-center gap-1.5 text-sm">
        <span className="sr-only">Rebobinar al turno</span>
        <select
          value=""
          disabled={busy || turns.length === 0}
          onChange={(event) => {
            if (event.target.value !== '') onRewind(Number(event.target.value));
          }}
          className="rounded-lg border border-border bg-panel-2 px-2 py-2 text-sm disabled:opacity-40"
        >
          <option value="">⏪ Rebobinar a…</option>
          {turns.map((turn) => (
            <option key={turn} value={turn}>
              {turn === 0 ? 'Vista previa' : `Turno ${turn}`}
            </option>
          ))}
        </select>
      </label>
      {status?.ended ? (
        <Button onClick={onExport} disabled={busy}>
          ⬇ Replay
        </Button>
      ) : confirming ? (
        <span className="flex items-center gap-1">
          <Button
            variant="danger"
            onClick={() => {
              setConfirming(false);
              onForfeit();
            }}
          >
            Sí, rendirse
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            No
          </Button>
        </span>
      ) : (
        <Button
          variant="danger"
          onClick={() => setConfirming(true)}
          disabled={busy || status === null}
        >
          Rendirse
        </Button>
      )}
      <Button variant="ghost" onClick={onLeave}>
        Salir
      </Button>
    </div>
  );
}
