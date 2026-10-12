/** The start form, remembered between visits (the last pasted team above all). */
import type { BotLevelValue, GameModeValue, StartBattleMessage } from '@colleja/protocol';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '../../stores/settings';

export interface SetupForm {
  mode: GameModeValue;
  /** Your team: one saved in the teambuilder or pasted as text. */
  teamSource: 'saved' | 'text';
  teamId: string;
  team: string;
  /** The bot's team: random, a saved opponent, a metagame team or pasted as text. */
  opponentKind: 'random' | 'saved' | 'metagame' | 'team';
  opponentId: string;
  /** The metagame team (`opponentKind: 'metagame'`). */
  metagameSnapshotId: string;
  metagameTeamId: string;
  opponentTeam: string;
  botLevel: BotLevelValue;
  teamPreview: boolean;
  openTeamSheets: boolean;
  seed: string;
  playerName: string;
}

interface SetupState extends SetupForm {
  update(changes: Partial<SetupForm>): void;
}

export const DEFAULT_FORM: SetupForm = {
  mode: 'singles',
  teamSource: 'text',
  teamId: '',
  team: '',
  opponentKind: 'random',
  opponentId: '',
  metagameSnapshotId: '',
  metagameTeamId: '',
  opponentTeam: '',
  botLevel: 3,
  teamPreview: true,
  openTeamSheets: false,
  seed: '',
  playerName: '',
};

export const useSetup = create<SetupState>()(
  persist(
    (set) => ({
      ...DEFAULT_FORM,
      update: (changes) => set(changes),
    }),
    { name: 'colleja:setup', storage: createJSONStorage(() => safeStorage()) },
  ),
);

/** The `battle:start` message for a form. */
export function toStartMessage(form: SetupForm): StartBattleMessage {
  return {
    type: 'battle:start',
    mode: form.mode,
    ...(form.teamSource === 'saved' ? { teamId: form.teamId } : { team: form.team }),
    opponent: opponentOf(form),
    botLevel: form.botLevel,
    options: { teamPreview: form.teamPreview, openTeamSheets: form.openTeamSheets },
    ...(form.seed.trim() ? { seed: form.seed.trim() } : {}),
    ...(form.playerName.trim() ? { playerName: form.playerName.trim() } : {}),
  };
}

function opponentOf(form: SetupForm): StartBattleMessage['opponent'] {
  switch (form.opponentKind) {
    case 'saved':
      return { kind: 'saved', opponentId: form.opponentId };
    case 'metagame':
      return {
        kind: 'metagame',
        snapshotId: form.metagameSnapshotId,
        teamId: form.metagameTeamId,
      };
    case 'team':
      return { kind: 'team', team: form.opponentTeam };
    default:
      return { kind: 'random' };
  }
}
