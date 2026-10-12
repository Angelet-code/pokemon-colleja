/**
 * Per-browser preferences: theme, language of the names, battle animations and the «PC de Bill»
 * filter of the teambuilder (remembered in localStorage).
 */
import type { Locale } from '@colleja/data';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

/** Battle animations: `fast` plays them at double speed, `off` shows every turn at once. */
export type AnimationSpeed = 'normal' | 'fast' | 'off';

/** Speed factor of each setting (`off` has none). */
export const ANIMATION_FACTOR: Record<Exclude<AnimationSpeed, 'off'>, number> = {
  normal: 1,
  fast: 2,
};

interface SettingsState {
  theme: Theme;
  /** Language of Pokémon, move, item and ability names. The UI and the log stay in Spanish. */
  namesLocale: Locale;
  /** The teambuilder only offers the species of the «PC de Bill» (when it has any). */
  onlyCollection: boolean;
  animations: AnimationSpeed;
  toggleTheme(): void;
  setNamesLocale(locale: Locale): void;
  setOnlyCollection(onlyCollection: boolean): void;
  setAnimations(animations: AnimationSpeed): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      namesLocale: 'es',
      onlyCollection: false,
      animations: prefersReducedMotion() ? 'off' : 'normal',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      setNamesLocale: (namesLocale) => set({ namesLocale }),
      setOnlyCollection: (onlyCollection) => set({ onlyCollection }),
      setAnimations: (animations) => set({ animations }),
    }),
    { name: 'colleja:settings', storage: createJSONStorage(() => safeStorage()) },
  ),
);

/** With reduced motion asked by the system, animations start off (they can be turned on). */
function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

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
