/**
 * State of the team editor: the draft being edited and the last saved version (to know if
 * there are unsaved changes). Edits go through the pure operations of `team-draft.ts`; saving
 * is explicit and the server answers with the problems (Showdown's validator included).
 *
 * The same store edits your teams and the saved opponents: the `destination` says where the
 * draft is loaded from and saved to.
 */
import type { GameMode } from '@colleja/data';
import { create } from 'zustand';
import { ApiRequestError } from '../../lib/api';
import { type EditorDestination, type SavedDraft, TEAM_DESTINATION } from './editor-destination';
import { newDraft, sameDraft, type TeamDraft } from './team-draft';

export interface EditorError {
  message: string;
  details: string[];
}

interface TeamEditorState {
  destination: EditorDestination;
  /** `null` while the draft has never been saved. */
  savedId: string | null;
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

  /**
   * Starts a new draft. With `initial` (a generated or copied team) the editor opens with it
   * as unsaved changes; otherwise it starts empty.
   */
  startNew(destination: EditorDestination, mode: GameMode, initial?: TeamDraft): void;
  load(destination: EditorDestination, id: string): Promise<void>;
  edit(change: (draft: TeamDraft) => TeamDraft): void;
  select(index: number): void;
  /** Saves (creating it the first time). Resolves to its id, or `null` on error. */
  save(): Promise<string | null>;
}

export const useTeamEditor = create<TeamEditorState>()((set, get) => ({
  destination: TEAM_DESTINATION,
  savedId: null,
  draft: newDraft('singles'),
  saved: newDraft('singles'),
  selected: -1,
  status: 'idle',
  loadError: null,
  saveError: null,
  serverProblems: [],
  updatedAt: null,

  startNew: (destination, mode, initial) => {
    const empty = destination.newDraft(mode);
    const draft = initial ?? empty;
    set({
      destination,
      savedId: null,
      draft,
      saved: empty,
      selected: draft.members.length > 0 ? 0 : -1,
      status: 'idle',
      loadError: null,
      saveError: null,
      serverProblems: [],
      updatedAt: null,
    });
  },

  load: async (destination, id) => {
    set({ destination, status: 'loading', loadError: null, saveError: null, savedId: id });
    try {
      const loaded = await destination.load(id);
      if (get().savedId !== id || get().destination !== destination) return;
      set({ ...fromSaved(loaded), selected: loaded.draft.members.length > 0 ? 0 : -1 });
    } catch (error) {
      if (get().savedId !== id || get().destination !== destination) return;
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
    const { destination, savedId, draft } = get();
    set({ status: 'saving', saveError: null });
    try {
      const saved = await destination.save(savedId, draft);
      // Keep edits made while saving; otherwise take the server's copy.
      const current = get().draft;
      set({ ...fromSaved(saved), ...(current === draft ? {} : { draft: current }) });
      return saved.id;
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

function fromSaved({ id, draft, problems, updatedAt }: SavedDraft) {
  return {
    savedId: id,
    draft,
    saved: draft,
    status: 'idle' as const,
    serverProblems: problems,
    updatedAt,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Unsaved changes? (A brand-new empty draft counts as unchanged.) */
export function useIsDirty(): boolean {
  return useTeamEditor(isDirty);
}

export function isDirty(state: Pick<TeamEditorState, 'draft' | 'saved'>): boolean {
  return !sameDraft(state.draft, state.saved);
}
