/** Picks a Pokémon from one of your saved teams or opponents for the calculator. */
import type { PokemonSet } from '@colleja/core';
import { getName } from '@colleja/data';
import type { TeamSummary } from '@colleja/protocol';
import { useEffect, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { IconArrowLeft } from '../../components/icons';
import { PokemonIcon } from '../../components/PokemonIcon';
import { Loading, Notice } from '../../components/ui';
import { api } from '../../lib/api';
import { useSettings } from '../../stores/settings';

interface Source {
  kind: 'team' | 'opponent';
  summary: TeamSummary;
}

export function LoadSetDialog({
  title,
  onClose,
  onPick,
}: {
  title: string;
  onClose: () => void;
  onPick: (set: PokemonSet) => void;
}) {
  const locale = useSettings((state) => state.namesLocale);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [open, setOpen] = useState<{ source: Source; members: PokemonSet[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listTeams(), api.listOpponents()])
      .then(([{ teams }, { opponents }]) =>
        setSources([
          ...teams.map((summary): Source => ({ kind: 'team', summary })),
          ...opponents.map((summary): Source => ({ kind: 'opponent', summary })),
        ]),
      )
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  async function expand(source: Source) {
    try {
      const members =
        source.kind === 'team'
          ? (await api.getTeam(source.summary.id)).team.members
          : (await api.getOpponent(source.summary.id)).opponent.members;
      setOpen({ source, members });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <div className="flex flex-col gap-0.5">
        {error && <Notice title={error} />}
        {sources === null && !error && <Loading />}
        {sources?.length === 0 && (
          <p className="text-sm text-muted">No tienes equipos ni rivales guardados.</p>
        )}
        {open ? (
          <>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="eyebrow mb-1 flex items-center gap-1.5 self-start text-faint hover:text-text"
            >
              <IconArrowLeft size={13} />
              {open.source.summary.name}
            </button>
            {open.members.map((set, index) => (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: team order is the identity.
                key={index}
                type="button"
                onClick={() => onPick(set)}
                className="flex items-center gap-3 rounded-sm px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-3"
              >
                <PokemonIcon species={set.species} size={32} />
                <span className="font-semibold">{getName('species', set.species, locale)}</span>
                {set.item && (
                  <span className="text-faint">{getName('items', set.item, locale)}</span>
                )}
              </button>
            ))}
          </>
        ) : (
          sources?.map((source) => (
            <button
              key={`${source.kind}-${source.summary.id}`}
              type="button"
              onClick={() => expand(source)}
              className="flex items-center gap-3 rounded-sm px-3 py-2 text-left transition-colors hover:bg-surface-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{source.summary.name}</span>
                <span
                  className={`eyebrow ${source.kind === 'team' ? 'text-accent-fg' : 'text-rival'}`}
                >
                  {source.kind === 'team' ? 'Equipo' : 'Rival'}
                </span>
              </span>
              <span className="flex gap-0.5" aria-hidden="true">
                {source.summary.species.map((species, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: team order is the identity.
                  <PokemonIcon key={index} species={species} size={28} />
                ))}
              </span>
            </button>
          ))
        )}
      </div>
    </Dialog>
  );
}
