/** Saved teams (`/equipos`): create, import, edit, duplicate, delete and use in battle. */
import type { TeamSummary } from '@colleja/protocol';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { useSetup } from '../setup/setup-store';
import { ImportSavedDialog } from './components/ImportSavedDialog';
import { SavedCard } from './components/SavedCard';
import { SavedListLayout, useSavedList } from './components/SavedList';
import type { EditorLocationState } from './TeamEditorPage';
import { copyName, DEFAULT_TEAM_NAME } from './team-draft';

export function TeamsPage() {
  const navigate = useNavigate();
  const list = useSavedList(async () => (await api.listTeams()).teams);

  const duplicate = (summary: TeamSummary) =>
    list.run(async () => {
      const { team } = await api.getTeam(summary.id);
      const { id: _id, ...content } = team;
      await api.createTeam({ ...content, name: copyName(content.name) });
    });

  function playWith(summary: TeamSummary) {
    useSetup.getState().update({ teamSource: 'saved', teamId: summary.id, mode: summary.mode });
    navigate('/');
  }

  return (
    <SavedListLayout
      title="Equipos"
      newPath="/equipos/nuevo"
      newLabel="Nuevo equipo"
      listLabel="Equipos guardados"
      empty="Aún no tienes equipos guardados."
      list={list}
      renderImport={(close) => (
        <ImportSavedDialog
          title="Importar equipo"
          defaultName={DEFAULT_TEAM_NAME}
          onClose={close}
          onImport={async (request) => {
            const { team, adjustments } = await api.importTeam(request);
            const state: EditorLocationState = { importNotes: adjustments };
            navigate(`/equipos/${team.id}`, { state });
          }}
        />
      )}
    >
      {list.items?.map((summary) => (
        <SavedCard
          key={summary.id}
          summary={summary}
          editPath={`/equipos/${summary.id}`}
          useLabel="Usar en combate"
          onUse={() => playWith(summary)}
          onDuplicate={() => duplicate(summary)}
          onDelete={() => list.run(() => api.deleteTeam(summary.id))}
        />
      ))}
    </SavedListLayout>
  );
}
