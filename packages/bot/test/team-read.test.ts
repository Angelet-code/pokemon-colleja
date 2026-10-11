import type { PokemonSet } from '@colleja/core';
import { describe, expect, it } from 'vitest';
import {
  archetypeStrength,
  EVEN_VALUES,
  groupSynergy,
  leadSynergy,
  type MemberRead,
  NO_VALUES,
  readMembers,
  readTeam,
} from '../src/analysis/team-read';
import { set } from './helpers';

const farigiraf = set('farigiraf', ['trickroom', 'hypervoice', 'psychic', 'protect']);
const torkoal = set('torkoal', ['eruption', 'heatwave', 'earthpower', 'protect'], {
  ability: 'drought',
});
const kingambit = set('kingambit', ['kowtowcleave', 'ironhead', 'suckerpunch', 'protect']);
const whimsicott = set('whimsicott', ['tailwind', 'moonblast', 'encore', 'protect'], {
  ability: 'prankster',
});
const garchomp = set('garchomp', ['earthquake', 'dragonclaw', 'rockslide', 'protect']);
const dragonite = set('dragonite', ['extremespeed', 'dragonclaw', 'firepunch', 'protect']);
const pelipper = set('pelipper', ['hurricane', 'weatherball', 'tailwind', 'protect'], {
  ability: 'drizzle',
});
const basculegion = set('basculegion', ['wavecrash', 'lastrespects', 'aquajet', 'protect'], {
  ability: 'swiftswim',
});
const indeedee = set('indeedeef', ['followme', 'psychic', 'helpinghand', 'protect'], {
  ability: 'psychicsurge',
});
const gholdengo = set('gholdengo', ['makeitrain', 'shadowball', 'nastyplot', 'protect']);
const sylveon = set('sylveon', ['hypervoice', 'moonblast', 'protect', 'calmmind']);
const snorlax = set('snorlax', ['bodyslam', 'protect', 'rest', 'curse']);

const read = (team: PokemonSet[]) =>
  readMembers(
    'p1',
    team.map((member) => [{ set: member, weight: 1 }]),
  );
const all = (team: readonly MemberRead[]) => team.map((_, index) => index);
const byRank = (team: readonly MemberRead[], picked = 4) =>
  readTeam(
    team,
    picked,
    2,
    () => 0,
    () => 0,
  );

describe('team read', () => {
  it('tells who sets each archetype up and who profits', () => {
    const [giraf, tork, gambit, whimsi, chomp] = read([
      farigiraf,
      torkoal,
      kingambit,
      whimsicott,
      garchomp,
    ]);
    expect(giraf?.roles.trickroom.setter).toBe(1);
    expect(tork?.roles.trickroom.abuser).toBe(1);
    expect(tork?.roles.sun.setter).toBe(1);
    expect(gambit?.roles.trickroom.abuser).toBe(1);
    expect(whimsi?.roles.tailwind.setter).toBe(1);
    // Whimsicott only has one attack: it does not count as an attacker.
    expect(whimsi?.roles.tailwind.abuser).toBe(0);
    expect(chomp?.roles.tailwind.abuser).toBe(1);
    expect(chomp?.roles.trickroom.abuser).toBe(0);
  });

  it('weighs the sets the bot considers for a rival', () => {
    const [member] = readMembers('p2', [
      [
        { set: farigiraf, weight: 3 },
        {
          set: { ...farigiraf, moves: ['hypervoice', 'psychic', 'protect', 'foulplay'] },
          weight: 1,
        },
      ],
    ]);
    expect(member?.roles.trickroom.setter).toBeCloseTo(0.75);
  });

  it('reads a Trick Room team: its setter, its slow attackers and the group that keeps them', () => {
    const team = read([garchomp, farigiraf, dragonite, torkoal, snorlax, kingambit]);
    const reading = byRank(team);
    const trickRoom = reading.archetypes.find((archetype) => archetype.kind === 'trickroom');
    expect(trickRoom).toMatchObject({ strength: 1, setters: ['farigiraf'] });
    expect(trickRoom?.abusers).toEqual(expect.arrayContaining(['torkoal', 'kingambit']));
    expect(reading.archetypes[0]?.kind).toBe('trickroom');
    expect(reading.group).toEqual(expect.arrayContaining(['farigiraf', 'torkoal', 'kingambit']));
    // Speed control starts on the field.
    expect(reading.leads).toContain('farigiraf');
  });

  it('reads rain and setup behind redirection, with both pieces leading', () => {
    const rain = byRank(read([pelipper, basculegion, garchomp, sylveon, snorlax, dragonite]));
    expect(rain.archetypes.map((archetype) => archetype.kind)).toContain('rain');
    expect(rain.leads).toEqual(expect.arrayContaining(['pelipper', 'basculegion']));

    const setup = byRank(read([indeedee, gholdengo, garchomp, snorlax, sylveon, kingambit]));
    const reading = setup.archetypes.find((archetype) => archetype.kind === 'setup');
    expect(reading?.setters).toEqual(['indeedeef']);
    expect(reading?.abusers).toEqual(expect.arrayContaining(['gholdengo']));
    expect(setup.leads).toEqual(expect.arrayContaining(['indeedeef']));
  });

  it('finds no plan in a team without setters', () => {
    const reading = byRank(read([garchomp, dragonite, sylveon, kingambit, snorlax, gholdengo]));
    expect(reading).toEqual({ archetypes: [] });
  });

  it('values a group by the archetypes it keeps complete', () => {
    const team = read([farigiraf, torkoal, kingambit, garchomp, dragonite, sylveon]);
    expect(archetypeStrength(team, 'trickroom', all(team), all(team))).toBe(1);
    // Without the setter, or with a single slow attacker, Trick Room is not there.
    expect(groupSynergy(team, [1, 2, 3, 4], EVEN_VALUES)).toBe(0);
    expect(archetypeStrength(team, 'trickroom', [0, 1, 3, 4], [0, 1, 3, 4])).toBe(0.5);
    expect(groupSynergy(team, [0, 1, 2, 3], { ...NO_VALUES, trickroom: 40 })).toBe(40);
    expect(groupSynergy(team, [0, 1, 2, 3], NO_VALUES)).toBe(0);
  });

  it('values a lead pair by the plan it starts', () => {
    const team = read([farigiraf, torkoal, kingambit, pelipper, basculegion, sylveon]);
    const values = { ...NO_VALUES, trickroom: 1, rain: 1 };
    // Trick Room: the setter leads, its abusers may wait behind.
    expect(leadSynergy(team, [0, 5], [0, 1, 2, 5], values)).toBe(1);
    expect(leadSynergy(team, [1, 2], [0, 1, 2, 5], values)).toBe(0);
    // Rain: Pelipper and its Swift Swim partner must lead together.
    expect(leadSynergy(team, [3, 4], [3, 4, 0, 5], values)).toBe(1);
    expect(leadSynergy(team, [3, 5], [3, 4, 0, 5], values)).toBe(0);
  });
});
