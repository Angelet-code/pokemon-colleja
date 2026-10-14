import { describe, expect, it } from 'vitest';
import { filterHistory } from '../src/features/calc/CalcHistoryDialog';
import {
  CALC_HISTORY_LIMIT,
  historyEntry,
  useCalcHistory,
} from '../src/features/calc/calc-history';
import { type CalcSetup, emptyCalcField, standardSide } from '../src/features/calc/calc-store';

const SETUP: CalcSetup = {
  attacker: standardSide('garchomp'),
  defender: standardSide('incineroar'),
  field: emptyCalcField(),
};
const RESULT = {
  attacker: { species: 'garchomp' },
  defender: { species: 'incineroar', hp: 170, maxhp: 170 },
  rolls: [80, 82, 84, 86],
  min: 80,
  max: 86,
  minPercent: 47.1,
  maxPercent: 50.6,
  koChance: 0,
  hitsToKo: { best: 2, worst: 3 },
  accuracy: 1,
  moveType: 'Ground',
};
const DAMAGE = [{ move: 'earthquake', result: RESULT }];

/** A setup whose attacker is another species. */
const against = (index: number): CalcSetup => ({
  ...SETUP,
  attacker: { ...SETUP.attacker, set: { ...SETUP.attacker.set, species: `species${index}` } },
});

describe('calculator history', () => {
  it('records a comparison apart from later changes', () => {
    useCalcHistory.setState({ entries: [] });
    const setup = structuredClone(SETUP);
    useCalcHistory.getState().record(setup, DAMAGE);
    setup.attacker.hpPercent = 10;

    const [first] = useCalcHistory.getState().entries;
    expect(first?.setup.attacker.hpPercent).toBe(100);
  });

  it('keeps one entry per attacker → defender pair, the latest first', () => {
    useCalcHistory.setState({ entries: [] });
    const { record } = useCalcHistory.getState();
    record(SETUP, DAMAGE, 1);
    record(against(1), DAMAGE, 2);
    record({ ...SETUP, field: { ...SETUP.field, crit: true } }, DAMAGE, 3);
    record({ ...SETUP, attacker: SETUP.defender, defender: SETUP.attacker }, DAMAGE, 4);

    const { entries } = useCalcHistory.getState();
    expect(entries.map((entry) => entry.savedAt)).toEqual([4, 3, 2]);
    expect(entries[1]?.setup.field.crit).toBe(true);
  });

  it('skips empty or failed results', () => {
    useCalcHistory.setState({ entries: [] });
    const { record } = useCalcHistory.getState();
    record(SETUP, []);
    record(SETUP, [{ move: 'earthquake', result: null, error: 'Sin conexión' }]);
    expect(useCalcHistory.getState().entries).toHaveLength(0);
  });

  it('forgets the oldest past the limit and removes one entry', () => {
    useCalcHistory.setState({ entries: [] });
    const { record } = useCalcHistory.getState();
    for (let i = 0; i <= CALC_HISTORY_LIMIT; i++) record(against(i), DAMAGE, i);
    const { entries, remove } = useCalcHistory.getState();
    expect(entries).toHaveLength(CALC_HISTORY_LIMIT);
    expect(entries[0]?.savedAt).toBe(CALC_HISTORY_LIMIT);
    expect(entries.at(-1)?.savedAt).toBe(1);

    remove(entries[0]?.id ?? '');
    expect(useCalcHistory.getState().entries[0]?.savedAt).toBe(CALC_HISTORY_LIMIT - 1);
  });
});

describe('calculator history search', () => {
  const entries = [
    historyEntry(SETUP, 1),
    historyEntry({ ...SETUP, attacker: standardSide('milotic') }, 2),
    historyEntry({ ...SETUP, defender: standardSide('raichu') }, 3),
  ];
  const found = (query: string) =>
    filterHistory(entries, query, 'es').map((entry) => entry.savedAt);

  it('finds the Pokémon whose name starts with what you type, on either side', () => {
    expect(found('')).toEqual([1, 2, 3]);
    expect(found('mil')).toEqual([2]);
    expect(found('RAI')).toEqual([3]);
    expect(found('inc')).toEqual([1, 2]);
    expect(found('gar inc')).toEqual([1]);
    expect(found('chomp')).toEqual([]);
  });
});
