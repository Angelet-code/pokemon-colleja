import { describe, expect, it } from 'vitest';
import { type MoveCue, planBeats } from '../src/features/battle/animation/timeline';

// Turns of a real doubles battle (p1 perspective, level 2 against level 2).
const LEADS = [
  '|start',
  '|switch|p1a: Archaludon|Archaludon, L50, F|197/197',
  '|switch|p1b: Basculegion|Basculegion-F, L50, F|195/195',
  '|switch|p2a: Medicham|Medicham, L50, M|100/100',
  '|switch|p2b: Rotom|Rotom-Fan, L50|100/100',
  '|turn|1',
];

const TURN_1 = [
  '|',
  '|t:|1760000000',
  '|switch|p1a: Tinkaton|Tinkaton, L50, F|192/192',
  '|move|p2a: Medicham|Protect|p2a: Medicham',
  '|-singleturn|p2a: Medicham|Protect',
  '|move|p1b: Basculegion|Wave Crash|p2a: Medicham',
  '|-activate|p2a: Medicham|move: Protect',
  '|move|p2b: Rotom|Thunderbolt|p1b: Basculegion',
  '|-supereffective|p1b: Basculegion|1',
  '|-damage|p1b: Basculegion|0 fnt',
  '|faint|p1b: Basculegion',
  '|',
  '|upkeep',
];

const SPREAD = [
  '|',
  '|switch|p2a: Sinistcha|Sinistcha, L50|100/100',
  '|move|p1b: Barbaracle|Rock Slide|p2a: Sinistcha|[spread] p2a,p2b',
  '|-supereffective|p2b: Rotom|1',
  '|-damage|p2a: Sinistcha|69/100',
  '|-damage|p2b: Rotom|37/100',
  '|-enditem|p2b: Rotom|Sitrus Berry|[eat]',
  '|-heal|p2b: Rotom|62/100|[from] item: Sitrus Berry',
  '|move|p1a: Tinkaton|Play Rough|p2b: Rotom',
  '|-damage|p2b: Rotom|35/100',
  '|cant|p2b: Rotom|flinch',
  '|',
  '|-heal|p2a: Sinistcha|75/100|[from] item: Leftovers',
  '|upkeep',
  '|turn|4',
];

function moves(lines: string[]): MoveCue[] {
  return planBeats(lines)
    .map((beat) => beat.cue)
    .filter((cue): cue is MoveCue => cue.kind === 'move');
}

describe('animation timeline', () => {
  it('keeps every line, in order, in exactly one beat', () => {
    for (const lines of [LEADS, TURN_1, SPREAD]) {
      expect(planBeats(lines).flatMap((beat) => beat.lines)).toEqual(lines);
    }
  });

  it('brings the leads in together', () => {
    const beats = planBeats(LEADS);
    expect(beats).toHaveLength(1);
    expect(beats[0]?.cue).toEqual({ kind: 'switch', slots: ['p1a', 'p1b', 'p2a', 'p2b'] });
  });

  it('plays the actions in the order of the turn', () => {
    const kinds = planBeats(TURN_1).map((beat) => beat.cue.kind);
    expect(kinds).toEqual(['switch', 'move', 'move', 'move', 'faint']);
    expect(moves(TURN_1).map((cue) => `${cue.user}:${cue.move}`)).toEqual([
      'p2a:protect',
      'p1b:wavecrash',
      'p2b:thunderbolt',
    ]);
  });

  it('marks a hit blocked by Protect and a super effective KO', () => {
    const [protect, blocked, bolt] = moves(TURN_1);
    expect(protect?.targets).toEqual(['p2a']);
    expect(blocked).toMatchObject({ targets: ['p2a'], blocked: ['p2a'], hits: [] });
    expect(bolt?.hits).toEqual([
      { slot: 'p1b', effectiveness: 'super', crit: false, damaged: true },
    ]);
  });

  it('hits both targets of a spread move and leaves the berry as its own beat', () => {
    const beats = planBeats(SPREAD);
    expect(beats.map((beat) => beat.cue.kind)).toEqual([
      'switch',
      'move',
      'reveal',
      'residual',
      'move',
      'cant',
      'residual',
    ]);
    const [slide] = moves(SPREAD);
    expect(slide?.spread).toBe(true);
    expect(slide?.targets).toEqual(['p2a', 'p2b']);
    expect(slide?.hits.map((hit) => `${hit.slot}:${hit.effectiveness}`)).toEqual([
      'p2b:super',
      'p2a:normal',
    ]);
    // The upkeep and the next turn header ride along with the last beat.
    expect(beats.at(-1)?.lines.slice(-2)).toEqual(['|upkeep', '|turn|4']);
  });

  it('gives a boosting move its own stat changes and does not swallow the upkeep', () => {
    const beats = planBeats([
      '|move|p1b: Barbaracle|Shell Smash|p1b: Barbaracle',
      '|-unboost|p1b: Barbaracle|def|1',
      '|-unboost|p1b: Barbaracle|spd|1',
      '|-boost|p1b: Barbaracle|atk|2',
      '|',
      '|-weather|RainDance|[upkeep]',
      '|upkeep',
    ]);
    expect(beats.map((beat) => beat.cue.kind)).toEqual(['move', 'weather']);
    expect((beats[0]?.cue as MoveCue | undefined)?.boosts).toEqual([
      {
        slot: 'p1b',
        changes: [
          { stat: 'def', amount: -1 },
          { stat: 'spd', amount: -1 },
          { stat: 'atk', amount: 2 },
        ],
      },
    ]);
    expect(beats[1]?.cue).toEqual({ kind: 'weather', weather: 'raindance', upkeep: true });
  });

  it('records misses, crits, drain, recoil and status', () => {
    const [heat, punch, wisp, edge] = moves([
      '|move|p2b: Charizard|Heat Wave|p1a: Tinkaton|[spread] p1a',
      '|-miss|p2b: Charizard|p1b: Barbaracle',
      '|-crit|p1a: Tinkaton',
      '|-damage|p1a: Tinkaton|52/192',
      '|move|p1a: Conkeldurr|Drain Punch|p2a: Snorlax',
      '|-damage|p2a: Snorlax|60/100',
      '|-heal|p1a: Conkeldurr|180/190|[from] drain|[of] p2a: Snorlax',
      '|move|p2a: Gengar|Will-O-Wisp|p1a: Conkeldurr',
      '|-status|p1a: Conkeldurr|brn',
      '|move|p1a: Staraptor|Double-Edge|p2a: Gengar|[miss]',
      '|-miss|p1a: Staraptor|p2a: Gengar',
    ]);
    expect(heat).toMatchObject({ missed: ['p1b'], hits: [{ slot: 'p1a', crit: true }] });
    expect(punch?.drained).toBe(true);
    expect(wisp?.statuses).toEqual([{ slot: 'p1a', status: 'brn' }]);
    expect(edge?.missed).toEqual(['p2a']);
  });

  it('turns a Mega Evolution into one beat', () => {
    const beats = planBeats([
      '|detailschange|p1b: Barbaracle|Barbaracle-Mega, L50, M',
      '|-mega|p1b: Barbaracle|Barbaracle|Barbaracite',
      '|move|p1b: Barbaracle|Protect|p1b: Barbaracle',
    ]);
    expect(beats.map((beat) => beat.cue)).toMatchObject([
      { kind: 'mega', slot: 'p1b' },
      { kind: 'move', move: 'protect' },
    ]);
    expect(beats[0]?.lines).toHaveLength(2);
  });

  it('does not lose lines without a cue', () => {
    const lines = ['|-start|p1a: Gengar|confusion', '|-activate|p1a: Gengar|confusion', '|'];
    const beats = planBeats(lines);
    expect(beats.flatMap((beat) => beat.lines)).toEqual(lines);
    expect(beats.every((beat) => beat.cue.kind === 'none')).toBe(true);
  });
});
