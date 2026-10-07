/**
 * Team editor: members on the left, the selected member's sheet on the right (one at a time on
 * narrow screens). Problems are checked live with core; saving is explicit and the server adds
 * Showdown's validator.
 *
 * It edits your teams (`/equipos/nuevo`, `/equipos/:id`) and the saved opponents
 * (`/rivales/nuevo`, `/rivales/:id`, with their difficulty), depending on the `destination`.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Link,
  useBeforeUnload,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router';
import { Dialog } from '../../components/Dialog';
import { Button, Panel, Segmented } from '../../components/ui';
import { useSettings } from '../../stores/settings';
import { useSetup } from '../setup/setup-store';
import { BotLevelSelect } from './components/BotLevelSelect';
import { MemberList } from './components/MemberList';
import { SetEditor } from './components/SetEditor';
import { ExportDialog, ImportDialog } from './components/TextDialogs';
import type { EditorDestination } from './editor-destination';
import {
  addMember,
  DEFAULT_OPPONENT_LEVEL,
  draftIssues,
  exportTeam,
  importText,
  memberIssueCount,
  moveMember,
  removeMember,
  replaceMembers,
  type TeamDraft,
  teamSize,
  updateMember,
} from './team-draft';
import { isDirty, useIsDirty, useTeamEditor } from './team-editor-store';

/** Navigation state of the editor routes. */
export interface EditorLocationState {
  /** Set after creating a draft, so the editor does not reload it. */
  created?: boolean;
  /** Notes of an import made from the list (lines not read, limits applied). */
  importNotes?: string[];
  /** New drafts only: start from this team (generated or copied) as unsaved changes. */
  initial?: TeamDraft;
}

/** Stable empty state, so effects depending on it do not run on every render. */
const NO_STATE: EditorLocationState = {};

export function TeamEditorPage({ destination }: { destination: EditorDestination }) {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const locale = useSettings((state) => state.namesLocale);
  const editor = useTeamEditor();
  const dirty = useIsDirty();
  const [dialog, setDialog] = useState<'export' | 'import' | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [mobileSheet, setMobileSheet] = useState(false);
  const routeState = (location.state ?? NO_STATE) as EditorLocationState;

  // Load (or start) the draft of the route. After creating one the store already has it.
  useEffect(() => {
    const store = useTeamEditor.getState();
    if (!id) {
      const { initial } = routeState;
      store.startNew(destination, initial?.mode ?? useSetup.getState().mode, initial);
      return;
    }
    if (routeState.created && store.savedId === id && store.destination === destination) return;
    void store.load(destination, id);
  }, [destination, id, routeState]);

  useEffect(() => {
    if (routeState.importNotes) setNotes(routeState.importNotes);
  }, [routeState.importNotes]);

  // Read the store, not this render: right after saving, the navigation runs before re-rendering.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty(useTeamEditor.getState()) && currentLocation.pathname !== nextLocation.pathname,
  );
  useBeforeUnload((event) => {
    if (isDirty(useTeamEditor.getState())) event.preventDefault();
  });

  const { draft, selected } = editor;
  const { texts } = destination;
  const issues = useMemo(() => draftIssues(draft), [draft]);
  const size = teamSize(draft);
  // Showdown's verdict is only meaningful for the saved version.
  const validatorProblems = dirty
    ? []
    : editor.serverProblems.filter((problem) => problem.startsWith('Validador de Showdown'));

  async function save() {
    const wasNew = editor.savedId === null;
    const savedId = await editor.save();
    if (savedId && wasNew) {
      const state: EditorLocationState = { created: true };
      navigate(`${destination.path}/${savedId}`, { replace: true, state });
    }
  }

  function goToBattle() {
    const { savedId } = editor;
    if (!savedId) return;
    useSetup.getState().update(
      destination.kind === 'teams'
        ? { teamSource: 'saved', teamId: savedId, mode: draft.mode }
        : {
            opponentKind: 'saved',
            opponentId: savedId,
            botLevel: draft.botLevel ?? DEFAULT_OPPONENT_LEVEL,
            mode: draft.mode,
          },
    );
    navigate('/');
  }

  if (editor.status === 'loading') return <p className="text-muted">{texts.loading}</p>;
  if (editor.loadError) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-3">
        <p role="alert" className="text-bad">
          {editor.loadError}
        </p>
        <Link to={destination.path} className="text-accent hover:underline">
          {texts.back}
        </Link>
      </div>
    );
  }

  const total = issues.total + validatorProblems.length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Link to={destination.path} className="text-sm text-muted hover:text-text">
          {texts.back}
        </Link>
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-muted">{texts.nameLabel}</span>
          <input
            value={draft.name}
            maxLength={60}
            onChange={(event) =>
              editor.edit((current) => ({ ...current, name: event.target.value }))
            }
            className="rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-lg font-semibold focus:border-accent focus:outline-none"
          />
        </label>
        <Segmented
          label="Modo preferido"
          value={draft.mode}
          onChange={(mode) => editor.edit((current) => ({ ...current, mode }))}
          options={[
            {
              value: 'singles',
              label: 'Individuales',
              title: 'Modo preferido (vale para los dos)',
            },
            { value: 'doubles', label: 'Dobles', title: 'Modo preferido (vale para los dos)' },
          ]}
        />
        {destination.kind === 'opponents' && (
          <BotLevelSelect
            value={draft.botLevel ?? DEFAULT_OPPONENT_LEVEL}
            onChange={(botLevel) => editor.edit((current) => ({ ...current, botLevel }))}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDialog('import')}>Importar</Button>
          <Button onClick={() => setDialog('export')} disabled={draft.members.length === 0}>
            Exportar
          </Button>
          {editor.savedId && !dirty && (
            <Button onClick={goToBattle} disabled={total > 0} title={texts.useTitle}>
              {texts.use}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={save}
            disabled={
              editor.status === 'saving' ||
              (!dirty && editor.savedId !== null) ||
              !draft.name.trim()
            }
          >
            {editor.status === 'saving' ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>

      <StatusLine dirty={dirty} saved={editor.savedId !== null} problems={total} texts={texts} />

      {editor.saveError && (
        <div
          role="alert"
          className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad"
        >
          <p className="font-semibold">No se ha podido guardar: {editor.saveError.message}</p>
          {editor.saveError.details.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-xs">
              {editor.saveError.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {notes.length > 0 && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          <div>
            <p className="font-semibold">Al importar:</p>
            <ul className="list-disc pl-4 text-xs">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
          <Button variant="ghost" onClick={() => setNotes([])} aria-label="Cerrar aviso">
            ✕
          </Button>
        </div>
      )}
      {(issues.team.length > 0 || validatorProblems.length > 0) && (
        <ul
          role="alert"
          className="space-y-0.5 rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad"
        >
          {[...issues.team, ...validatorProblems].map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[280px_1fr]">
        <Panel
          title={`Pokémon (${draft.members.length}/${size})`}
          className={mobileSheet ? 'max-lg:hidden' : ''}
        >
          <div className="p-2">
            <MemberList
              members={draft.members}
              size={size}
              selected={selected}
              issueCounts={draft.members.map((_, index) => memberIssueCount(issues, index))}
              locale={locale}
              onSelect={(index) => {
                editor.select(index);
                setMobileSheet(true);
              }}
              onAdd={(species) => {
                editor.edit((current) => addMember(current, species));
                editor.select(useTeamEditor.getState().draft.members.length - 1);
                setMobileSheet(true);
              }}
              onMove={(from, to) => {
                editor.edit((current) => moveMember(current, from, to));
                if (selected === from) editor.select(to);
                else if (selected === to) editor.select(from);
              }}
            />
          </div>
          <label className="flex flex-col gap-1 border-t border-border p-3">
            <span className="text-xs font-medium text-muted">Notas</span>
            <textarea
              value={draft.notes ?? ''}
              maxLength={2000}
              rows={3}
              onChange={(event) =>
                editor.edit((current) => ({ ...current, notes: event.target.value }))
              }
              className="resize-y rounded-lg border border-border bg-panel-2 px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
          </label>
        </Panel>

        <Panel className={mobileSheet ? '' : 'max-lg:hidden'}>
          {selected >= 0 && draft.members[selected] ? (
            <>
              <div className="border-b border-border px-4 py-2 lg:hidden">
                <Button variant="ghost" onClick={() => setMobileSheet(false)}>
                  ← Equipo
                </Button>
              </div>
              <SetEditor
                draft={draft}
                index={selected}
                locale={locale}
                problems={issues.members.get(selected) ?? {}}
                onChange={(set) =>
                  editor.edit((current) => updateMember(current, selected, () => set))
                }
                onRemove={() => {
                  editor.edit((current) => removeMember(current, selected));
                  editor.select(Math.max(0, selected - 1));
                  if (useTeamEditor.getState().draft.members.length === 0) setMobileSheet(false);
                }}
              />
            </>
          ) : (
            <p className="p-6 text-sm text-muted">
              {draft.members.length === 0
                ? 'Añade el primer Pokémon con el buscador de la izquierda, o importa un equipo en formato de Showdown.'
                : 'Elige un Pokémon de la lista para editarlo.'}
            </p>
          )}
        </Panel>
      </div>

      {dialog === 'export' && (
        <ExportDialog
          title="Exportar equipo"
          text={exportTeam(draft)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'import' && (
        <ImportDialog
          title="Importar equipo"
          hint="Pega el equipo en formato de Showdown. Sustituye a los Pokémon actuales (el nombre y el modo se mantienen)."
          onClose={() => setDialog(null)}
          onImport={(text) => {
            const result = importText(text, draft.mode);
            if (result.members.length === 0) {
              return result.notes.length > 0 ? result.notes : ['No se ha leído ningún Pokémon.'];
            }
            editor.edit((current) => replaceMembers(current, result.members));
            editor.select(0);
            setNotes(result.notes);
            setDialog(null);
            return undefined;
          }}
        />
      )}
      {blocker.state === 'blocked' && (
        <Dialog
          title="Cambios sin guardar"
          onClose={() => blocker.reset()}
          footer={
            <>
              <Button onClick={() => blocker.reset()}>Seguir editando</Button>
              <Button variant="danger" onClick={() => blocker.proceed()}>
                Salir sin guardar
              </Button>
            </>
          }
        >
          <p className="text-sm">{texts.leaveWarning}</p>
        </Dialog>
      )}
    </div>
  );
}

function StatusLine({
  dirty,
  saved,
  problems,
  texts,
}: {
  dirty: boolean;
  saved: boolean;
  problems: number;
  texts: EditorDestination['texts'];
}) {
  return (
    <p className="flex flex-wrap gap-3 text-sm" aria-live="polite">
      <span className={dirty ? 'text-warn' : 'text-muted'}>
        {dirty ? 'Cambios sin guardar' : saved ? 'Guardado' : texts.unsaved}
      </span>
      <span className={problems > 0 ? 'text-bad' : 'text-good'}>
        {problems > 0
          ? `${problems} problema${problems === 1 ? '' : 's'} (se puede guardar como borrador; para combatir tiene que ser legal)`
          : texts.legal}
      </span>
    </p>
  );
}
