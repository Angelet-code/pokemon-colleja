import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  championsStats,
  checkTeam,
  checkTeamIssues,
  emptyStatTable,
  fitTeamToLimits,
  formatShowdownTeam,
  getStatCalculator,
  getStatPointLimits,
  natureModifier,
  type PokemonSet,
  parseShowdownTeam,
  remainingStatPoints,
  setStatPoint,
  statPointProblems,
  totalStatPoints,
} from '../src/index';

function fixtureText(name: 'equipo-a' | 'equipo-b'): string {
  return readFileSync(
    new URL(`../../../tools/smoke/fixtures/${name}.txt`, import.meta.url),
    'utf8',
  );
}

function fixture(name: 'equipo-a' | 'equipo-b'): PokemonSet[] {
  return parseShowdownTeam(fixtureText(name)).sets;
}

const sp = (hp: number, atk: number, def: number, spa: number, spd: number, spe: number) => ({
  hp,
  atk,
  def,
  spa,
  spd,
  spe,
});

describe('Champions stats', () => {
  // Expected values checked against the engine (see also the engine test over all standard sets).
  it.each([
    ['garchomp', 'jolly', sp(2, 32, 0, 0, 0, 32), sp(185, 182, 115, 90, 105, 169)],
    ['incineroar', 'adamant', sp(32, 2, 16, 0, 16, 0), sp(202, 150, 126, 90, 126, 80)],
    ['gholdengo', 'modest', sp(2, 0, 0, 32, 0, 32), sp(164, 72, 115, 203, 111, 136)],
    ['sinistcha', 'bold', sp(32, 0, 32, 2, 0, 0), sp(178, 72, 173, 143, 100, 90)],
    ['kingambit', 'serious', sp(0, 0, 0, 0, 0, 0), sp(175, 155, 140, 80, 105, 70)],
  ])('%s %s', (species, nature, statPoints, expected) => {
    expect(championsStats({ species, nature, statPoints })).toEqual(expected);
  });

  it('can compute the stats of the Mega Evolution', () => {
    const charizard = { species: 'charizard', nature: 'timid', statPoints: sp(2, 0, 0, 32, 0, 32) };
    const mega = championsStats(charizard, { species: 'charizardmegay' });
    expect(mega.spa).toBe(159 + 32 + 20);
    expect(mega.hp).toBe(championsStats(charizard).hp);
  });

  it('applies natures as integer percentages', () => {
    expect(natureModifier('adamant', 'atk')).toBe(110);
    expect(natureModifier('adamant', 'spa')).toBe(90);
    expect(natureModifier('adamant', 'spe')).toBe(100);
    expect(natureModifier('adamant', 'hp')).toBe(100);
    expect(getStatCalculator('champions-regmc')).toBe(championsStats);
  });
});

describe('Stat Points', () => {
  const limits = getStatPointLimits('singles');

  it('reads the limits from the format', () => {
    expect(limits).toEqual({ total: 66, perStat: 32 });
    expect(getStatPointLimits('doubles')).toEqual(limits);
  });

  it('counts and clamps', () => {
    const spread = sp(32, 32, 0, 0, 0, 0);
    expect(totalStatPoints(spread)).toBe(64);
    expect(remainingStatPoints(spread, limits)).toBe(2);
    expect(setStatPoint(spread, 'spe', 20, limits).spe).toBe(2);
    expect(setStatPoint(spread, 'hp', 40, limits).hp).toBe(32);
    expect(setStatPoint(spread, 'hp', -3, limits).hp).toBe(0);
    expect(setStatPoint(emptyStatTable(), 'def', 12.7, limits).def).toBe(12);
  });

  it('reports illegal spreads in Spanish', () => {
    expect(statPointProblems(sp(32, 32, 2, 0, 0, 0), limits)).toEqual([]);
    expect(statPointProblems(sp(33, 0, 0, 0, 0, 0), limits)).toEqual([
      'PS: 33 Stat Points (máximo 32 por stat).',
    ]);
    expect(statPointProblems(sp(32, 32, 3, 0, 0, 0), limits)).toEqual([
      '67 Stat Points en total (máximo 66).',
    ]);
  });
});

describe('Showdown import/export', () => {
  it.each(['equipo-a', 'equipo-b'] as const)('round-trips %s exactly', (name) => {
    const { sets, problems } = parseShowdownTeam(fixtureText(name));
    expect(problems).toEqual([]);
    expect(sets).toHaveLength(6);
    expect(formatShowdownTeam(sets)).toBe(fixtureText(name).trim().replace(/\r\n/g, '\n'));
    expect(parseShowdownTeam(formatShowdownTeam(sets)).sets).toEqual(sets);
  });

  it('parses ids, Stat Points, nickname, gender, shiny and ignores classic fields', () => {
    const text = [
      '=== [gen9] Mi equipo ===',
      '',
      'Chompy (Garchomp) (F) @ Life Orb',
      'Ability: Rough Skin',
      'Level: 50',
      'Shiny: Yes',
      'Tera Type: Ground',
      'EVs: 2 HP / 32 Atk / 32 Spe',
      'IVs: 0 SpA',
      'Jolly Nature',
      '- Earthquake',
      '- Dragon Claw / Outrage',
    ].join('\r\n');
    const { sets, problems } = parseShowdownTeam(text);
    expect(problems).toEqual([]);
    expect(sets).toEqual([
      {
        species: 'garchomp',
        nickname: 'Chompy',
        gender: 'F',
        item: 'lifeorb',
        ability: 'roughskin',
        nature: 'jolly',
        shiny: true,
        statPoints: sp(2, 32, 0, 0, 0, 32),
        moves: ['earthquake', 'dragonclaw'],
      },
    ]);
    expect(formatShowdownTeam(sets)).toContain('Chompy (Garchomp) (F) @ Life Orb');
  });

  it('reports unknown names and Mega formes', () => {
    const { sets, problems } = parseShowdownTeam(
      [
        'Missingno',
        '- Tackle',
        '',
        'Charizard-Mega-Y @ Charizardite Y',
        'Ability: Drought',
        'Timid Nature',
        '- Heat Wave',
        '- Fake Move',
        '',
        'Garchomp @ Unknown Thing',
        'Ability: Rough Skin',
        'Sassy Nature',
        '- Earthquake',
      ].join('\n'),
    );
    expect(sets.map((set) => set.species)).toEqual(['charizard', 'garchomp']);
    expect(problems).toHaveLength(4);
    expect(problems[0]).toContain('especie desconocida');
    expect(problems.join('\n')).toContain('Fake Move');
    expect(problems.join('\n')).toContain('Unknown Thing');
  });
});

describe('client-side team checks', () => {
  it('accepts the fixture teams', () => {
    expect(checkTeam(fixture('equipo-a'), 'singles')).toEqual([]);
    expect(checkTeam(fixture('equipo-b'), 'doubles')).toEqual([]);
  });

  it('finds size, clause, learnset, ability and Stat Point problems', () => {
    const [incineroar, charizard, ...rest] = fixture('equipo-a');
    if (!incineroar || !charizard) throw new Error('missing');
    const problems = checkTeam(
      [
        { ...incineroar, moves: ['knockoff'], ability: 'levitate' },
        { ...charizard, item: 'sitrusberry', statPoints: sp(33, 0, 0, 0, 0, 0) },
        incineroar,
        ...rest.slice(0, 2),
      ],
      'singles',
    );
    expect(problems).toEqual([
      'El equipo debe tener 6 Pokémon (tiene 5).',
      'Pokémon 1 (Incineroar): Incineroar no puede tener la habilidad Levitación.',
      'Pokémon 1 (Incineroar): Incineroar no puede aprender Desarme en Champions.',
      'Pokémon 2 (Charizard): PS: 33 Stat Points (máximo 32 por stat).',
      'Cláusula de especie: Incineroar y Incineroar son el mismo Pokémon.',
      'Cláusula de objeto: Baya Zidra está repetido.',
    ]);
  });

  it('says which member and field causes each problem', () => {
    const [incineroar, charizard, ...rest] = fixture('equipo-a');
    if (!incineroar || !charizard) throw new Error('missing');
    const issues = checkTeamIssues(
      [
        { ...incineroar, ability: 'levitate' },
        { ...charizard, item: incineroar.item },
        incineroar,
        ...rest.slice(0, 3),
      ],
      'singles',
    );
    expect(issues.map(({ kind, member, field }) => ({ kind, member, field }))).toEqual([
      { kind: 'set', member: 0, field: 'ability' },
      { kind: 'clause', member: 2, field: 'species' },
      { kind: 'clause', member: 1, field: 'item' },
      { kind: 'clause', member: 2, field: 'item' },
    ]);
  });

  it('marks every extra holder of a repeated item but reports the clause once', () => {
    const sets = fixture('equipo-a');
    const item = sets[0]?.item;
    const repeated = sets.map((set, index) => (index < 3 ? { ...set, item } : set));
    const issues = checkTeamIssues(repeated, 'singles').filter((issue) => issue.field === 'item');
    expect(issues.map((issue) => issue.member)).toEqual([1, 2]);
    expect(checkTeam(repeated, 'singles')).toEqual([
      'Cláusula de objeto: Baya Zidra está repetido.',
    ]);
  });
});

describe('team limits', () => {
  it('leaves sets that fit untouched', () => {
    const sets = fixture('equipo-a');
    expect(fitTeamToLimits(sets, 'singles')).toEqual({ sets, adjustments: [] });
  });

  it('fits imported text to 6 members, 4 moves, legal spreads and short nicknames', () => {
    const [first, ...rest] = fixture('equipo-a');
    if (!first) throw new Error('missing');
    const { sets, adjustments } = fitTeamToLimits(
      [
        {
          ...first,
          nickname: 'Un mote larguísimo de verdad',
          moves: [...first.moves, 'protect', 'protect'],
          statPoints: sp(252, 252, 4, 0, 0, 0),
        },
        ...rest,
        first,
      ],
      'singles',
    );
    expect(sets).toHaveLength(6);
    expect(sets[0]?.moves).toHaveLength(4);
    expect(sets[0]?.statPoints).toEqual(sp(32, 32, 2, 0, 0, 0));
    expect(sets[0]?.nickname).toHaveLength(18);
    expect(adjustments).toEqual([
      'Solo se conservan los 6 primeros Pokémon.',
      'Pokémon 1 (Incineroar): se conservan 4 movimientos (máximo 4, sin repetir).',
      'Pokémon 1 (Incineroar): Stat Points recortados al máximo (66 en total, 32 por stat).',
      'Pokémon 1 (Incineroar): mote recortado a 18 caracteres.',
    ]);
  });
});
