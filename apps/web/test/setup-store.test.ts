import { ClientMessageSchema } from '@colleja/protocol';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM, toStartMessage } from '../src/features/setup/setup-store';

describe('toStartMessage', () => {
  it('sends the pasted text or the saved team id, never both', () => {
    const pasted = toStartMessage({ ...DEFAULT_FORM, team: 'Garchomp', teamId: 'abc' });
    expect(pasted).toMatchObject({ team: 'Garchomp' });
    expect(pasted).not.toHaveProperty('teamId');

    const saved = toStartMessage({
      ...DEFAULT_FORM,
      teamSource: 'saved',
      teamId: 'abc',
      team: 'x',
    });
    expect(saved).toMatchObject({ teamId: 'abc' });
    expect(saved).not.toHaveProperty('team');
    expect(ClientMessageSchema.safeParse(saved).success).toBe(true);
  });
});
