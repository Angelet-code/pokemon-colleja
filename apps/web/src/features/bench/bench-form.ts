/**
 * The bench form, remembered between visits, and how it becomes a `POST /api/bench` request.
 * Pure functions (tested); the page only calls them.
 */
import type {
  BotLevelValue,
  GameModeValue,
  OpponentSummary,
  StartBenchRequest,
  TeamSummary,
} from '@colleja/protocol';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '../../stores/settings';

export type BenchModeChoice = GameModeValue | 'both';
/** `p5`/`p10`: stop at ± 5/10 points; `fixed`: `battles` per rival and mode. */
export type BenchPrecision = 'p5' | 'p10' | 'fixed';

export interface BenchForm {
  teamId: string;
  /** Version B of an A/B comparison: none, another saved team or pasted text. */
  versus: 'none' | 'saved' | 'text';
  versusTeamId: string;
  versusText: string;
  mode: BenchModeChoice;
  /** Chosen rivals; `null`: every legal rival of the mode. */
  opponentIds: string[] | null;
  teamLevel: BotLevelValue;
  opponentLevel: BotLevelValue;
  precision: BenchPrecision;
  battles: number;
}

export const DEFAULT_BENCH_FORM: BenchForm = {
  teamId: '',
  versus: 'none',
  versusTeamId: '',
  versusText: '',
  mode: 'doubles',
  opponentIds: null,
  teamLevel: 3,
  opponentLevel: 3,
  precision: 'p10',
  battles: 20,
};

/** Least battles per rival and mode before stopping, and the cap per rival and mode. */
export const MIN_PER_RIVAL = 6;
export const MAX_PER_RIVAL = 40;

interface BenchFormState extends BenchForm {
  update(changes: Partial<BenchForm>): void;
}

export const useBenchForm = create<BenchFormState>()(
  persist((set) => ({ ...DEFAULT_BENCH_FORM, update: (changes) => set(changes) }), {
    name: 'colleja:bench',
    storage: createJSONStorage(() => safeStorage()),
  }),
);

export function modesOf(mode: BenchModeChoice): GameModeValue[] {
  return mode === 'both' ? ['singles', 'doubles'] : [mode];
}

/** Rivals that fit the mode: legal, and of that mode unless both modes are measured. */
export function rivalsForMode(
  opponents: readonly OpponentSummary[],
  mode: BenchModeChoice,
): OpponentSummary[] {
  return opponents.filter(
    (opponent) => opponent.valid && (mode === 'both' || opponent.mode === mode),
  );
}

/** The rivals the bench will play: the chosen ones still available, or all of the mode. */
export function selectedRivals(
  form: BenchForm,
  opponents: readonly OpponentSummary[],
): OpponentSummary[] {
  const available = rivalsForMode(opponents, form.mode);
  if (form.opponentIds === null) return available;
  const chosen = new Set(form.opponentIds);
  return available.filter((opponent) => chosen.has(opponent.id));
}

/** Toggles one rival (starting from "all" when nothing was chosen yet). */
export function toggleRival(
  form: BenchForm,
  opponents: readonly OpponentSummary[],
  id: string,
): string[] {
  const current = selectedRivals(form, opponents).map((opponent) => opponent.id);
  return current.includes(id) ? current.filter((other) => other !== id) : [...current, id];
}

/** The request, or the Spanish reason it cannot be sent yet. */
export function toBenchRequest(
  form: BenchForm,
  teams: readonly TeamSummary[],
  opponents: readonly OpponentSummary[],
): { ok: true; request: StartBenchRequest } | { ok: false; reason: string } {
  const team = teams.find((candidate) => candidate.id === form.teamId);
  if (!team) return { ok: false, reason: 'Elige tu equipo.' };
  if (!team.valid) return { ok: false, reason: `«${team.name}» tiene problemas.` };
  const rivals = selectedRivals(form, opponents);
  if (rivals.length === 0) return { ok: false, reason: 'Elige al menos un rival.' };

  let versus: StartBenchRequest['versus'];
  if (form.versus === 'saved') {
    if (!form.versusTeamId || form.versusTeamId === form.teamId) {
      return { ok: false, reason: 'Elige otra versión del equipo para comparar.' };
    }
    versus = { kind: 'saved', teamId: form.versusTeamId };
  } else if (form.versus === 'text') {
    if (!form.versusText.trim()) return { ok: false, reason: 'Pega la versión B del equipo.' };
    versus = { kind: 'text', text: form.versusText, name: 'Versión B' };
  }

  const modes = modesOf(form.mode);
  const strata = rivals.length * modes.length;
  const budget: StartBenchRequest['budget'] =
    form.precision === 'fixed'
      ? { kind: 'fixed', battles: Math.min(200, Math.max(1, Math.round(form.battles))) }
      : {
          kind: 'adaptive',
          margin: form.precision === 'p5' ? 0.05 : 0.1,
          minPerStratum: MIN_PER_RIVAL,
          maxBattles: Math.min(5000, MAX_PER_RIVAL * strata),
        };
  return {
    ok: true,
    request: {
      teamId: team.id,
      ...(versus ? { versus } : {}),
      opponentIds: rivals.map((opponent) => opponent.id),
      modes,
      levels: { team: form.teamLevel, opponent: form.opponentLevel },
      budget,
    },
  };
}
