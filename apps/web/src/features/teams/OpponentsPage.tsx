/**
 * Saved opponents (`/rivales`): teams for the bot with their difficulty. A new opponent can be
 * generated at random, copied from one of your teams, imported or built from scratch; the
 * generated and copied ones open in the editor as unsaved drafts (they must be saved to play).
 */
import type { GameMode } from '@colleja/data';
import type { BotLevelValue, OpponentSummary, TeamSummary } from '@colleja/protocol';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Dialog } from '../../components/Dialog';
import { IconCopy, IconDice } from '../../components/icons';
import { PokemonIcon } from '../../components/PokemonIcon';
import { Button, Loading, Notice } from '../../components/ui';
import { api } from '../../lib/api';
import { botLevelName, useMeta } from '../../lib/use-meta';
import { useSetup } from '../setup/setup-store';
import { BotLevelSelect } from './components/BotLevelSelect';
import { ImportSavedDialog } from './components/ImportSavedDialog';
import { SavedCard } from './components/SavedCard';
import { messageOf, SavedListLayout, useSavedList } from './components/SavedList';
import type { EditorLocationState } from './TeamEditorPage';
import {
  copyName,
  DEFAULT_OPPONENT_LEVEL,
  DEFAULT_OPPONENT_NAME,
  newOpponentDraft,
  replaceMembers,
} from './team-draft';

const NEW_OPPONENT = '/rivales/nuevo';

export function OpponentsPage() {
  const navigate = useNavigate();
  const meta = useMeta();
  const list = useSavedList(async () => (await api.listOpponents()).opponents);
  const [generating, setGenerating] = useState<GameMode | null>(null);
  const [copying, setCopying] = useState(false);

  /** Opens the editor with a team as an unsaved draft. */
  function openDraft(state: EditorLocationState) {
    navigate(NEW_OPPONENT, { state });
  }

  async function generate(mode: GameMode) {
    setGenerating(mode);
    try {
      const { team } = await api.randomTeam(mode);
      openDraft({ initial: replaceMembers(newOpponentDraft(mode, 'Rival aleatorio'), team) });
    } catch (cause) {
      list.setError(messageOf(cause));
    } finally {
      setGenerating(null);
    }
  }

  const duplicate = (summary: OpponentSummary) =>
    list.run(async () => {
      const { opponent } = await api.getOpponent(summary.id);
      const { id: _id, ...content } = opponent;
      await api.createOpponent({ ...content, name: copyName(content.name) });
    });

  function pickAsRival(summary: OpponentSummary) {
    useSetup.getState().update({
      opponentKind: 'saved',
      opponentId: summary.id,
      botLevel: summary.botLevel,
      mode: summary.mode,
    });
    navigate('/');
  }

  return (
    <SavedListLayout
      title="Rivales"
      newPath={NEW_OPPONENT}
      newLabel="Nuevo rival"
      listLabel="Rivales guardados"
      empty="Aún no tienes rivales guardados."
      list={list}
      actions={
        <>
          <span className="flex h-9 items-center rounded-sm border border-line-strong pl-3">
            <span className="eyebrow mr-1 flex items-center gap-1.5 text-faint">
              <IconDice size={14} />
              Aleatorio
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => generate('singles')}
              disabled={generating !== null}
              aria-label="Generar aleatorio para individuales"
            >
              {generating === 'singles' ? '…' : 'Individuales'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => generate('doubles')}
              disabled={generating !== null}
              aria-label="Generar aleatorio para dobles"
            >
              {generating === 'doubles' ? '…' : 'Dobles'}
            </Button>
          </span>
          <Button onClick={() => setCopying(true)}>
            <IconCopy size={14} />
            De mis equipos
          </Button>
        </>
      }
      renderImport={(close) => <ImportOpponentDialog onClose={close} />}
      dialogs={
        copying && (
          <CopyTeamDialog
            onClose={() => setCopying(false)}
            onPick={async (summary) => {
              const { team } = await api.getTeam(summary.id);
              const { id: _id, notes: _notes, ...content } = team;
              openDraft({
                initial: {
                  ...content,
                  name: copyName(content.name, '(rival)'),
                  botLevel: DEFAULT_OPPONENT_LEVEL,
                },
              });
            }}
          />
        )
      }
    >
      {list.items?.map((summary) => (
        <SavedCard
          key={summary.id}
          summary={summary}
          editPath={`/rivales/${summary.id}`}
          useLabel="Usar como rival"
          detail={botLevelName(meta, summary.botLevel)}
          onUse={() => pickAsRival(summary)}
          onDuplicate={() => duplicate(summary)}
          onDelete={() => list.run(() => api.deleteOpponent(summary.id))}
        />
      ))}
    </SavedListLayout>
  );
}

function ImportOpponentDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [botLevel, setBotLevel] = useState<BotLevelValue>(DEFAULT_OPPONENT_LEVEL);
  return (
    <ImportSavedDialog
      title="Importar rival"
      defaultName={DEFAULT_OPPONENT_NAME}
      onClose={onClose}
      onImport={async (request) => {
        const { opponent, adjustments } = await api.importOpponent({ ...request, botLevel });
        const state: EditorLocationState = { importNotes: adjustments };
        navigate(`/rivales/${opponent.id}`, { state });
      }}
    >
      <BotLevelSelect value={botLevel} onChange={setBotLevel} />
    </ImportSavedDialog>
  );
}

/** Picks one of your saved teams to copy as a new opponent. */
function CopyTeamDialog({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (team: TeamSummary) => Promise<void>;
}) {
  const [teams, setTeams] = useState<TeamSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTeams()
      .then(({ teams }) => setTeams(teams))
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, []);

  async function pick(team: TeamSummary) {
    try {
      await onPick(team);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  return (
    <Dialog title="Copiar como rival" onClose={onClose}>
      <div className="flex flex-col gap-1">
        {error && <Notice title={error} />}
        {teams === null && !error && <Loading />}
        {teams?.length === 0 && (
          <p className="text-sm text-muted">Aún no tienes equipos guardados.</p>
        )}
        {teams?.map((team) => (
          <button
            key={team.id}
            type="button"
            onClick={() => pick(team)}
            className="flex items-center gap-3 rounded-sm px-3 py-2 text-left transition-colors hover:bg-surface-3"
          >
            <span className="min-w-0 flex-1 truncate font-semibold">{team.name}</span>
            <span className="flex flex-wrap justify-end gap-0.5" aria-hidden="true">
              {team.species.map((species, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: members have no id; the order is the identity.
                <PokemonIcon key={index} species={species} size={32} />
              ))}
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
