/**
 * «Meta» in the rivals page: the teams of the ladder's metagame (read only), each with its
 * share. They can be used as the rival or copied to «Mis rivales» to edit them. «Actualizar
 * meta» builds the newest month in the server (it takes a while: the page follows its state).
 */
import type { GameMode } from '@colleja/data';
import type {
  LatestMetagameResponse,
  MetagameResponse,
  MetagameSource,
  MetagameTeamSummary,
} from '@colleja/protocol';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { IconCopy, IconDownload } from '../../components/icons';
import { PokemonIcon } from '../../components/PokemonIcon';
import { Button, Chip, Empty, Loading, Notice, PageHeader } from '../../components/ui';
import { api } from '../../lib/api';
import { useSetup } from '../setup/setup-store';
import { messageOf } from './components/SavedList';
import type { EditorLocationState } from './TeamEditorPage';
import { DEFAULT_OPPONENT_LEVEL } from './team-draft';

const MODES: GameMode[] = ['doubles', 'singles'];
const MODE_LABEL: Record<GameMode, string> = { singles: 'Individuales', doubles: 'Dobles' };
const POLL_MS = 1500;

/** `2026-09` → `septiembre de 2026`. */
export function monthName(month: string): string {
  const [year, number] = month.split('-').map(Number);
  if (!year || !number) return month;
  return new Date(Date.UTC(year, number - 1, 1)).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const percent = (share: number) =>
  `${(share * 100).toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;

/** Where the teams of a mode came from, in a few words (the details in its `title`). */
function sourceChip(source: MetagameSource): { label: string; title: string } {
  const battles = source.battles.toLocaleString('es-ES');
  if (source.teamsFrom === 'replays') {
    return {
      label: `${MODE_LABEL[source.mode]} · ${source.samples.toLocaleString('es-ES')} equipos`,
      title: `Sets de ${battles} combates de Smogon. Equipos de ${source.samples} vistas previas de replays públicos agrupados por arquetipo: los de la lista cubren el ${Math.round(source.coverage * 100)} %.`,
    };
  }
  return {
    label: `${MODE_LABEL[source.mode]} · por compañeros`,
    title: `Sets de ${battles} combates de Smogon. Sin replays suficientes: cada equipo crece desde una especie con los compañeros que más la acompañan, y su peso es el uso de esa especie (aproximado).`,
  };
}

export function MetagameSection({ kicker }: { kicker: ReactNode }) {
  const navigate = useNavigate();
  const [data, setData] = useState<MetagameResponse | null>(null);
  const [latest, setLatest] = useState<LatestMetagameResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.metagame());
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  useEffect(() => {
    void load();
    api
      .latestMetagame()
      .then(setLatest)
      .catch(() => setLatest(null));
  }, [load]);

  // Follow a running update until it ends.
  const running = data?.update.running ?? false;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  async function update() {
    try {
      await api.updateMetagame();
      setLatest((current) => (current ? { ...current, newer: false } : current));
    } catch (cause) {
      setError(messageOf(cause));
    }
    await load();
  }

  async function copy(team: MetagameTeamSummary) {
    try {
      const { opponent, problems } = await api.copyMetagameTeam(
        team.snapshotId,
        team.id,
        DEFAULT_OPPONENT_LEVEL,
      );
      const state: EditorLocationState = { importNotes: problems };
      navigate(`/rivales/${opponent.id}`, { state });
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  function pickAsRival(team: MetagameTeamSummary) {
    useSetup.getState().update({
      opponentKind: 'metagame',
      metagameSnapshotId: team.snapshotId,
      metagameTeamId: team.id,
      mode: team.mode,
    });
    navigate('/');
  }

  const snapshot = data?.snapshot ?? null;
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <PageHeader
        kicker={kicker}
        title={
          <>
            Meta
            {snapshot && <span className="ml-3 text-faint">{monthName(snapshot.month)}</span>}
          </>
        }
      >
        <Button onClick={update} disabled={running || data === null}>
          <IconDownload size={14} />
          {running ? 'Actualizando…' : 'Actualizar meta'}
        </Button>
      </PageHeader>

      {snapshot && (
        <div className="flex flex-wrap items-center gap-2">
          <Chip title="Corte de rating de las estadísticas de Smogon">Corte {snapshot.cutoff}</Chip>
          {snapshot.sources.map((source) => {
            const chip = sourceChip(source);
            return (
              <Chip key={source.mode} title={chip.title}>
                {chip.label}
              </Chip>
            );
          })}
        </div>
      )}

      {error && <Notice title={error} onClose={() => setError(null)} />}
      {data?.update.error && <Notice title={data.update.error} />}
      {running && <Loading>{data?.update.step ?? 'Actualizando…'}</Loading>}
      {!running && latest?.newer && latest.month && (
        <Notice
          tone="warn"
          role="status"
          title={`Smogon ya tiene el meta de ${monthName(latest.month)}.`}
        />
      )}

      {data === null && !error && <Loading />}
      {data && !snapshot && !running && (
        <Empty
          action={
            <Button variant="primary" onClick={update}>
              <IconDownload size={14} />
              Actualizar meta
            </Button>
          }
        >
          Aún no hay meta.
        </Empty>
      )}

      {snapshot &&
        MODES.map((mode) => {
          const teams = data?.teams.filter((team) => team.mode === mode) ?? [];
          if (teams.length === 0) return null;
          return (
            <section key={mode} className="flex flex-col gap-2">
              <h2 className="eyebrow text-faint">{MODE_LABEL[mode]}</h2>
              <ul
                className="overflow-hidden rounded-md border border-line bg-surface shadow-panel"
                aria-label={`Meta de ${MODE_LABEL[mode].toLowerCase()}`}
              >
                {teams.map((team) => (
                  <MetagameCard
                    key={team.id}
                    team={team}
                    share={team.weight / Math.max(...teams.map((entry) => entry.weight))}
                    onUse={() => pickAsRival(team)}
                    onCopy={() => copy(team)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
    </div>
  );
}

function MetagameCard({
  team,
  share,
  onUse,
  onCopy,
}: {
  team: MetagameTeamSummary;
  /** Its weight relative to the most common team (for the bar). */
  share: number;
  onUse: () => void;
  onCopy: () => void;
}) {
  return (
    <li className="grid items-center gap-x-5 gap-y-3 border-b border-line px-4 py-3.5 transition-colors last:border-b-0 hover:bg-surface-2 md:grid-cols-[5.5rem_minmax(0,1fr)_auto_auto]">
      <div className="flex flex-col gap-1" title="Parte del meta de su modo">
        <span className="display text-2xl tabular-nums">{percent(team.weight)}</span>
        <span className="h-1 w-full bg-surface-3" aria-hidden="true">
          <span
            className="block h-full bg-rival"
            style={{ width: `${Math.round(share * 100)}%` }}
          />
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <span className="display truncate text-xl">{team.name}</span>
        {!team.valid && (
          <Chip tone="bad" title={team.problems.join('\n')}>
            No legal
          </Chip>
        )}
      </div>
      <div className="flex min-h-10 gap-0.5" aria-hidden="true">
        {team.species.map((species, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: members have no id; the order is the identity.
          <PokemonIcon key={index} species={species} size={40} />
        ))}
      </div>
      <div className="flex items-center gap-1 md:justify-end">
        <Button size="sm" variant="ghost" onClick={onCopy}>
          <IconCopy size={14} />
          Copiar a mis rivales
        </Button>
        <Button size="sm" variant="primary" className="ml-2" onClick={onUse} disabled={!team.valid}>
          Usar como rival
        </Button>
      </div>
    </li>
  );
}
