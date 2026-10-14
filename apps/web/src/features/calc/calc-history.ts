/**
 * History of the damage calculator, remembered between visits. Every comparison the calculator
 * computes is recorded on its own: one entry per attacker → defender pair, with its latest
 * state to open it again.
 */
import type { CalcResponse } from '@colleja/protocol';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '../../stores/settings';
import type { CalcSetup } from './calc-store';

/** Comparisons kept; a new pair past this forgets the oldest. */
export const CALC_HISTORY_LIMIT = 50;

/** The damage of one attacker move, as the results table shows it. */
export interface MoveResult {
  move: string;
  result: CalcResponse | null;
  error?: string;
}

export interface CalcHistoryEntry {
  id: string;
  /** When it was last computed (ms since the epoch). */
  savedAt: number;
  setup: CalcSetup;
}

interface CalcHistoryState {
  entries: CalcHistoryEntry[];
  /**
   * Records a computed comparison first in the list. The same attacker → defender pair
   * replaces its earlier entry, so tweaking a set does not fill the history. Results that all
   * failed (server down) are not recorded.
   */
  record(setup: CalcSetup, results: MoveResult[], now?: number): void;
  remove(id: string): void;
}

/** Attacker → defender species: the identity of a comparison in the history. */
export function pairKey(setup: CalcSetup): string {
  return `${setup.attacker.set.species}>${setup.defender.set.species}`;
}

export function historyEntry(setup: CalcSetup, now: number): CalcHistoryEntry {
  return {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: now,
    setup: structuredClone(setup),
  };
}

export const useCalcHistory = create<CalcHistoryState>()(
  persist(
    (set) => ({
      entries: [],
      record: (setup, results, now = Date.now()) => {
        if (results.length === 0 || results.every((entry) => entry.error)) return;
        const entry = historyEntry(setup, now);
        const key = pairKey(setup);
        set((state) => ({
          entries: [entry, ...state.entries.filter((other) => pairKey(other.setup) !== key)].slice(
            0,
            CALC_HISTORY_LIMIT,
          ),
        }));
      },
      remove: (id) => set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),
    }),
    { name: 'colleja:calc-history', storage: createJSONStorage(() => safeStorage()) },
  ),
);
