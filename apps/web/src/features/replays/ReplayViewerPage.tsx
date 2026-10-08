/**
 * Replay viewer (`/replays/:id`): the battle turn by turn, with the field, the log up to that
 * point and the bot's reasons. It shows everything by default (the battle is over) and can
 * switch to what you saw while playing.
 */
import { formatShowdownTeam } from '@colleja/core';
import type { SavedReplay } from '@colleja/protocol';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconFirst,
  IconLast,
} from '../../components/icons';
import {
  buttonClass,
  IconButton,
  Loading,
  Notice,
  Panel,
  Segmented,
  textareaClass,
} from '../../components/ui';
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
      <div className="mx-auto flex max-w-md flex-col items-start gap-4">
        <Notice title={error} />
        <Link to="/replays" className={buttonClass('ghost', 'sm')}>
          <IconArrowLeft size={14} />
          Replays
        </Link>
      </div>
    );
  }
  if (!replay || !frame) return <Loading>Cargando el replay…</Loading>;

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
      <div className="flex flex-col gap-3">
        <Link
          to="/replays"
          className="eyebrow flex w-fit items-center gap-1.5 text-faint hover:text-text"
        >
          <IconArrowLeft size={13} />
          Replays
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="display truncate text-4xl">{replay.name}</h1>
            <p className="eyebrow mt-2 text-faint">
              {data.mode === 'singles' ? 'Individuales' : 'Dobles'} · {result} · {data.turns} turnos
            </p>
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
            <IconButton
              label="Descargar"
              onClick={() => downloadJson(`replay-${data.mode}-${data.seed}.json`, data)}
            >
              <IconDownload />
            </IconButton>
          </div>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center gap-1 rounded-md border border-line bg-surface px-2 py-1.5"
        role="toolbar"
        aria-label="Turnos"
      >
        <IconButton label="Primer turno" onClick={() => setStep(0)} disabled={step === 0}>
          <IconFirst />
        </IconButton>
        <IconButton label="Turno anterior" onClick={() => setStep(step - 1)} disabled={step === 0}>
          <IconChevronLeft />
        </IconButton>
        <select
          aria-label="Ir al turno"
          value={step}
          onChange={(event) => setStep(Number(event.target.value))}
          className="display h-9 cursor-pointer appearance-none bg-transparent px-3 text-center text-2xl focus:outline-none"
        >
          {steps.map((entry, index) => (
            <option key={`${entry.turn}-${entry.end}`} value={index}>
              {stepLabel(entry)}
            </option>
          ))}
        </select>
        <IconButton
          label="Turno siguiente"
          onClick={() => setStep(step + 1)}
          disabled={step === last}
        >
          <IconChevronRight />
        </IconButton>
        <IconButton label="Final" onClick={() => setStep(last)} disabled={step === last}>
          <IconLast />
        </IconButton>
        <span className="relative ml-3 h-1 min-w-24 flex-1 bg-surface-3" aria-hidden="true">
          <span
            className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-300"
            style={{ width: `${last > 0 ? (step / last) * 100 : 100}%` }}
          />
        </span>
        <span className="eyebrow ml-3 pr-2 text-faint tabular-nums">
          {step + 1}/{steps.length}
        </span>
      </div>

      <div className="grid gap-3 lg:h-[calc(100vh-15rem)] lg:min-h-[620px] lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <div className="scroll-thin flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1 [&>*]:shrink-0">
          <Field view={frame.view} own={[]} />
          <Panel title={played > 0 ? `El bot en el turno ${played}` : 'El bot'} bodyClassName="p-4">
            {played < 1 ? (
              <p className="text-sm text-faint">Avanza un turno.</p>
            ) : (
              <ExplanationList explanations={frame.explanations} />
            )}
          </Panel>
          {perspective === 'all' && (
            <details className="group rounded-md border border-line bg-surface">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="eyebrow text-muted">Equipos completos</span>
                <IconChevronDown
                  size={14}
                  className="ml-auto text-faint transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="grid gap-3 border-t border-line p-4 md:grid-cols-2">
                {(['p1', 'p2'] as const).map((side) => (
                  <label key={side} className="flex flex-col gap-1.5">
                    <span className={`eyebrow ${side === 'p1' ? 'text-accent-fg' : 'text-rival'}`}>
                      {data.players[side].name}
                    </span>
                    <textarea
                      readOnly
                      rows={12}
                      value={formatShowdownTeam(data.players[side].team)}
                      className={textareaClass}
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
