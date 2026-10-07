import { describe, expect, it } from 'vitest';
import { Battle, CHAMPIONS_FORMATS, Dex, Teams, TeamValidator, toID } from '../src/index';

const GARCHOMP = `
Garchomp @ Life Orb
Ability: Rough Skin
Level: 50
EVs: 2 HP / 32 Atk / 32 Spe
Jolly Nature
- Earthquake
- Dragon Claw
- Rock Slide
- Protect
`;

/** Validates a single set (team-level rules such as minimum team size are not involved). */
function validateSet(exported: string, formatid: string = CHAMPIONS_FORMATS.singles) {
  const [set] = Teams.import(exported) ?? [];
  if (!set) throw new Error('Set could not be imported');
  return TeamValidator.get(formatid).validateSet(set, {});
}

describe('vendored Showdown', () => {
  it('knows every Champions format we rely on', () => {
    for (const formatid of Object.values(CHAMPIONS_FORMATS)) {
      const format = Dex.formats.get(formatid);
      expect(format.exists, formatid).toBe(true);
      expect(format.mod).toBe('champions');
    }
  });

  it('uses doubles for VGC and singles for BSS', () => {
    expect(Dex.formats.get(CHAMPIONS_FORMATS.doubles).gameType).toBe('doubles');
    expect(Dex.formats.get(CHAMPIONS_FORMATS.singles).gameType).toBe('singles');
  });

  it('computes Champions stats from Stat Points (HP = B+SP+75, others = (B+SP+20)×nature)', () => {
    const team = Teams.pack(Teams.import(GARCHOMP));
    const battle = new Battle({
      formatid: toID(CHAMPIONS_FORMATS.singles),
      seed: 'sodium,00000000000000000000000000000000',
      p1: { name: 'A', team },
      p2: { name: 'B', team },
    });
    const garchomp = battle.p1.pokemon[0];
    if (!garchomp) throw new Error('Garchomp missing');

    // Garchomp base stats: 108 / 130 / 95 / 80 / 85 / 102. Jolly: +Spe, −SpA.
    expect(garchomp.maxhp).toBe(108 + 2 + 75);
    expect(garchomp.storedStats.atk).toBe(130 + 32 + 20);
    expect(garchomp.storedStats.def).toBe(95 + 0 + 20);
    expect(garchomp.storedStats.spa).toBe(Math.floor((80 + 0 + 20) * 0.9));
    expect(garchomp.storedStats.spe).toBe(Math.floor((102 + 32 + 20) * 1.1));
  });

  it('accepts a legal Stat Point spread', () => {
    expect(validateSet(GARCHOMP)).toBeNull();
  });

  it('rejects more than 32 Stat Points in one stat', () => {
    expect(validateSet(GARCHOMP.replace('32 Atk', '33 Atk'))).not.toBeNull();
  });

  it('rejects more than 66 Stat Points in total', () => {
    expect(validateSet(GARCHOMP.replace('2 HP', '3 HP'))).not.toBeNull();
  });
});
