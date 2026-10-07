/**
 * Battle screen, Showdown style: field on top, controls below, log on the right (a tab on
 * small screens).
 */
import { isActionable, requestKind, type TeamPreviewRequest } from '@colleja/core';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Panel, Segmented } from '../../components/ui';
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
      <div className="mx-auto max-w-md pt-16 text-center">
        {error ? (
          <Panel>
            <div className="flex flex-col items-center gap-3 p-6">
              <p className="font-semibold">{error.message}</p>
              <Link to="/" className="text-sm text-accent underline">
                Volver al inicio
              </Link>
            </div>
          </Panel>
        ) : (
          <p className="text-muted">Conectando con el combate…</p>
        )}
      </div>
    );
  }

  const ended = status?.ended === true;
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
      <Panel>
        <p className="flex items-center gap-2 p-4 text-sm text-muted">
          <span className="size-2 animate-pulse rounded-full bg-accent" />
          {busy ? 'Resolviendo el turno…' : 'Esperando al rival…'}
        </p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">
          {info.mode === 'singles' ? 'Individuales' : 'Dobles'}
          <span className="ml-2 text-sm font-normal text-muted">
            {info.players.p1} contra {info.players.p2}
          </span>
        </h1>
        <div className="lg:hidden">
          <Segmented
            label="Vista"
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'field', label: 'Combate' },
              { value: 'log', label: 'Registro' },
            ]}
          />
        </div>
      </div>

      {socketState === 'reconnecting' && (
        <p role="status" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          Se ha perdido la conexión con el servidor. Reconectando…
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm"
        >
          <div>
            <p className="font-semibold text-bad">{error.message}</p>
            {error.details?.map((detail) => (
              <p key={detail} className="text-xs text-bad">
                {detail}
              </p>
            ))}
          </div>
          <Button variant="ghost" onClick={battle.clearError} aria-label="Cerrar aviso">
            ✕
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:h-[calc(100vh-9.5rem)] lg:grid-cols-[minmax(0,1fr)_380px]">
        <div
          className={`flex min-h-0 flex-col gap-3 lg:overflow-y-auto [&>*]:shrink-0 ${tab === 'log' ? 'hidden lg:flex' : ''}`}
        >
          <BattleToolbar
            status={status}
            busy={busy}
            onUndo={battle.undo}
            onRewind={battle.rewind}
            onForfeit={battle.forfeit}
            onExport={battle.exportReplay}
            onLeave={leave}
          />
          <Field view={screen.view} own={ownSide?.pokemon ?? []} />
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
