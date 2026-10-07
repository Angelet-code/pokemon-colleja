/**
 * State of the team editor: the draft being edited and the last saved version (to know if
 * there are unsaved changes). Edits go through the pure operations of `team-draft.ts`; saving
 * is explicit and the server answers with the problems (Showdown's validator included).
 */
import type { GameMode } from '@colleja/data';
import type { TeamResponse } from '@colleja/protocol';
import { create } from 'zustand';
import { ApiRequestError, api } from '../../lib/api';
import { newDraft, sameDraft, type TeamDraft, toContent } from './team-draft';

export interface EditorError {
  message: string;
  details: string[];
}

interface TeamEditorState {
  /** `null` while the team has never been saved. */
  teamId: string | null;
  draft: TeamDraft;
  saved: TeamDraft;
  /** Member open in the set editor (-1: none). */
  selected: number;
  status: 'idle' | 'loading' | 'saving';
  loadError: string | null;
  saveError: EditorError | null;
  /** Problems the server reported for the saved version (Showdown's validator included). */
  serverProblems: string[];
  updatedAt: string | null;

  startNew(mode: GameMode): void;
  load(id: string): Promise<void>;
  edit(change: (draft: TeamDraft) => TeamDraft): void;
  select(index: number): void;
  /** Saves (creating the team the first time). Resolves to its id, or `null` on error. */
  save(): Promise<string | null>;
}

export const useTeamEditor = create<TeamEditorState>()((set, get) => ({
  teamId: null,
  draft: newDraft('singles'),
  saved: newDraft('singles'),
  selected: -1,
  status: 'idle',
  loadError: null,
  saveError: null,
  serverProblems: [],
  updatedAt: null,

  startNew: (mode) => {
    const draft = newDraft(mode);
    set({
      teamId: null,
      draft,
      saved: draft,
      selected: -1,
      status: 'idle',
      loadError: null,
      saveError: null,
      serverProblems: [],
      updatedAt: null,
    });
  },

  load: async (id) => {
    set({ status: 'loading', loadError: null, saveError: null, teamId: id });
    try {
      const response = await api.getTeam(id);
      if (get().teamId !== id) return;
      set({ ...fromResponse(response), selected: response.team.members.length > 0 ? 0 : -1 });
    } catch (error) {
      if (get().teamId !== id) return;
      set({ status: 'idle', loadError: errorMessage(error) });
    }
  },

  edit: (change) => {
    const draft = change(get().draft);
    const selected = Math.min(get().selected, draft.members.length - 1);
    set({ draft, selected });
  },

  select: (selected) => set({ selected }),

  save: async () => {
    const { teamId, draft } = get();
    set({ status: 'saving', saveError: null });
    try {
      const content = toContent(draft);
      const response = teamId
        ? await api.updateTeam(teamId, content)
        : await api.createTeam(content);
      // Keep edits made while saving; otherwise take the server's copy.
      const current = get().draft;
      set({ ...fromResponse(response), ...(current === draft ? {} : { draft: current }) });
      return response.team.id;
    } catch (error) {
      set({
        status: 'idle',
        saveError: {
          message: errorMessage(error),
          details: error instanceof ApiRequestError ? error.details : [],
        },
      });
      return null;
    }
  },
}));

function fromResponse(response: TeamResponse) {
  const { id: _id, ...content } = response.team;
  return {
    teamId: response.team.id,
    draft: content,
    saved: content,
    status: 'idle' as const,
    serverProblems: response.problems,
    updatedAt: response.updatedAt,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Unsaved changes? (A brand-new empty team counts as unchanged.) */
export function useIsDirty(): boolean {
  return useTeamEditor(isDirty);
}

export function isDirty(state: Pick<TeamEditorState, 'draft' | 'saved'>): boolean {
  return !sameDraft(state.draft, state.saved);
}
