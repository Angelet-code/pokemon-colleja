import { readFileSync } from 'node:fs';
import { formatShowdownTeam, parseShowdownTeam } from '@colleja/core';
import { canLearn, getStandardSets } from '@colleja/data';
import { describe, expect, it } from 'vitest';
import {
  addMember,
  applyStandardSet,
  changeSpecies,
  draftIssues,
  exportTeam,
  importText,
  itemChoices,
  megaOf,
  memberIssueCount,
  moveMember,
  newDraft,
  newMember,
  removeMember,
  replaceMembers,
  sameDraft,
  setMoveAt,
  setStatPointOf,
} from '../src/features/teams/team-draft';

const fixtureText = (name: 'equipo-a' | 'equipo-b') =>
  readFileSync(new URL(`../../../tools/smoke/fixtures/${name}.txt`, import.meta.url), 'utf8');

describe('team draft', () => {
  it('adds up to 6 members, moves and removes them', () => {
    let draft = newDraft('singles');
    for (const species of [
      'garchomp',
      'incineroar',
      'gengar',
      'dragonite',
      'azumarill',
      'kingambit',
      'sinistcha',
    ]) {
      draft = addMember(draft, species);
    }
    expect(draft.members.map((set) => set.species)).toEqual([
      'garchomp',
      'incineroar',
      'gengar',
      'dragonite',
      'azumarill',
      'kingambit',
    ]);
    draft = moveMember(draft, 0, 2);
    expect(draft.members.slice(0, 3).map((set) => set.species)).toEqual([
      'incineroar',
      'gengar',
      'garchomp',
    ]);
    draft = removeMember(draft, 1);
    expect(draft.members).toHaveLength(5);
  });

  it('keeps the legal moves, a valid ability and no foreign Mega Stone when changing species', () => {
    const charizard = {
      ...newMember('charizard'),
      item: 'charizarditey',
      ability: 'solarpower',
      moves: ['flamethrower', 'airslash', 'solarbeam', 'protect'],
    };
    const changed = changeSpecies(charizard, 'garchomp');
    expect(changed.species).toBe('garchomp');
    expect(changed.moves.every((move) => canLearn('garchomp', move))).toBe(true);
    expect(changed.moves).toContain('protect');
    expect(changed.moves).not.toContain('airslash');
    expect(changed.ability).toBe('sandveil');
    expect(changed.item).toBeUndefined();
    // Other items stay.
    expect(changeSpecies({ ...charizard, item: 'lifeorb' }, 'garchomp').item).toBe('lifeorb');
  });

  it('respects 32 per stat and 66 in total', () => {
    let set = newMember('garchomp');
    set = setStatPointOf(set, 'atk', 40, 'singles');
    expect(set.statPoints.atk).toBe(32);
    set = setStatPointOf(set, 'spe', 32, 'singles');
    set = setStatPointOf(set, 'hp', 10, 'singles');
    expect(set.statPoints.hp).toBe(2);
    set = setStatPointOf(set, 'def', -3, 'singles');
    expect(set.statPoints.def).toBe(0);
  });

  it('offers Mega Stones only to their species and marks the Item Clause', () => {
    const charizard = { ...newMember('charizard'), item: 'lifeorb' };
    const garchomp = newMember('garchomp');
    const draft = replaceMembers(newDraft('doubles'), [charizard, garchomp]);
    const forGarchomp = itemChoices(draft, 1);
    const ids = forGarchomp.map((choice) => choice.item.id);
    expect(ids).toContain('garchompite');
    expect(ids).not.toContain('charizarditey');
    expect(forGarchomp.find((choice) => choice.item.id === 'lifeorb')?.heldBy).toBe(0);
    expect(megaOf({ ...garchomp, item: 'garchompite' })).toBe('garchompmega');
  });

  it('puts moves in slots without repeating them', () => {
    let set = newMember('garchomp');
    set = setMoveAt(set, 0, 'earthquake');
    set = setMoveAt(set, 3, 'dragonclaw');
    expect(set.moves).toEqual(['earthquake', 'dragonclaw']);
    set = setMoveAt(set, 2, 'protect');
    set = setMoveAt(set, 0, 'protect');
    expect(set.moves).toEqual(['protect', 'dragonclaw', 'earthquake']);
    set = setMoveAt(set, 1, null);
    expect(set.moves).toEqual(['protect', 'earthquake']);
  });

  it('loads a suggested set', () => {
    const [standard] = getStandardSets('garchomp', 'singles');
    if (!standard) throw new Error('no standard set');
    const set = applyStandardSet({ ...newMember('garchomp'), nickname: 'Chompy' }, standard);
    expect(set).toMatchObject({
      nickname: 'Chompy',
      moves: standard.moves,
      nature: standard.nature,
    });
  });

  it('places problems on their member and field', () => {
    const draft = replaceMembers(newDraft('singles'), [
      { ...newMember('garchomp'), ability: 'levitate', moves: ['earthquake'] },
      { ...newMember('garchomp'), moves: ['earthquake'] },
    ]);
    const issues = draftIssues(draft);
    expect(issues.team).toEqual(['El equipo debe tener 6 Pokémon (tiene 2).']);
    expect(issues.members.get(0)?.ability).toHaveLength(1);
    expect(issues.members.get(1)?.species?.[0]).toMatch(/^Cláusula de especie/);
    expect(memberIssueCount(issues, 0)).toBe(1);
  });

  it('imports and exports Showdown text without losing anything', () => {
    for (const name of ['equipo-a', 'equipo-b'] as const) {
      const text = fixtureText(name);
      const { members, notes } = importText(text, 'singles');
      expect(notes).toEqual([]);
      const exported = exportTeam(replaceMembers(newDraft('singles'), members));
      expect(exported).toBe(formatShowdownTeam(parseShowdownTeam(text).sets));
      expect(importText(exported, 'singles').members).toEqual(members);
    }
  });

  it('reports what an import had to change', () => {
    const { members, notes } = importText(
      'Garchomp\nEVs: 252 Atk\n- Earthquake\n\nNotapokemon',
      'singles',
    );
    expect(members[0]?.statPoints.atk).toBe(32);
    expect(notes).toHaveLength(2);
  });

  it('compares drafts regardless of key order and surrounding spaces', () => {
    const draft = replaceMembers(newDraft('singles'), [newMember('garchomp')]);
    const [member] = draft.members;
    if (!member) throw new Error('missing');
    const reordered = {
      ...draft,
      name: ` ${draft.name} `,
      members: [Object.fromEntries(Object.entries(member).reverse()) as typeof member],
    };
    expect(sameDraft(draft, reordered)).toBe(true);
    expect(sameDraft(draft, { ...draft, mode: 'doubles' })).toBe(false);
  });
});
