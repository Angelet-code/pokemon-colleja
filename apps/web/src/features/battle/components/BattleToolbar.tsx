/** Scoreboard of the battle: who plays, the turn, and undo, rewind, forfeit, replay and exit. */
import type { BattleStatus } from '@colleja/protocol';
import { useState } from 'react';
import { IconDownload, IconExit, IconFlag, IconRewind, IconUndo } from '../../../components/icons';
import { Button, Chip, IconButton } from '../../../components/ui';

export function BattleToolbar({
  players,
  mode,
  level,
  status,
  busy,
  onUndo,
  onRewind,
  onForfeit,
  onExport,
  onLeave,
}: {
  players: { p1: string; p2: string };
  mode: 'singles' | 'doubles';
  /** Name of the bot's difficulty. */
  level: string;
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
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-md border border-line bg-surface px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="display truncate text-xl text-accent-fg">{players.p1}</span>
        <span className="display text-sm text-faint italic">vs</span>
        <span className="display truncate text-xl text-rival">{players.p2}</span>
        <Chip className="max-sm:hidden">
          {mode === 'singles' ? 'Individuales' : 'Dobles'} · {level}
        </Chip>
      </div>
      <div className="flex items-baseline gap-2 sm:mx-auto" aria-live="polite">
        {status === null ? (
          <span className="eyebrow text-faint">Conectando…</span>
        ) : status.turn === 0 ? (
          <span className="display text-2xl">Vista previa</span>
        ) : (
          <>
            <span className="eyebrow text-faint">Turno</span>
            <span className="display text-[32px] tabular-nums">
              {String(status.turn).padStart(2, '0')}
            </span>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          onClick={onUndo}
          disabled={busy || status?.undoTarget === null || status === null}
          title="Vuelve al inicio del turno anterior"
        >
          <IconUndo size={14} />
          Deshacer
        </Button>
        <label className="relative">
          <span className="sr-only">Rebobinar al turno</span>
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted">
            <IconRewind size={14} />
          </span>
          <select
            value=""
            disabled={busy || turns.length === 0}
            onChange={(event) => {
              if (event.target.value !== '') onRewind(Number(event.target.value));
            }}
            className="h-7 cursor-pointer appearance-none rounded-sm border border-line-strong bg-surface-2 pr-2.5 pl-7 font-display text-[13px] font-semibold tracking-[0.06em] text-text uppercase hover:border-text/60 disabled:pointer-events-none disabled:opacity-35"
          >
            <option value="">Rebobinar</option>
            {turns.map((turn) => (
              <option key={turn} value={turn}>
                {turn === 0 ? 'Vista previa' : `Turno ${turn}`}
              </option>
            ))}
          </select>
        </label>
        {status?.ended ? (
          <Button size="sm" onClick={onExport} disabled={busy}>
            <IconDownload size={14} />
            Replay
          </Button>
        ) : confirming ? (
          <span className="flex items-center gap-1">
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setConfirming(false);
                onForfeit();
              }}
            >
              Sí, rendirse
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              No
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-bad hover:text-bad"
            onClick={() => setConfirming(true)}
            disabled={busy || status === null}
          >
            <IconFlag size={14} />
            Rendirse
          </Button>
        )}
        <IconButton label="Salir" onClick={onLeave}>
          <IconExit />
        </IconButton>
      </div>
    </div>
  );
}
