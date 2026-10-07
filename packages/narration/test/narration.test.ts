import { RandomAgent } from '@colleja/bot';
import type { GameMode, Locale } from '@colleja/data';
import { BattleSession, playOut } from '@colleja/engine';
import {
  BattleTextParser,
  boostName,
  type NarrationEntry,
  Narrator,
  speciesName,
  statusShort,
  stripMarkup,
  weatherName,
} from '@colleja/narration';
import { generateTeam } from '@colleja/teamgen';
import { describe, expect, it } from 'vitest';

const LOG = [
  '|player|p1|Ángel|',
  '|player|p2|Bot|',
  '|gametype|singles',
  '|switch|p1a: Charizard|Charizard, L50, M|153/153',
  '|switch|p2a: Gyarados|Gyarados, L50, F|100/100',
  '|-ability|p2a: Gyarados|Intimidate|boost',
  '|-unboost|p1a: Charizard|atk|1',
  '|turn|1',
  '|detailschange|p1a: Charizard|Charizard-Mega-Y, L50, M',
  '|-mega|p1a: Charizard|Charizard|Charizardite Y',
  '|-weather|SunnyDay|[from] ability: Drought|[of] p1a: Charizard',
  '|move|p2a: Gyarados|Waterfall|p1a: Charizard',
  '|-supereffective|p1a: Charizard',
  '|-damage|p1a: Charizard|40/153',
  '|move|p1a: Charizard|Solar Beam|p2a: Gyarados',
  '|-resisted|p2a: Gyarados',
  '|-crit|p2a: Gyarados',
  '|-damage|p2a: Gyarados|55/100',
  '|-damage|p1a: Charizard|25/153|[from] item: Life Orb',
  '|-enditem|p2a: Gyarados|Sitrus Berry|[eat]',
  '|-heal|p2a: Gyarados|80/100|[from] item: Sitrus Berry',
  '|-sidestart|p2: Bot|move: Reflect',
  '|-status|p2a: Gyarados|par',
  '|faint|p1a: Charizard',
  '|win|Bot',
];

function narrate(lines: readonly string[], side: 'p1' | 'p2' = 'p1', locale: Locale = 'es') {
  return new Narrator(side, { locale }).pushAll(lines);
}

function texts(entries: readonly NarrationEntry[]): string[] {
  return entries.map((entry) => stripMarkup(entry.text));
}

describe('Narrator (Spanish, Showdown templates)', () => {
  const entries = narrate(LOG);
  const lines = texts(entries);

  it('narrates switches from the player perspective, without articles before player names', () => {
    expect(lines).toContain('¡Adelante, Charizard!');
    expect(lines).toContain('¡Bot saca a Gyarados!');
    expect(texts(narrate(LOG.slice(0, 5), 'p2'))).toEqual([
      '¡Ángel saca a Charizard!',
      '¡Adelante, Gyarados!',
    ]);
  });

  it('marks rival Pokémon and contracts "de el" into "del"', () => {
    expect(lines).toContain('[Intimidación del Gyarados rival]');
    expect(lines).toContain('¡El Ataque de Charizard ha disminuido!');
    expect(lines).toContain('¡El Gyarados rival ha usado Cascada!');
  });

  it('uses item and stat grammar (gender, articles) and names the Mega forme', () => {
    expect(lines).toContain(
      '¡La Charizardita Y de Charizard está reaccionando a la Piedra Activadora!',
    );
    expect(lines).toContain('¡Charizard ha evolucionado a Mega-Charizard Y!');
    expect(lines).toContain('¡El sol pega fuerte!');
  });

  it('describes damage, effectiveness and effects', () => {
    expect(lines).toContain('¡Es supereficaz!');
    expect(lines).toContain('Es poco eficaz...');
    expect(lines).toContain('¡Un golpe crítico!');
    // Damage as a percentage of the maximum HP, for both sides.
    expect(lines).toContain('(¡Charizard ha perdido el 74 % de sus PS!)');
    expect(lines).toContain('(¡El Gyarados rival ha perdido el 45 % de sus PS!)');
    expect(lines).toContain('¡Charizard ha perdido unos pocos PS!');
    expect(lines).toContain('(¡El Gyarados rival se ha comido su Baya Zidra!)');
    expect(lines).toContain(
      '¡Reflejo ha aumentado la resistencia del lado rival ante los ataques físicos!',
    );
    expect(lines).toContain('¡El Gyarados rival sufre parálisis! Quizá no se pueda mover.');
  });

  it('classifies entries into turns, actions and consequences', () => {
    const turn = entries.find((entry) => entry.kind === 'turn');
    expect(turn).toMatchObject({ text: 'Turno 1', turn: 1, spaced: true });
    expect(entries.find((entry) => entry.text.includes('Cascada'))).toMatchObject({
      kind: 'major',
      spaced: true,
    });
    expect(entries.find((entry) => entry.text === '¡Es supereficaz!')?.kind).toBe('minor');
    expect(entries.at(-1)).toMatchObject({ kind: 'end', text: '¡**Bot** ha ganado el combate!' });
  });

  it('keeps the battle state up to date', () => {
    const narrator = new Narrator('p1');
    narrator.pushAll(LOG);
    expect(narrator.state.ended).toBe(true);
    expect(narrator.state.sides.p2.conditions.reflect).toBe(1);
    expect(narrator.state.getPokemon('p2a: Gyarados')?.status).toBe('par');
  });

  it('rebuilds everything on reset', () => {
    const narrator = new Narrator('p1');
    narrator.pushAll(LOG);
    expect(texts(narrator.reset(LOG.slice(0, 8)))).toEqual(texts(narrate(LOG.slice(0, 8))));
    expect(narrator.state.turn).toBe(1);
  });
});

describe('Narrator (English)', () => {
  const lines = texts(narrate(LOG, 'p1', 'en'));

  it('uses the English templates and names', () => {
    expect(lines).toContain('Go! Charizard!');
    expect(lines).toContain("[The opposing Gyarados's Intimidate]");
    expect(lines).toContain('The opposing Gyarados used Waterfall!');
    expect(lines).toContain('Charizard has Mega Evolved into Mega Charizard Y!');
    expect(lines).toContain('Bot won the battle!');
  });
});

describe('names language', () => {
  it('can show English names inside Spanish messages', () => {
    const lines = texts(new Narrator('p1', { namesLocale: 'en' }).pushAll(LOG));
    expect(lines).toContain('¡El Gyarados rival ha usado Waterfall!');
    expect(lines).toContain('[Intimidate del Gyarados rival]');
  });
});

describe('BattleTextParser', () => {
  it('falls back to English when a Spanish template is missing', () => {
    // Dynamax messages are not translated upstream (nor used in Champions).
    const parser = new BattleTextParser('p1', 'es');
    const { args, kwArgs } = BattleTextParser.parseBattleLine('|-start|p1a: Charizard|Dynamax');
    expect(parser.parseArgs(args, kwArgs, true)).toContain("Charizard's Dynamax!");
  });

  it('parses keyword arguments', () => {
    expect(
      BattleTextParser.parseBattleLine('|-damage|p1a: X|10/100|[from] item: Life Orb|[of] p2a: Y'),
    ).toEqual({
      args: ['-damage', 'p1a: X', '10/100'],
      kwArgs: { from: 'item: Life Orb', of: 'p2a: Y' },
    });
  });
});

describe('display names', () => {
  it('resolves Spanish and English names', () => {
    expect(speciesName('Charizard-Mega-Y, L50, M')).toBe('Mega-Charizard Y');
    expect(speciesName('charizardmegay', 'en')).toBe('Charizard-Mega-Y');
    expect(weatherName('SunnyDay')).toBe('Sol');
    expect(weatherName('raindance', 'en')).toBe('Rain');
    expect(boostName('spa')).toBe('Ataque Especial');
    expect(statusShort('par')).toBe('PAR');
    expect(statusShort('brn', 'en')).toBe('BRN');
  });
});

describe('full battles', () => {
  // Every line of real battles, from both sides and in both languages, must render cleanly.
  const cases = (['singles', 'doubles'] as GameMode[]).flatMap((mode) =>
    (['es', 'en'] as Locale[]).map((locale) => [mode, locale] as const),
  );

  it.each(cases)(
    'narrates %s battles in %s without unresolved placeholders',
    async (mode, locale) => {
      for (let i = 0; i < 6; i++) {
        const session = BattleSession.create({
          mode,
          seed: `narration-${mode}-${i}`,
          options: { teamPreview: true, openTeamSheets: false },
          players: {
            p1: { name: 'Yo', team: generateTeam(mode, { seed: `a${i}` }) },
            p2: { name: 'Rival', team: generateTeam(mode, { seed: `b${i}` }) },
          },
        });
        await playOut(session, {
          p1: new RandomAgent({ seed: `x${i}`, megaChance: 1 }),
          p2: new RandomAgent({ seed: `y${i}`, megaChance: 1 }),
        });
        for (const side of ['p1', 'p2'] as const) {
          const entries = narrate(session.getLog(side), side, locale);
          expect(entries.filter((entry) => entry.kind === 'turn')).toHaveLength(session.turn);
          for (const entry of entries) {
            expect(entry.text).not.toMatch(/[{}]|\?\?\?|undefined|\bnull\b/);
            if (locale === 'es') expect(entry.text).not.toMatch(/\bde el\b/);
          }
        }
        session.dispose();
      }
    },
  );
});
