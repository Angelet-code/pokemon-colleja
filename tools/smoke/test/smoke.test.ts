import { CHAMPIONS_FORMATS } from '@colleja/showdown';
import { describe, expect, it } from 'vitest';
import { FIXTURE_TEAMS, loadValidatedTeam } from '../src/fixtures';
import { runHeadlessBattle } from '../src/headless-battle';
import { fixtureScenario, randomScenario } from '../src/scenarios';

describe('fixture teams', () => {
  for (const name of FIXTURE_TEAMS) {
    for (const formatid of [CHAMPIONS_FORMATS.singles, CHAMPIONS_FORMATS.doubles]) {
      it(`${name} is legal in ${formatid}`, () => {
        const team = loadValidatedTeam(name, formatid);
        expect(team).toHaveLength(6);
        expect(team.every((set) => set.level === 50)).toBe(true);
      });
    }
  }
});

describe('headless battles', () => {
  it('completes a Champions doubles battle (VGC Reg M-C)', async () => {
    const result = await runHeadlessBattle(fixtureScenario('test', 'doubles').options);
    expect(result.turns).toBeGreaterThan(0);
    expect(result.log).toContain('|gametype|doubles');
  });

  it('completes a Champions singles battle (BSS Reg M-C)', async () => {
    const result = await runHeadlessBattle(fixtureScenario('test', 'singles').options);
    expect(result.turns).toBeGreaterThan(0);
    expect(result.log).toContain('|gametype|singles');
  });

  it('is deterministic: same seeds produce the same battle', async () => {
    for (const scenario of [
      fixtureScenario('det', 'doubles'),
      randomScenario('det', 'randomSingles', 0),
    ]) {
      const first = await runHeadlessBattle(scenario.options);
      const second = await runHeadlessBattle(scenario.options);
      expect(second.log).toEqual(first.log);
    }
  });

  it('different seeds produce different battles', async () => {
    const a = await runHeadlessBattle(fixtureScenario('seed-a', 'singles').options);
    const b = await runHeadlessBattle(fixtureScenario('seed-b', 'singles').options);
    expect(b.log).not.toEqual(a.log);
  });
});
