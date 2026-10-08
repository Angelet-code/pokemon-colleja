/**
 * Team bench (`/banco`): your saved team (and optionally a second version) against your saved
 * rivals, bot against bot, with the table filling in live. The history of the team is below.
 */
import type {
  BenchListEntry,
  BenchSetup,
  BenchSummaryValue,
  BotLevelValue,
  OpponentSummary,
  StratumSummaryValue,
  TeamSummary,
} from '@colleja/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { IconClose, IconPlay, IconTrash } from '../../components/icons';
import {
  Button,
  Checkbox,
  Chip,
  Empty,
  Field,
  IconButton,
  Loading,
  Notice,
  PageHeader,
  Panel,
  Segmented,
  Select,
  TextInput,
  textareaClass,
} from '../../components/ui';
import { ApiRequestError, api } from '../../lib/api';
import { BenchWatcher } from '../../lib/bench-socket';
import { botLevelName, useMeta } from '../../lib/use-meta';
import { useSetup } from '../setup/setup-store';
import { BenchResults, STOP_LABEL } from './BenchResults';
import {
  type BenchForm,
  rivalsForMode,
  selectedRivals,
  toBenchRequest,
  toggleRival,
  useBenchForm,
} from './bench-form';

interface View {
  benchId: string;
  setup: BenchSetup | null;
  summary: BenchSummaryValue | null;
}

const percent = (value: number) => `${(value * 100).toFixed(1).replace('.', ',')} %`;

export function BenchPage() {
  const form = useBenchForm();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<TeamSummary[] | null>(null);
  const [opponents, setOpponents] = useState<OpponentSummary[] | null>(null);
  const [history, setHistory] = useState<BenchListEntry[] | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<{ title: string; items?: string[] } | null>(null);
  const watcher = useRef<BenchWatcher | null>(null);

  const running = view !== null && (view.summary === null || view.summary.status === 'running');

  const refreshHistory = useCallback(async (teamId: string) => {
    if (!teamId) return setHistory([]);
    try {
      setHistory((await api.listBenches(teamId)).benches);
    } catch {
      setHistory([]);
    }
  }, []);

  const follow = useCallback(
    (benchId: string) => {
      watcher.current?.close();
      setView({ benchId, setup: null, summary: null });
      watcher.current = new BenchWatcher(benchId, (message) => {
        if (message.type === 'bench:error') {
          setError({ title: message.message });
          setView(null);
          return;
        }
        setView({ benchId, setup: message.setup, summary: message.summary });
        if (message.type === 'bench:result') {
          void refreshHistory(message.setup.team.teamId ?? '');
        }
      });
    },
    [refreshHistory],
  );

  useEffect(() => {
    let cancelled = false;
    api
      .listTeams()
      .then(({ teams }) => !cancelled && setTeams(teams))
      .catch((cause: unknown) => !cancelled && setError({ title: String(cause) }));
    api
      .listOpponents()
      .then(({ opponents }) => !cancelled && setOpponents(opponents))
      .catch(() => !cancelled && setOpponents([]));
    // A bench may be running from before (another tab, a reload): follow it.
    api
      .listBenches()
      .then(({ running }) => !cancelled && running && follow(running.benchId))
      .catch(() => {});
    return () => {
      cancelled = true;
      watcher.current?.close();
    };
  }, [follow]);

  useEffect(() => {
    void refreshHistory(form.teamId);
  }, [form.teamId, refreshHistory]);

  async function start() {
    if (!teams || !opponents) return;
    const built = toBenchRequest(form, teams, opponents);
    if (!built.ok) return setError({ title: built.reason });
    setError(null);
    try {
      const { benchId } = await api.startBench(built.request);
      follow(benchId);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? { title: cause.message, items: cause.details }
          : { title: String(cause) },
      );
    }
  }

  async function open(entry: BenchListEntry) {
    try {
      watcher.current?.close();
      const { bench } = await api.getBench(entry.id);
      setView({ benchId: bench.id, setup: bench.setup, summary: bench.summary });
    } catch (cause) {
      setError({ title: cause instanceof Error ? cause.message : String(cause) });
    }
  }

  function play(row: StratumSummaryValue) {
    const setup = view?.setup;
    if (!setup) return;
    useSetup.getState().update({
      mode: row.mode,
      teamSource: 'saved',
      teamId: setup.team.teamId ?? form.teamId,
      opponentKind: 'saved',
      opponentId: row.opponentId,
      botLevel: setup.levels.opponent,
    });
    navigate('/');
  }

  const request = teams && opponents ? toBenchRequest(form, teams, opponents) : null;

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <PageHeader title="Banco de pruebas" />
      {error && <Notice title={error.title} items={error.items} onClose={() => setError(null)} />}
      <div className="grid items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        <Panel title="Prueba" bodyClassName="flex flex-col gap-5 p-4">
          {teams === null || opponents === null ? (
            <Loading />
          ) : (
            <BenchFormFields form={form} teams={teams} opponents={opponents} disabled={running} />
          )}
          {running ? (
            <Button
              variant="danger"
              size="lg"
              onClick={() => view && void api.deleteBench(view.benchId)}
            >
              <IconClose size={16} /> Cancelar
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              disabled={!request?.ok}
              title={request && !request.ok ? request.reason : undefined}
              onClick={() => void start()}
            >
              <IconPlay size={16} /> Empezar
            </Button>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            title="Resultado"
            actions={view?.summary && <ResultState summary={view.summary} />}
            bodyClassName="p-4"
          >
            {view === null && <Empty>Elige tu equipo y tus rivales y empieza.</Empty>}
            {view !== null && (view.setup === null || view.summary === null) && (
              <Loading>Preparando los combates…</Loading>
            )}
            {view?.setup && view.summary && (
              <BenchResults setup={view.setup} summary={view.summary} onPlay={play} />
            )}
          </Panel>

          <Panel title="Historial del equipo" bodyClassName="p-2">
            {history === null && <Loading />}
            {history?.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted">Sin pruebas guardadas.</p>
            )}
            {history && history.length > 0 && (
              <ul aria-label="Pruebas guardadas">
                {history.map((entry) => (
                  <HistoryRow
                    key={entry.id}
                    entry={entry}
                    selected={entry.id === view?.benchId}
                    onOpen={() => void open(entry)}
                    onDelete={async () => {
                      await api.deleteBench(entry.id).catch(() => {});
                      if (view?.benchId === entry.id) setView(null);
                      await refreshHistory(form.teamId);
                    }}
                  />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ResultState({ summary }: { summary: BenchSummaryValue }) {
  const { played, planned } = summary.battles;
  const seconds = Math.round(summary.elapsedMs / 1000);
  return (
    <div className="flex items-center gap-2 text-xs text-muted tabular-nums">
      <span>
        {summary.status === 'running' ? `${played} / ${planned}` : planned} combates · {seconds} s
      </span>
      {summary.status === 'running' ? (
        <Chip tone="accent">En marcha</Chip>
      ) : (
        <Chip tone={summary.status === 'done' ? 'good' : 'warn'}>
          {summary.stopReason ? STOP_LABEL[summary.stopReason] : summary.status}
        </Chip>
      )}
    </div>
  );
}

function HistoryRow({
  entry,
  selected,
  onOpen,
  onDelete,
}: {
  entry: BenchListEntry;
  selected: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { total } = entry;
  const figure = total.difference
    ? `B − A ${total.difference.mean >= 0 ? '+' : '−'}${Math.abs(total.difference.mean * 100)
        .toFixed(1)
        .replace('.', ',')}`
    : total.team
      ? percent(total.team.mean)
      : '—';
  return (
    <li
      className={`flex items-center gap-3 rounded-sm px-2 py-1.5 ${selected ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="w-28 shrink-0 font-display text-lg tabular-nums">{figure}</span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {entry.versusName ? `contra ${entry.versusName} · ` : ''}
          {entry.opponents} rivales · nivel {entry.levels.team} contra {entry.levels.opponent} ·{' '}
          {entry.battles} combates
        </span>
        <span className="shrink-0 text-xs text-faint">
          {new Date(entry.updatedAt).toLocaleString('es-ES', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </span>
      </button>
      <IconButton label="Borrar prueba" onClick={onDelete}>
        <IconTrash size={14} />
      </IconButton>
    </li>
  );
}

/** The two strongest levels: the bench measures the team, not a weak bot. */
const BENCH_LEVELS = [2, 3] as const;

function BenchFormFields({
  form,
  teams,
  opponents,
  disabled,
}: {
  form: BenchForm & { update(changes: Partial<BenchForm>): void };
  teams: TeamSummary[];
  opponents: OpponentSummary[];
  disabled: boolean;
}) {
  const rivals = rivalsForMode(opponents, form.mode);
  const chosen = new Set(selectedRivals(form, opponents).map((opponent) => opponent.id));
  const others = teams.filter((team) => team.id !== form.teamId);
  const meta = useMeta();
  const levels = BENCH_LEVELS.map((level) => ({
    value: level as BotLevelValue,
    label: botLevelName(meta, level),
    title: `Nivel ${level}`,
  }));
  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-5 disabled:opacity-60">
      <Field label="Tu equipo">
        <Select
          value={form.teamId}
          onChange={(event) => form.update({ teamId: event.target.value })}
        >
          <option value="">Elige un equipo…</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id} disabled={!team.valid}>
              {team.name}
              {team.valid ? '' : ' (con problemas)'}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex flex-col gap-2">
        <span className="eyebrow text-faint">Comparar con</span>
        <Segmented
          label="Comparar con"
          stretch
          value={form.versus}
          onChange={(versus) => form.update({ versus })}
          options={[
            { value: 'none', label: 'Nada' },
            { value: 'saved', label: 'Otro equipo' },
            { value: 'text', label: 'Texto' },
          ]}
        />
        {form.versus === 'saved' && (
          <Select
            aria-label="Versión B"
            value={form.versusTeamId}
            onChange={(event) => form.update({ versusTeamId: event.target.value })}
          >
            <option value="">Elige la versión B…</option>
            {others.map((team) => (
              <option key={team.id} value={team.id} disabled={!team.valid}>
                {team.name}
              </option>
            ))}
          </Select>
        )}
        {form.versus === 'text' && (
          <textarea
            aria-label="Versión B (texto exportado)"
            className={`${textareaClass} h-32`}
            value={form.versusText}
            onChange={(event) => form.update({ versusText: event.target.value })}
            placeholder="Pega aquí la versión B del equipo"
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="eyebrow text-faint">Modo</span>
        <Segmented
          label="Modo"
          stretch
          value={form.mode}
          onChange={(mode) => form.update({ mode, opponentIds: null })}
          options={[
            { value: 'singles', label: 'Individuales' },
            { value: 'doubles', label: 'Dobles' },
            { value: 'both', label: 'Ambos' },
          ]}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-faint">
            Rivales {chosen.size}/{rivals.length}
          </span>
          <Button size="sm" variant="ghost" onClick={() => form.update({ opponentIds: null })}>
            Todos
          </Button>
        </div>
        {rivals.length === 0 ? (
          <p className="text-sm text-muted">No hay rivales legales guardados para este modo.</p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1" aria-label="Rivales">
            {rivals.map((rival) => (
              <li key={rival.id} className="flex items-center gap-2">
                <Checkbox
                  className="min-w-0 flex-1"
                  checked={chosen.has(rival.id)}
                  onChange={() =>
                    form.update({ opponentIds: toggleRival(form, opponents, rival.id) })
                  }
                  label={
                    <span className="block truncate" title={rival.name}>
                      {rival.name}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <span className="eyebrow text-faint">Tu bot</span>
          <Segmented
            label="Nivel de tu bot"
            stretch
            size="sm"
            value={form.teamLevel}
            onChange={(teamLevel) => form.update({ teamLevel })}
            options={levels}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="eyebrow text-faint">Rivales</span>
          <Segmented
            label="Nivel de los rivales"
            stretch
            size="sm"
            value={form.opponentLevel}
            onChange={(opponentLevel) => form.update({ opponentLevel })}
            options={levels}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="eyebrow text-faint">Precisión</span>
        <Segmented
          label="Precisión"
          stretch
          value={form.precision}
          onChange={(precision) => form.update({ precision })}
          options={[
            { value: 'p10', label: '± 10', title: 'Para cuando el total se sabe con ± 10 puntos' },
            {
              value: 'p5',
              label: '± 5',
              title: 'Para cuando el total se sabe con ± 5 puntos (unas 4 veces más combates)',
            },
            { value: 'fixed', label: 'Fijo', title: 'Un número fijo de combates por rival' },
          ]}
        />
        {form.precision === 'fixed' && (
          <Field label="Combates por rival">
            <TextInput
              type="number"
              min={1}
              max={200}
              value={form.battles}
              onChange={(event) => form.update({ battles: Number(event.target.value) })}
            />
          </Field>
        )}
      </div>
    </fieldset>
  );
}
