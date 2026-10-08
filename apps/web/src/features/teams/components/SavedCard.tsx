/** Row of a saved team or opponent in its list: name, mode, state, icons and actions. */
import type { GameMode } from '@colleja/data';
import type { TeamSummary } from '@colleja/protocol';
import { useState } from 'react';
import { Link } from 'react-router';
import { IconCopy, IconEdit, IconTrash } from '../../../components/icons';
import { PokemonIcon } from '../../../components/PokemonIcon';
import { Button, buttonClass, IconButton, LegalityChip } from '../../../components/ui';

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
  return (
    <li className="group grid items-center gap-x-5 gap-y-3 border-b border-line px-4 py-3.5 transition-colors last:border-b-0 hover:bg-surface-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <Link to={editPath} className="display truncate text-2xl hover:text-accent-fg">
            {summary.name}
          </Link>
          <LegalityChip problems={summary.problems} />
        </div>
        <p className="eyebrow mt-1.5 text-faint">
          {[MODE_LABEL[summary.mode], detail, formatDate(summary.updatedAt)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className="flex min-h-10 gap-0.5" aria-hidden="true">
        {summary.species.map((species, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: members have no id; the order is the identity.
          <PokemonIcon key={index} species={species} size={40} />
        ))}
        {summary.species.length === 0 && (
          <span className="eyebrow self-center text-faint">Vacío</span>
        )}
      </div>
      <div className="flex items-center gap-1 md:justify-end">
        {confirming ? (
          <>
            <span className="mr-1 text-sm">¿Borrar «{summary.name}»?</span>
            <Button size="sm" variant="danger" onClick={onDelete}>
              Sí, borrar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              No
            </Button>
          </>
        ) : (
          <>
            <Link to={editPath} className={buttonClass('ghost', 'sm')}>
              <IconEdit size={14} />
              Editar
            </Link>
            <IconButton label="Duplicar" onClick={onDuplicate}>
              <IconCopy />
            </IconButton>
            <IconButton label="Borrar" onClick={() => setConfirming(true)}>
              <IconTrash />
            </IconButton>
            <Button
              size="sm"
              variant="primary"
              className="ml-2"
              onClick={onUse}
              disabled={!summary.valid}
            >
              {useLabel}
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
