/**
 * Where the team editor loads from and saves to. The same editor builds your teams
 * (`/equipos`, `/api/teams`) and the bot's saved opponents (`/rivales`, `/api/opponents`):
 * only the API calls, the routes and a few texts change.
 */
import type { GameMode } from '@colleja/data';
import type { OpponentResponse, TeamResponse } from '@colleja/protocol';
import { api } from '../../lib/api';
import {
  newDraft,
  newOpponentDraft,
  type TeamDraft,
  toContent,
  toOpponentContent,
} from './team-draft';

/** A saved draft as the server returned it. */
export interface SavedDraft {
  id: string;
  draft: TeamDraft;
  /** Problems of the saved version (`checkTeam`, then Showdown's validator). */
  problems: string[];
  updatedAt: string;
}

export interface EditorDestination {
  kind: 'teams' | 'opponents';
  /** Route of the list; the editor lives at `<path>/nuevo` and `<path>/:id`. */
  path: string;
  texts: {
    /** Back link to the list. */
    back: string;
    nameLabel: string;
    loading: string;
    unsaved: string;
    /** Button that takes the saved draft to the start screen. */
    use: string;
    useTitle: string;
    legal: string;
    leaveWarning: string;
  };
  newDraft(mode: GameMode): TeamDraft;
  load(id: string): Promise<SavedDraft>;
  /** Creates (`id === null`) or replaces the draft. */
  save(id: string | null, draft: TeamDraft): Promise<SavedDraft>;
}

export const TEAM_DESTINATION: EditorDestination = {
  kind: 'teams',
  path: '/equipos',
  texts: {
    back: '← Mis equipos',
    nameLabel: 'Nombre del equipo',
    loading: 'Cargando el equipo…',
    unsaved: 'Equipo nuevo sin guardar',
    use: 'Usar en combate',
    useTitle: 'Ir al inicio con este equipo',
    legal: 'Equipo legal',
    leaveWarning: 'Si sales ahora, perderás los cambios de este equipo.',
  },
  newDraft: (mode) => newDraft(mode),
  load: async (id) => fromTeam(await api.getTeam(id)),
  save: async (id, draft) =>
    fromTeam(
      id ? await api.updateTeam(id, toContent(draft)) : await api.createTeam(toContent(draft)),
    ),
};

export const OPPONENT_DESTINATION: EditorDestination = {
  kind: 'opponents',
  path: '/rivales',
  texts: {
    back: '← Mis rivales',
    nameLabel: 'Nombre del rival',
    loading: 'Cargando el rival…',
    unsaved: 'Rival nuevo sin guardar',
    use: 'Usar como rival',
    useTitle: 'Ir al inicio con este rival y su dificultad',
    legal: 'Rival legal',
    leaveWarning: 'Si sales ahora, perderás los cambios de este rival.',
  },
  newDraft: (mode) => newOpponentDraft(mode),
  load: async (id) => fromOpponent(await api.getOpponent(id)),
  save: async (id, draft) =>
    fromOpponent(
      id
        ? await api.updateOpponent(id, toOpponentContent(draft))
        : await api.createOpponent(toOpponentContent(draft)),
    ),
};

function fromTeam({ team, problems, updatedAt }: TeamResponse): SavedDraft {
  const { id, ...draft } = team;
  return { id, draft, problems, updatedAt };
}

function fromOpponent({ opponent, problems, updatedAt }: OpponentResponse): SavedDraft {
  const { id, ...draft } = opponent;
  return { id, draft, problems, updatedAt };
}
