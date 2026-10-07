import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvRecords } from '../src/pokeapi/csv';
import { deriveSpanishFormeName } from '../src/pokeapi/species-map';
import { buildSpread, profileForRole, type SpreadMove } from '../src/sets/spread';
import { stringifyJson } from '../src/util/json';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded newlines, CRLF and BOM', () => {
    const text = '﻿id,text\r\n1,"Hola, ""mundo""\nsegunda línea"\r\n2,simple\n';
    expect(parseCsv(text)).toEqual([
      ['id', 'text'],
      ['1', 'Hola, "mundo"\nsegunda línea'],
      ['2', 'simple'],
    ]);
  });

  it('maps rows to records by header', () => {
    expect(parseCsvRecords('a,b\n1,2\n\n')).toEqual([{ a: '1', b: '2' }]);
  });
});

describe('deriveSpanishFormeName', () => {
  it('follows the official naming conventions', () => {
    expect(deriveSpanishFormeName('Raichu', 'Mega-X')).toBe('Mega-Raichu X');
    expect(deriveSpanishFormeName('Absol', 'Mega-Z')).toBe('Mega-Absol Z');
    expect(deriveSpanishFormeName('Meganium', 'Mega')).toBe('Mega-Meganium');
    expect(deriveSpanishFormeName('Meowstic', 'M-Mega')).toBe('Mega-Meowstic ♂');
    expect(deriveSpanishFormeName('Ninetales', 'Alola')).toBe('Ninetales de Alola');
    expect(deriveSpanishFormeName('Tauros', 'Paldea-Aqua')).toBe(
      'Tauros de Paldea (Raza Acuática)',
    );
    expect(deriveSpanishFormeName('Rotom', 'Wash')).toBeNull();
  });
});

describe('buildSpread', () => {
  const physical: SpreadMove = { category: 'Physical', usesOwnAttack: true };
  const special: SpreadMove = { category: 'Special', usesOwnAttack: true };
  const status: SpreadMove = { category: 'Status', usesOwnAttack: true };
  const bodyPress: SpreadMove = { category: 'Physical', usesOwnAttack: false };
  const baseStats = { hp: 100, atk: 100, def: 80, spa: 100, spd: 90, spe: 100 };
  const sum = (sp: Record<string, number>) => Object.values(sp).reduce((a, b) => a + b, 0);

  it('maps Showdown roles to profiles', () => {
    expect(profileForRole('Fast Attacker')).toBe('fast-offense');
    expect(profileForRole('Doubles Bulky Attacker')).toBe('bulky-offense');
    expect(profileForRole('Doubles Support')).toBe('support');
    expect(profileForRole('Fast Support')).toBe('fast-support');
    expect(profileForRole('Choice Item user')).toBe('fast-offense');
  });

  it('builds a fast physical attacker (Jolly, 32 Atk / 32 Spe)', () => {
    const spread = buildSpread({
      role: 'Fast Attacker',
      baseStats,
      moves: [physical, physical, status],
      trickRoom: false,
    });
    expect(spread.statPoints).toMatchObject({ atk: 32, spe: 32, hp: 2 });
    expect([spread.plus, spread.minus]).toEqual(['spe', 'spa']);
    expect(sum(spread.statPoints)).toBe(66);
  });

  it('builds a bulky special attacker (Modest, 32 HP / 32 SpA)', () => {
    const spread = buildSpread({
      role: 'Bulky Attacker',
      baseStats,
      moves: [special, special],
      trickRoom: false,
    });
    expect(spread.statPoints).toMatchObject({ hp: 32, spa: 32, def: 2 });
    expect([spread.plus, spread.minus]).toEqual(['spa', 'atk']);
  });

  it('builds a support that boosts its weaker defence and ignores Body Press', () => {
    const spread = buildSpread({
      role: 'Bulky Support',
      baseStats,
      moves: [bodyPress, status, special],
      trickRoom: false,
    });
    expect(spread.statPoints).toMatchObject({ hp: 32, def: 17, spd: 17 });
    expect([spread.plus, spread.minus]).toEqual(['def', 'atk']);
  });

  it('drops Speed under Trick Room', () => {
    const spread = buildSpread({
      role: 'Doubles Wallbreaker',
      baseStats,
      moves: [physical, status],
      trickRoom: true,
    });
    expect(spread.statPoints.spe).toBe(0);
    expect(spread.statPoints).toMatchObject({ atk: 32, hp: 32 });
    expect([spread.plus, spread.minus]).toEqual(['atk', 'spe']);
  });

  it('splits mixed attackers and uses a neutral nature when bulky', () => {
    const fast = buildSpread({
      role: 'Wallbreaker',
      baseStats,
      moves: [physical, special],
      trickRoom: false,
    });
    expect(fast.statPoints).toMatchObject({ atk: 17, spa: 17, spe: 32 });
    expect([fast.plus, fast.minus]).toEqual(['spe', 'spd']);
    const bulky = buildSpread({
      role: 'Bulky Attacker',
      baseStats,
      moves: [physical, special],
      trickRoom: false,
    });
    expect([bulky.plus, bulky.minus]).toEqual([null, null]);
  });

  it('treats offensive roles without attacks as support', () => {
    expect(
      buildSpread({ role: 'Fast Attacker', baseStats, moves: [status], trickRoom: false }).profile,
    ).toBe('fast-support');
  });
});

describe('stringifyJson', () => {
  it('inlines primitive arrays and small flat objects', () => {
    expect(stringifyJson({ list: [1, 2], stats: { hp: 1, atk: 2 }, nested: [{ a: 1 }] })).toBe(
      '{\n  "list": [1, 2],\n  "stats": {"hp": 1, "atk": 2},\n  "nested": [\n    {"a": 1}\n  ]\n}',
    );
  });
});
