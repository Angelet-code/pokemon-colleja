/** Saved teams (`/equipos`): create, import, edit, duplicate, delete and use in battle. */
import type { GameMode } from '@colleja/data';
import type { TeamSummary } from '@colleja/protocol';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PokemonIcon } from '../../components/PokemonIcon';
import { Button, Segmented } from '../../components/ui';
import { ApiRequestError, api } from '../../lib/api';
import { useSetup } from '../setup/setup-store';
import { ImportDialog } from './components/TextDialogs';
import type { EditorLocationState } from './TeamEditorPage';
import { DEFAULT_TEAM_NAME } from './team-draft';

const MODE_LABEL: Record<GameMode, string> = { singles: 'Individuales', doubles: 'Dobles' };

export function TeamsPage() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<TeamSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setTeams((await api.listTeams()).teams);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  const duplicate = (summary: TeamSummary) =>
    run(async () => {
      const { team } = await api.getTeam(summary.id);
      const { id: _id, ...content } = team;
      await api.createTeam({ ...content, name: `${content.name} (copia)`.slice(0, 60) });
    });

  const remove = (summary: TeamSummary) => run(() => api.deleteTeam(summary.id));

  function playWith(summary: TeamSummary) {
    useSetup.getState().update({ teamSource: 'saved', teamId: summary.id, mode: summary.mode });
    navigate('/');
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mis equipos</h1>
          <p className="text-sm text-muted">
            Crea equipos con Stat Points, guárdalos y úsalos en combate. Un equipo con problemas se
            guarda como borrador.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setImporting(true)}>Importar</Button>
          <Link
            to="/equipos/nuevo"
            className="inline-flex items-center rounded-lg border border-transparent bg-accent px-3 py-2 text-sm font-medium text-accent-text hover:brightness-110"
          >
            Nuevo equipo
          </Link>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {teams === null && !error && <p className="text-muted">Cargando…</p>}
      {teams?.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted">
          Aún no tienes equipos guardados. Crea uno desde cero o importa un export de Showdown.
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Equipos guardados">
        {teams?.map((summary) => (
          <TeamCard
            key={summary.id}
            summary={summary}
            onDuplicate={() => duplicate(summary)}
            onDelete={() => remove(summary)}
            onUse={() => playWith(summary)}
          />
        ))}
      </ul>

      {importing && <ImportTeamDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

function TeamCard({
  summary,
  onDuplicate,
  onDelete,
  onUse,
}: {
  summary: TeamSummary;
  onDuplicate: () => void;
  onDelete: () => void;
  onUse: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const problems = summary.problems.length;
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/equipos/${summary.id}`}
            className="block truncate font-semibold hover:text-accent"
          >
            {summary.name}
          </Link>
          <p className="text-xs text-muted">
            {MODE_LABEL[summary.mode]} · {formatDate(summary.updatedAt)}
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
              Usar en combate
            </Button>
            <Link
              to={`/equipos/${summary.id}`}
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

function ImportTeamDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState(DEFAULT_TEAM_NAME);
  const [mode, setMode] = useState<GameMode>(useSetup.getState().mode);
  return (
    <ImportDialog
      title="Importar equipo"
      hint="Export de Showdown (los EVs son Stat Points de Champions)."
      onClose={onClose}
      confirmLabel="Importar y editar"
      onImport={async (text) => {
        try {
          const { team, adjustments } = await api.importTeam({ text, name, mode });
          const state: EditorLocationState = { importNotes: adjustments };
          navigate(`/equipos/${team.id}`, { state });
          return undefined;
        } catch (cause) {
          return cause instanceof ApiRequestError && cause.details.length > 0
            ? cause.details
            : [messageOf(cause)];
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-muted">Nombre</span>
          <input
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            className="rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
          />
        </label>
        <Segmented
          label="Modo preferido"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'singles', label: 'Individuales' },
            { value: 'doubles', label: 'Dobles' },
          ]}
        />
      </div>
    </ImportDialog>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
