import { describe, expect, it } from 'vitest';
import {
  canLearn,
  getAbility,
  getDescription,
  getFormat,
  getItem,
  getLearnset,
  getMove,
  getName,
  getSpecies,
  getStandardSets,
  getTypeEffectiveness,
  listItems,
  listSpecies,
  listStandardSets,
  meta,
  STAT_IDS,
} from '../src/index';

describe('Champions roster (Reg M-C)', () => {
  it('has 231 Pokédex numbers, 82 Megas and 166 items (81 Mega Stones)', () => {
    expect(meta.regulation).toBe('M-C');
    expect(meta.counts.speciesNums).toBe(231);
    expect(meta.counts.megas).toBe(82);
    expect(meta.counts.items).toBe(166);
    expect(meta.counts.megaStones).toBe(81);
    expect(new Set(listSpecies().map((s) => s.num)).size).toBe(231);
  });

  it('gives every selectable species a learnset and a PokeAPI id', () => {
    for (const species of listSpecies()) {
      expect(getLearnset(species.id).length, species.id).toBeGreaterThan(0);
      expect(species.pokeapiId, species.id).not.toBeNull();
    }
  });

  it('links Megas with their base species and Mega Stone', () => {
    const megaY = getSpecies('charizardmegay');
    expect(megaY).toMatchObject({
      kind: 'mega',
      changesFrom: 'charizard',
      requiredItem: 'charizarditey',
    });
    expect(getSpecies('charizard')?.megas).toEqual(['charizardmegax', 'charizardmegay']);
    expect(getItem('charizarditey')?.megaEvolutions).toEqual([
      { from: 'charizard', to: 'charizardmegay' },
    ]);
    expect(getLearnset('charizardmegay')).toEqual(getLearnset('charizard'));
  });

  it('keeps battle-only formes out of the teambuilder list', () => {
    expect(getSpecies('aegislashblade')?.kind).toBe('battle-only');
    expect(listSpecies().some((s) => s.id === 'aegislashblade')).toBe(false);
  });

  it('exposes base data', () => {
    const garchomp = getSpecies('garchomp');
    expect(garchomp?.baseStats).toEqual({ hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 });
    expect(garchomp?.types).toEqual(['Dragon', 'Ground']);
    expect(garchomp?.abilities).toEqual(['sandveil', 'roughskin']);
    expect(getAbility('intimidate')?.name).toBe('Intimidate');
  });
});

describe('Champions-specific mechanics data', () => {
  it('uses Champions learnsets', () => {
    expect(canLearn('incineroar', 'fakeout')).toBe(true);
    expect(canLearn('incineroar', 'knockoff')).toBe(false);
  });

  it('uses Champions move changes and PP', () => {
    expect(getMove('makeitrain')?.accuracy).toBe(95);
    expect(getMove('moonblast')?.secondaryChance).toBe(10);
    expect(getMove('protect')?.pp).toBe(8);
    expect(getMove('earthquake')?.pp).toBe(12);
    expect(getMove('nightslash')?.pp).toBe(20);
  });

  it('only contains items available in Champions', () => {
    expect(getItem('choicescarf')).toBeDefined();
    for (const missing of ['choiceband', 'choicespecs', 'assaultvest', 'heavydutyboots']) {
      expect(getItem(missing), missing).toBeUndefined();
    }
    expect(listItems().filter((item) => item.category === 'mega-stone')).toHaveLength(81);
  });
});

describe('formats', () => {
  it('describes singles (bring 6, pick 3) and doubles (bring 6, pick 4)', () => {
    expect(getFormat('singles')).toMatchObject({ teamSize: 6, pickedTeamSize: 3, level: 50 });
    expect(getFormat('doubles')).toMatchObject({ teamSize: 6, pickedTeamSize: 4, level: 50 });
    expect(getFormat('doubles').statPoints).toEqual({ total: 66, perStat: 32 });
  });
});

describe('type chart', () => {
  it('computes dual-type effectiveness', () => {
    expect(getTypeEffectiveness('Ground', ['Flying'])).toBe(0);
    expect(getTypeEffectiveness('Fire', ['Grass', 'Steel'])).toBe(4);
    expect(getTypeEffectiveness('Fairy', ['Dragon'])).toBe(2);
    expect(getTypeEffectiveness('Water', ['Water', 'Dragon'])).toBe(0.25);
  });
});

describe('localisation', () => {
  it('has official Spanish names', () => {
    expect(getName('moves', 'earthquake')).toBe('Terremoto');
    expect(getName('natures', 'adamant')).toBe('Firme');
    expect(getName('types', 'Fire')).toBe('Fuego');
    expect(getName('species', 'charizardmegay')).toBe('Mega-Charizard Y');
    expect(getName('species', 'raichualola')).toBe('Raichu de Alola');
    expect(getName('items', 'leek')).toBe('Puerro');
  });

  it('uses Showdown translations where PokeAPI has none (Legends Z-A abilities)', () => {
    expect(getName('abilities', 'eelevate')).toBe('Impulso Anguila');
  });

  it('falls back to English, then to the id', () => {
    expect(getName('moves', 'earthquake', 'en')).toBe('Earthquake');
    expect(getName('abilities', 'auraguard')).toBe('Aura Guard');
    expect(getName('moves', 'not-a-move')).toBe('not-a-move');
  });

  it('has descriptions in both languages', () => {
    const spanish = getDescription('moves', 'earthquake');
    const english = getDescription('moves', 'earthquake', 'en');
    expect(spanish).toBeTruthy();
    expect(english).toBeTruthy();
    expect(spanish).not.toBe(english);
  });

  it('never shows mainline Spanish text for effects Champions changed', () => {
    expect(getDescription('moves', 'makeitrain')).toMatch(/Sp\. Atk by 2/);
    expect(getDescription('moves', 'fakeout')).toMatch(/First turn out only/);
  });
});

describe('standard sets', () => {
  for (const mode of ['singles', 'doubles'] as const) {
    it(`are coherent in ${mode}`, () => {
      const sets = listStandardSets(mode);
      expect(sets.length).toBeGreaterThan(400);
      for (const set of sets) {
        const where = `${mode}:${set.species}:${set.role}`;
        const species = getSpecies(set.species);
        expect(species?.kind, where).toBe('standard');
        expect(species?.abilities, where).toContain(set.ability);
        expect(set.moves.length, where).toBeGreaterThanOrEqual(1);
        expect(set.moves.length, where).toBeLessThanOrEqual(4);
        for (const move of set.moves)
          expect(canLearn(set.species, move), `${where} ${move}`).toBe(true);
        const total = STAT_IDS.reduce((sum, stat) => sum + set.statPoints[stat], 0);
        expect(total, where).toBeLessThanOrEqual(66);
        expect(
          Math.max(...STAT_IDS.map((stat) => set.statPoints[stat])),
          where,
        ).toBeLessThanOrEqual(32);
        if (set.item) expect(getItem(set.item), where).toBeDefined();
        if (set.mega) expect(getSpecies(set.mega)?.requiredItem, where).toBe(set.item);
      }
    });
  }

  it('groups Mega sets under the base species', () => {
    const megaSets = getStandardSets('charizard', 'singles').filter((set) => set.mega);
    expect(megaSets.length).toBeGreaterThan(0);
    expect(megaSets.every((set) => set.species === 'charizard')).toBe(true);
  });
});
