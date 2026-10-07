/** Card of a saved team or opponent in its list: icons, mode, state and actions. */
import type { GameMode } from '@colleja/data';
import type { TeamSummary } from '@colleja/protocol';
import { useState } from 'react';
import { Link } from 'react-router';
import { PokemonIcon } from '../../../components/PokemonIcon';
import { Button } from '../../../components/ui';

const MODE_LABEL: Record<GameMode, string> = { singles: 'Individuales', doubles: 'Dobles' };

export function SavedCard({
  summary,
  editPath,
  useLabel,
  detail,
  onUse,
  onDuplicate,
  onDelete,
}: {
  summary: TeamSummary;
  editPath: string;
  /** Main action ("Usar en combate", "Usar como rival"): only for legal teams. */
  useLabel: string;
  /** Extra text after the mode (e.g. the difficulty of an opponent). */
  detail?: string;
  onUse: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const problems = summary.problems.length;
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={editPath} className="block truncate font-semibold hover:text-accent">
            {summary.name}
          </Link>
          <p className="text-xs text-muted">
            {[MODE_LABEL[summary.mode], detail, formatDate(summary.updatedAt)]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {summary.valid ? (
          <span className="shrink-0 rounded-full bg-good/15 px-2 py-0.5 text-xs font-medium text-good">
            Legal
          </span>
        ) : (
          <span
            className="shrink-0 rounded-full bg-bad/15 px-2 py-0.5 text-xs font-medium text-bad"
            title={summary.problems.join('\n')}
          >
            {problems} problema{problems === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="flex min-h-10 flex-wrap gap-0.5">
        {summary.species.map((species, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: members have no id; the order is the identity.
          <PokemonIcon key={index} species={species} size={40} />
        ))}
        {summary.species.length === 0 && <span className="text-xs text-faint">Vacío</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {confirming ? (
          <>
            <span className="self-center text-sm">¿Borrar «{summary.name}»?</span>
            <Button variant="danger" onClick={onDelete}>
              Sí, borrar
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              No
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={onUse} disabled={!summary.valid}>
              {useLabel}
            </Button>
            <Link
              to={editPath}
              className="inline-flex items-center rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm font-medium hover:bg-panel-3"
            >
              Editar
            </Link>
            <Button variant="ghost" onClick={onDuplicate}>
              Duplicar
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

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
}
