/**
 * Scoreboard of the battle: who plays, the turn, and undo, rewind, calculator, forfeit, replay
 * and exit.
 */
import type { BattleStatus } from '@colleja/protocol';
import { type ReactNode, useState } from 'react';
import { IconDownload, IconExit, IconFlag, IconRewind, IconUndo } from '../../../components/icons';
import { ActionSelect, Button, Chip, IconButton } from '../../../components/ui';

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
  calc,
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
  /** The "Calcular" control. */
  calc?: ReactNode;
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
        <ActionSelect
          label="Rebobinar"
          icon={<IconRewind size={14} />}
          disabled={busy || turns.length === 0}
          options={turns.map((turn) => ({
            value: String(turn),
            label: turn === 0 ? 'Vista previa' : `Turno ${turn}`,
          }))}
          onPick={(turn) => onRewind(Number(turn))}
        />
        {calc}
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
