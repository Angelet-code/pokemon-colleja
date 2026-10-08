/**
 * Battle screen, Showdown style: scoreboard on top, then the field with the controls below it
 * and the log on the right (a tab on small screens).
 */
import { isActionable, requestKind, type TeamPreviewRequest } from '@colleja/core';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Loading, Notice, Segmented } from '../../components/ui';
import { botLevelName, useMeta } from '../../lib/use-meta';
import { useSettings } from '../../stores/settings';
import { rememberedBattle, useBattle } from './battle-store';
import { ActionPanel } from './components/ActionPanel';
import { BattleLog } from './components/BattleLog';
import { BattleToolbar } from './components/BattleToolbar';
import { BotExplanation } from './components/BotExplanation';
import { EndPanel } from './components/EndPanel';
import { Field } from './components/Field';
import { TeamPreview } from './components/TeamPreview';

export function BattlePage() {
  const navigate = useNavigate();
  const battle = useBattle();
  const meta = useMeta();
  const namesLocale = useSettings((state) => state.namesLocale);
  const [tab, setTab] = useState<'field' | 'log'>('field');

  // Reloading the page: reattach to the battle this tab was playing.
  useEffect(() => {
    const { battleId, resume } = useBattle.getState();
    if (battleId) return;
    const remembered = rememberedBattle();
    if (remembered) resume(remembered);
    else navigate('/', { replace: true });
  }, [navigate]);

  useEffect(() => {
    useBattle.getState().setNamesLocale(namesLocale);
  }, [namesLocale]);

  const { info, status, request, ownSide, screen, busy, error, socketState } = battle;

  function leave() {
    battle.leave();
    navigate('/');
  }

  if (!info) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 pt-20 text-center">
        {error ? (
          <>
            <p className="display text-3xl">{error.message}</p>
            <Link to="/" className="text-sm text-accent-fg hover:underline">
              Volver al inicio
            </Link>
          </>
        ) : (
          <Loading>Conectando con el combate…</Loading>
        )}
      </div>
    );
  }

  const ended = status?.ended === true;
  // During the team preview the field is empty: the preview shows both teams instead.
  const previewing = request !== null && requestKind(request) === 'team' && !ended;
  let controls: ReactNode = null;
  if (ended && status) {
    controls = (
      <EndPanel
        status={status}
        seed={info.seed}
        rivalName={info.players.p2}
        busy={busy}
        onRematch={() => void battle.rematch()}
        onExport={battle.exportReplay}
        onSave={battle.saveReplay}
        savedReplayId={battle.savedReplayId}
        onNew={leave}
      />
    );
  } else if (request && isActionable(request) && !busy) {
    controls =
      requestKind(request) === 'team' ? (
        <TeamPreview
          request={request as TeamPreviewRequest}
          team={info.team}
          rivalSpecies={screen.view.sides.p2.preview}
          rivalTeam={info.opponentTeam}
          mode={info.mode}
          onChoose={battle.choose}
          disabled={busy}
        />
      ) : (
        <ActionPanel
          request={request as Exclude<typeof request, TeamPreviewRequest>}
          view={screen.view}
          onChoose={battle.choose}
          disabled={busy}
        />
      );
  } else {
    controls = (
      <div className="flex h-[60px] items-center rounded-md border border-dashed border-line-strong px-4">
        <Loading>{busy ? 'Resolviendo el turno…' : 'Esperando al rival…'}</Loading>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <BattleToolbar
        players={info.players}
        mode={info.mode}
        level={botLevelName(meta, info.botLevel)}
        status={status}
        busy={busy}
        onUndo={battle.undo}
        onRewind={battle.rewind}
        onForfeit={battle.forfeit}
        onExport={battle.exportReplay}
        onLeave={leave}
      />

      {socketState === 'reconnecting' && (
        <Notice tone="warn" role="status" title="Conexión perdida. Reconectando…" />
      )}
      {error && <Notice title={error.message} items={error.details} onClose={battle.clearError} />}

      <div className="lg:hidden">
        <Segmented
          label="Vista"
          size="sm"
          stretch
          value={tab}
          onChange={setTab}
          options={[
            { value: 'field', label: 'Combate' },
            { value: 'log', label: 'Registro' },
          ]}
        />
      </div>

      <div className="grid gap-3 lg:h-[calc(100vh-11.5rem)] lg:min-h-[640px] lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <div
          className={`scroll-thin flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1 [&>*]:shrink-0 ${tab === 'log' ? 'hidden lg:flex' : ''}`}
        >
          {!previewing && <Field view={screen.view} own={ownSide?.pokemon ?? []} />}
          {controls}
          <BotExplanation explanations={battle.explanations} />
        </div>
        <div className={`min-h-[60vh] lg:min-h-0 ${tab === 'field' ? 'hidden lg:block' : ''}`}>
          <BattleLog entries={screen.entries} />
        </div>
      </div>
    </div>
  );
}
