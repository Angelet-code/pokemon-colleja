/**
 * Replay viewer (`/replays/:id`): the battle turn by turn, with the field, the log up to that
 * point and the bot's reasons. It shows everything by default (the battle is over) and can
 * switch to what you saw while playing.
 */
import { formatShowdownTeam } from '@colleja/core';
import type { SavedReplay } from '@colleja/protocol';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, Panel, Segmented } from '../../components/ui';
import { api } from '../../lib/api';
import { downloadJson } from '../../lib/download';
import { useSettings } from '../../stores/settings';
import { BattleLog } from '../battle/components/BattleLog';
import { ExplanationList } from '../battle/components/BotExplanation';
import { Field } from '../battle/components/Field';
import { type ReplayPerspective, replayFrame, replaySteps, stepLabel } from './replay-steps';

export function ReplayViewerPage() {
  const { id = '' } = useParams();
  const locale = useSettings((state) => state.namesLocale);
  const [replay, setReplay] = useState<SavedReplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perspective, setPerspective] = useState<ReplayPerspective>('all');
  const [step, setStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .getReplay(id)
      .then((response) => !cancelled && setReplay(response.replay))
      .catch((cause: unknown) => !cancelled && setError(String((cause as Error).message)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const steps = useMemo(() => (replay ? replaySteps(replay.replay.log) : []), [replay]);
  const frame = useMemo(
    () => (replay ? replayFrame(replay, perspective, step, locale) : null),
    [replay, perspective, step, locale],
  );

  if (error) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-3">
        <p role="alert" className="text-bad">
          {error}
        </p>
        <Link to="/replays" className="text-accent hover:underline">
          ← Mis replays
        </Link>
      </div>
    );
  }
  if (!replay || !frame) return <p className="text-muted">Cargando el replay…</p>;

  const { replay: data } = replay;
  const last = steps.length - 1;
  const current = steps[step];
  // The turn just played: at the start of turn N, turn N - 1; at the end, the last one.
  const played = current ? (current.end ? current.turn : current.turn - 1) : 0;
  const result =
    data.winner === 'p1'
      ? `Ganó ${data.players.p1.name}`
      : data.winner === 'p2'
        ? `Ganó ${data.players.p2.name}`
        : 'Empate';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/replays" className="text-sm text-muted hover:text-text">
            ← Mis replays
          </Link>
          <h1 className="text-lg font-bold">
            {replay.name}
            <span className="ml-2 text-sm font-normal text-muted">
              {data.mode === 'singles' ? 'Individuales' : 'Dobles'} · {result} · {data.turns} turnos
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Qué se ve"
            size="sm"
            value={perspective}
            onChange={setPerspective}
            options={[
              { value: 'all', label: 'Todo', title: 'Los dos equipos al completo' },
              { value: 'player', label: 'Como jugador', title: 'Lo que viste en el combate' },
            ]}
          />
          <Button
            variant="ghost"
            onClick={() => downloadJson(`replay-${data.mode}-${data.seed}.json`, data)}
          >
            Descargar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:h-[calc(100vh-10rem)] lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto [&>*]:shrink-0">
          <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Turnos">
            <Button onClick={() => setStep(0)} disabled={step === 0} aria-label="Primer turno">
              ⏮
            </Button>
            <Button
              onClick={() => setStep(step - 1)}
              disabled={step === 0}
              aria-label="Turno anterior"
            >
              ◀
            </Button>
            <select
              aria-label="Ir al turno"
              value={step}
              onChange={(event) => setStep(Number(event.target.value))}
              className="rounded-lg border border-border bg-panel-2 px-2 py-2 text-sm"
            >
              {steps.map((entry, index) => (
                <option key={`${entry.turn}-${entry.end}`} value={index}>
                  {stepLabel(entry)}
                </option>
              ))}
            </select>
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === last}
              aria-label="Turno siguiente"
            >
              ▶
            </Button>
            <Button onClick={() => setStep(last)} disabled={step === last} aria-label="Final">
              ⏭
            </Button>
          </div>
          <Field view={frame.view} own={[]} />
          <Panel
            title={
              played > 0 ? `Lo que valoró el bot en el turno ${played}` : 'Lo que valoró el bot'
            }
          >
            <div className="p-4">
              {played < 1 ? (
                <p className="text-sm text-muted">Avanza un turno para ver sus decisiones.</p>
              ) : (
                <ExplanationList explanations={frame.explanations} />
              )}
            </div>
          </Panel>
          {perspective === 'all' && (
            <details className="rounded-xl border border-border bg-panel">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">
                Equipos completos
              </summary>
              <div className="grid gap-3 border-t border-border p-4 md:grid-cols-2">
                {(['p1', 'p2'] as const).map((side) => (
                  <label key={side} className="flex flex-col gap-1 text-sm">
                    <span className="font-semibold">{data.players[side].name}</span>
                    <textarea
                      readOnly
                      rows={12}
                      value={formatShowdownTeam(data.players[side].team)}
                      className="resize-y rounded-lg border border-border bg-panel-2 p-2 font-mono text-xs"
                    />
                  </label>
                ))}
              </div>
            </details>
          )}
        </div>
        <div className="min-h-[50vh] lg:min-h-0">
          <BattleLog entries={frame.entries} />
        </div>
      </div>
    </div>
  );
}
