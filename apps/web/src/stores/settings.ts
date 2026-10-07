/** Per-browser preferences: theme and language of the names (remembered in localStorage). */
import type { Locale } from '@colleja/data';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

interface SettingsState {
  theme: Theme;
  /** Language of Pokémon, move, item and ability names. The UI and the log stay in Spanish. */
  namesLocale: Locale;
  toggleTheme(): void;
  setNamesLocale(locale: Locale): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      namesLocale: 'es',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      setNamesLocale: (namesLocale) => set({ namesLocale }),
    }),
    { name: 'colleja:settings', storage: createJSONStorage(() => safeStorage()) },
  ),
);

/** Keeps the `dark` class of <html> in sync with the theme. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

/** localStorage can be unavailable (private mode, blocked site data): fall back to memory. */
export function safeStorage(): Storage {
  try {
    const probe = '__colleja__';
    localStorage.setItem(probe, probe);
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      get length() {
        return memory.size;
      },
      clear: () => memory.clear(),
      getItem: (key) => memory.get(key) ?? null,
      key: (index) => [...memory.keys()][index] ?? null,
      removeItem: (key) => void memory.delete(key),
      setItem: (key, value) => void memory.set(key, value),
    };
  }
}
