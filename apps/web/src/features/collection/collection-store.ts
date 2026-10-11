/**
 * The player's collection («PC de Bill»), shared by its page and the teambuilder filter. Like
 * every saved thing it only changes with the server's answer: the order (National Dex) is the
 * server's.
 */
import { create } from 'zustand';
import { api } from '../../lib/api';

interface CollectionState {
  /** Owned species; `null` until the first load. */
  species: string[] | null;
  error: string | null;
  saving: boolean;
  /** Loads it once (later calls do nothing unless `force`). */
  load(force?: boolean): Promise<void>;
  add(species: string): Promise<void>;
  remove(species: string): Promise<void>;
}

export const useCollection = create<CollectionState>()((set, get) => {
  async function save(species: string[]) {
    set({ saving: true });
    try {
      const response = await api.saveCollection({ species });
      set({ species: response.collection.species, error: null });
    } catch (cause) {
      set({ error: message(cause) });
    } finally {
      set({ saving: false });
    }
  }

  return {
    species: null,
    error: null,
    saving: false,
    async load(force = false) {
      if (get().species && !force) return;
      try {
        const response = await api.getCollection();
        set({ species: response.collection.species, error: null });
      } catch (cause) {
        set({ error: message(cause) });
      }
    },
    async add(species) {
      const current = get().species ?? [];
      if (current.includes(species)) return;
      await save([...current, species]);
    },
    async remove(species) {
      await save((get().species ?? []).filter((owned) => owned !== species));
    },
  };
});

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
