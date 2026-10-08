/**
 * Team editor: members on the left, the selected member's sheet on the right (one at a time on
 * narrow screens). Problems are checked live with core; saving is explicit and the server adds
 * Showdown's validator.
 *
 * It edits your teams (`/equipos/nuevo`, `/equipos/:id`) and the saved opponents
 * (`/rivales/nuevo`, `/rivales/:id`, with their difficulty), depending on the `destination`.
 */
import { TEAM_LIMITS } from '@colleja/protocol';
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
import { IconArrowLeft, IconDownload, IconSave, IconUpload } from '../../components/icons';
import {
  Button,
  buttonClass,
  Chip,
  Loading,
  Notice,
  Panel,
  Segmented,
  textareaClass,
} from '../../components/ui';
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

  if (editor.status === 'loading') return <Loading>{texts.loading}</Loading>;
  if (editor.loadError) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-4">
        <Notice title={editor.loadError} />
        <Link to={destination.path} className={buttonClass('ghost', 'sm')}>
          <IconArrowLeft size={14} />
          {texts.back}
        </Link>
      </div>
    );
  }

  const total = issues.total + validatorProblems.length;
  const problemList = [...issues.team, ...validatorProblems];

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Link
          to={destination.path}
          className="eyebrow flex w-fit items-center gap-1.5 text-faint hover:text-text"
        >
          <IconArrowLeft size={13} />
          {texts.back}
        </Link>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <label className="min-w-64 flex-1">
            <span className="sr-only">{texts.nameLabel}</span>
            <input
              value={draft.name}
              maxLength={TEAM_LIMITS.name}
              placeholder="Sin nombre"
              onChange={(event) =>
                editor.edit((current) => ({ ...current, name: event.target.value }))
              }
              className="display w-full border-b border-transparent bg-transparent pb-1 text-5xl placeholder:text-faint hover:border-line-strong focus:border-accent-fg focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2">
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
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-y border-line py-2.5">
        <p className="flex items-center gap-2" aria-live="polite">
          <Chip tone={dirty ? 'warn' : 'neutral'}>
            {dirty ? 'Cambios sin guardar' : editor.savedId !== null ? 'Guardado' : texts.unsaved}
          </Chip>
          {total > 0 ? (
            <Chip tone="bad">
              {total} problema{total === 1 ? '' : 's'}
            </Chip>
          ) : (
            <Chip tone="good">Legal</Chip>
          )}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setDialog('import')}>
            <IconUpload size={14} />
            Importar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDialog('export')}
            disabled={draft.members.length === 0}
          >
            <IconDownload size={14} />
            Exportar
          </Button>
          {editor.savedId && !dirty && (
            <Button size="sm" onClick={goToBattle} disabled={total > 0} title={texts.useTitle}>
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
            <IconSave size={15} />
            {editor.status === 'saving' ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>

      {editor.saveError && (
        <Notice
          title={`No se ha podido guardar: ${editor.saveError.message}`}
          items={editor.saveError.details}
        />
      )}
      {notes.length > 0 && (
        <Notice
          tone="warn"
          title="Ajustes al importar"
          items={notes}
          onClose={() => setNotes([])}
        />
      )}
      {problemList.length > 0 && <Notice items={problemList} />}

      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Panel
          title={`Pokémon ${draft.members.length}/${size}`}
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
          <label className="flex flex-col gap-1.5 border-t border-line p-3">
            <span className="eyebrow text-faint">Notas</span>
            <textarea
              value={draft.notes ?? ''}
              maxLength={2000}
              rows={3}
              onChange={(event) =>
                editor.edit((current) => ({ ...current, notes: event.target.value }))
              }
              className={`${textareaClass} font-sans text-sm`}
            />
          </label>
        </Panel>

        <section
          className={`min-w-0 rounded-md border border-line bg-surface shadow-panel ${mobileSheet ? '' : 'max-lg:hidden'}`}
        >
          {selected >= 0 && draft.members[selected] ? (
            <>
              <div className="border-b border-line px-3 py-2 lg:hidden">
                <Button size="sm" variant="ghost" onClick={() => setMobileSheet(false)}>
                  <IconArrowLeft size={14} />
                  Equipo
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
            <div className="flex min-h-72 flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="display text-3xl text-faint">
                {draft.members.length === 0 ? 'Equipo vacío' : 'Elige un Pokémon'}
              </p>
              {draft.members.length === 0 && (
                <p className="text-sm text-muted">Añade uno a la izquierda o importa un equipo.</p>
              )}
            </div>
          )}
        </section>
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
          hint="Sustituye a los Pokémon actuales"
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
