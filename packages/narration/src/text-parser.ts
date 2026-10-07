/**
 * Turns Showdown protocol lines into battle messages with Showdown's own templates, in Spanish
 * (falling back to English field by field) or English.
 *
 * Port of `BattleTextParser` from the Pokémon Showdown client
 * (play.pokemonshowdown.com/src/battle-text-parser.ts, by Guangcong Luo, MIT license), trimmed
 * to Spanish and English, typed, and wired to `@colleja/data`: names come from our i18n (the
 * same ones the UI shows) and templates from `getBattleText` (generated from the pinned
 * Showdown commit plus `packages/data/overrides/battle-text.es.json`).
 */
import {
  type BattleTextData,
  type BattleTextTable,
  getBattleText,
  getName,
  getSpecies,
  type Locale,
  type NameKind,
  toId,
} from '@colleja/data';

export type Args = [string, ...string[]];
export type KWArgs = Record<string, string>;
type Side = 'p1' | 'p2' | 'p3' | 'p4';
type InflectionCategories = Record<string, string>;
type RenderValue =
  | string
  | {
      value: string;
      table?: 'items';
      id?: string;
      category?: string;
      articleRule?: string;
      /** Proper noun (a player name): never takes an article. */
      proper?: boolean;
    };
type RenderValues = Record<string, RenderValue | undefined>;

const SIDES: readonly string[] = ['p1', 'p2', 'p3', 'p4'];

const KNOWN_MODIFIERS = new Set([
  'definite',
  'indefinite',
  'nominative',
  'accusative',
  'singular',
  'plural',
  'masculine',
  'capitalize',
  'classified',
  'a',
  'de',
  'y',
]);

export type LineSection = 'break' | 'preMajor' | 'major' | 'postMajor';

export class BattleTextParser {
  p1 = 'Player 1';
  p2 = 'Player 2';
  p3 = 'Player 3';
  p4 = 'Player 4';
  turn = 0;
  curLineSection: LineSection = 'break';
  private lowercaseRegExp: RegExp | null | undefined = undefined;
  private readonly text: BattleTextData;
  private readonly english: BattleTextData;

  /**
   * @param locale Language of the message templates.
   * @param namesLocale Language of Pokémon, move, item and ability names (default: `locale`),
   *   so Spanish messages can show English names for players used to them.
   */
  constructor(
    readonly perspective: Side = 'p1',
    readonly locale: Locale = 'es',
    readonly namesLocale: Locale = locale,
  ) {
    this.text = getBattleText(locale);
    this.english = getBattleText('en');
  }

  // ── Parsing ──────────────────────────────────────────────────────────────

  static parseBattleLine(line: string): { args: Args; kwArgs: KWArgs } {
    if (!line.startsWith('|')) return { args: ['', line], kwArgs: {} };
    if (line === '|') return { args: ['done'], kwArgs: {} };
    const args = line.slice(1).split('|') as Args;
    const kwArgs: KWArgs = {};
    while (args.length > 1) {
      const lastArg = args[args.length - 1] ?? '';
      if (!lastArg.startsWith('[')) break;
      const bracketPos = lastArg.indexOf(']');
      if (bracketPos <= 0) break;
      // default to '.' so it evaluates to boolean true
      kwArgs[lastArg.slice(1, bracketPos)] = lastArg.slice(bracketPos + 1).trim() || '.';
      args.pop();
    }
    return BattleTextParser.upgradeArgs({ args, kwArgs });
  }

  /** Normalises a few lines to the forms the templates expect (from the original client). */
  static upgradeArgs({ args, kwArgs }: { args: Args; kwArgs: KWArgs }): {
    args: Args;
    kwArgs: KWArgs;
  } {
    switch (args[0]) {
      case '-activate': {
        if (kwArgs.item || kwArgs.move || kwArgs.number || kwArgs.ability) return { args, kwArgs };
        const [, pokemon = '', effect = '', arg3 = '', arg4 = ''] = args;
        const target = kwArgs.of;
        const id = BattleTextParser.effectId(effect);

        if (kwArgs.block) return { args: ['-fail', pokemon], kwArgs };
        if (id === 'wonderguard') {
          return { args: ['-immune', pokemon], kwArgs: { from: 'ability:Wonder Guard' } };
        }
        if (id === 'beatup' && kwArgs.of) return { args, kwArgs: { name: kwArgs.of } };
        if (BLOCK_EFFECTS.has(id)) {
          if (target) {
            kwArgs.of = pokemon;
            return { args: ['-block', target, effect, arg3], kwArgs };
          }
          return { args: ['-block', pokemon, effect, arg3], kwArgs };
        }
        if (id === 'charge') {
          return { args: ['-singlemove', pokemon, effect], kwArgs: target ? { of: target } : {} };
        }
        if (PARTIAL_TRAP_EFFECTS.has(id)) {
          return { args: ['-start', pokemon, effect], kwArgs: target ? { of: target } : {} };
        }
        if (id === 'fairylock') return { args: ['-fieldactivate', effect], kwArgs: {} };

        if (id === 'symbiosis' || id === 'poltergeist') {
          kwArgs.item = arg3;
        } else if (id === 'magnitude') {
          kwArgs.number = arg3;
        } else if (['skillswap', 'mummy', 'lingeringaroma', 'wanderingspirit'].includes(id)) {
          kwArgs.ability = arg3;
          kwArgs.ability2 = arg4;
        } else if (MOVE_NUMBER_EFFECTS.has(id)) {
          kwArgs.move = arg3;
          kwArgs.number = arg4;
        }
        return { args: ['-activate', pokemon, effect, target || ''], kwArgs };
      }
      case '-fail': {
        if (kwArgs.from === 'ability: Flower Veil') {
          return {
            args: ['-block', kwArgs.of ?? '', 'ability: Flower Veil'],
            kwArgs: { of: args[1] ?? '' },
          };
        }
        const [, , effect, stat] = args;
        if (effect === 'unboost' && stat) {
          const statId = UNBOOST_STATS[stat];
          if (statId) args[3] = statId;
        }
        break;
      }
      case '-start':
        if (kwArgs.from === 'Protean' || kwArgs.from === 'Color Change') {
          kwArgs.from = `ability:${kwArgs.from}`;
        }
        break;
      case 'move':
        if (kwArgs.from === 'Magic Bounce') kwArgs.from = 'ability:Magic Bounce';
        break;
      case 'cant': {
        const [, pokemon = '', effect = '', move = ''] = args;
        if (BLOCKING_ABILITIES.has(effect)) {
          return { args: ['-block', pokemon, effect, move, kwArgs.of ?? ''], kwArgs: {} };
        }
        break;
      }
      case '-heal': {
        const id = BattleTextParser.effectId(kwArgs.from);
        if (['dryskin', 'eartheater', 'voltabsorb', 'waterabsorb'].includes(id)) kwArgs.of = '';
        break;
      }
      case '-restoreboost':
        args[0] = '-clearnegativeboost';
        break;
      case '-weather':
        if (args[1] === 'Snow') args[1] = 'Snowscape';
        break;
      case '-ability':
        if (
          args[3] &&
          (args[3].startsWith('p1') || args[3].startsWith('p2') || args[3] === 'boost')
        ) {
          args[4] = args[3];
          args[3] = '';
        }
        break;
      case '-nothing':
        return { args: ['-activate', '', 'move:Splash'], kwArgs };
    }
    return { args, kwArgs };
  }

  static effectId(effect?: string): string {
    if (!effect) return '';
    let name = effect;
    if (name.startsWith('item:') || name.startsWith('move:')) name = name.slice(5);
    else if (name.startsWith('ability:')) name = name.slice(8);
    return toId(name);
  }

  // ── Templates ────────────────────────────────────────────────────────────

  private textField(table: BattleTextTable, id: string, field: string): string {
    return this.text[table][id]?.[field] || this.english[table][id]?.[field] || '';
  }

  private defaultText(field: string): string {
    return this.textField('default', 'default', field);
  }

  /** Localised weather name (`Sol`, `Lluvia`…), or the input when unknown. */
  weatherName(weather: string): string {
    return this.textField('default', BattleTextParser.effectId(weather), 'weatherName') || weather;
  }

  /** Resolves a template by type, looking first in the given effects' own tables. */
  template(type: string, ...namespaces: (string | undefined)[]): string {
    let templateType = type;
    for (const namespace of namespaces) {
      if (!namespace) continue;
      if (namespace === 'OWN') return `${this.defaultText(`${templateType}Own`)}\n`;
      if (namespace === 'NODEFAULT') return '';
      let id = BattleTextParser.effectId(namespace);
      let tables: BattleTextTable[];
      if (namespace.startsWith('item:')) tables = ['items', 'default'];
      else if (namespace.startsWith('ability:')) tables = ['abilities', 'default'];
      else if (namespace.startsWith('move:')) tables = ['moves', 'default'];
      else tables = ['items', 'abilities', 'moves', 'default'];
      for (const table of tables) {
        let template = this.textField(table, id, templateType);
        if (!template) continue;
        if (template.charAt(1) === '.') {
          templateType = template.slice(2);
          template = this.textField(table, id, templateType);
        }
        if (template.startsWith('#')) {
          id = template.slice(1);
          template = this.textField(table, id, templateType);
        }
        return template ? `${template}\n` : '';
      }
    }
    const template = this.defaultText(templateType);
    return template ? `${template}\n` : '';
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  render(template: string, values: RenderValues = {}): string {
    const categories: InflectionCategories = {};
    const text = template.replace(
      /\{([A-Z][A-Z0-9]*)(?::([a-z]+(?::[a-z]+)*))?\}/g,
      (match, placeholder: string, modifierText: string | undefined) => {
        const value = values[placeholder];
        if (value === undefined) return match;
        return this.resolveRenderValue(
          placeholder,
          value,
          modifierText ? modifierText.split(':') : [],
          categories,
        );
      },
    );
    return BattleTextParser.inflect(text, categories);
  }

  private resolveRenderValue(
    placeholder: string,
    source: RenderValue,
    modifiers: string[],
    categories: InflectionCategories,
  ): string {
    let value = typeof source === 'string' ? source : source.value;
    let category = typeof source === 'string' ? 'ms' : source.category || 'ms';
    let articleRule = typeof source === 'string' ? '' : (source.articleRule ?? '');
    if (typeof source !== 'string' && source.table === 'items' && source.id) {
      const grammar = this.text.grammar.items[source.id];
      const classified = modifiers.includes('classified') ? grammar?.classified : undefined;
      if (classified) value = classified.name;
      const form = classified ?? grammar;
      if (form) {
        category = form.grammar;
        articleRule = form.articleRule ?? '';
      }
    }
    categories[placeholder] = category;
    const proper = typeof source !== 'string' && source.proper;
    const applied = proper ? modifiers.filter((modifier) => modifier === 'capitalize') : modifiers;
    return this.modify(value, applied, category, articleRule);
  }

  /** `{INFLECT:ITEM:s=…:p=…}`: picks the variant matching the placeholder's grammar. */
  static inflect(template: string, categories: InflectionCategories): string {
    return template.replace(
      /\{INFLECT:([A-Z][A-Z0-9]*):((?:\\.|[^}\\])*)\}/g,
      (match, placeholder: string, source: string) => {
        const category = categories[placeholder];
        if (!category) return match;
        const grammarCategory = /^[mfn][sup]$/.test(category);
        const normalized =
          grammarCategory && category.endsWith('u') ? `${category.charAt(0)}s` : category;
        const fallback = grammarCategory ? (category.endsWith('p') ? 'p' : 's') : '';

        const fields: string[] = [];
        let field = '';
        for (let i = 0; i < source.length; i++) {
          if (source.charAt(i) === '\\' && i + 1 < source.length) {
            field += source.charAt(i) + source.charAt(++i);
          } else if (source.charAt(i) === ':') {
            fields.push(field);
            field = '';
          } else {
            field += source.charAt(i);
          }
        }
        fields.push(field);

        for (const candidate of fields) {
          let equalsIndex = -1;
          for (let i = 0; i < candidate.length; i++) {
            if (candidate.charAt(i) === '\\') {
              i++;
            } else if (candidate.charAt(i) === '=') {
              equalsIndex = i;
              break;
            }
          }
          const key = candidate.slice(0, equalsIndex);
          if (equalsIndex < 0 || (key !== normalized && key !== fallback)) continue;
          return candidate.slice(equalsIndex + 1).replace(/\\(.)/g, '$1');
        }
        return match;
      },
    );
  }

  /** Articles, prepositions and capitalisation (Spanish grammar; English only capitalises). */
  private modify(value: string, modifiers: string[], category = 'ms', articleRule = ''): string {
    if (modifiers.some((modifier) => !KNOWN_MODIFIERS.has(modifier))) return value;
    const has = (modifier: string) => modifiers.includes(modifier);
    let plural = category.endsWith('p');
    const uncountable = category.endsWith('u');
    let feminine = category.startsWith('f');
    if (has('singular')) plural = false;
    if (has('plural')) plural = true;
    if (has('masculine')) feminine = false;
    let text = value;
    let prefix = '';

    if (this.locale === 'es') {
      const initial = grammarInitial(text);
      const articleFeminine = feminine && articleRule !== 'stressed-a';
      let article = '';
      const lead =
        (has('a') || has('de')) &&
        !has('definite') &&
        !has('indefinite') &&
        /^(\*\*)?(el |la |los |las )/i.exec(text);
      if (lead) {
        // "de el" → "del", "a el" → "al"
        article = (lead[2] ?? '').toLowerCase();
        text = (lead[1] ?? '') + text.slice(lead[0].length);
      } else if (has('definite')) {
        article = plural ? (feminine ? 'las ' : 'los ') : articleFeminine ? 'la ' : 'el ';
      } else if (has('indefinite')) {
        article = uncountable
          ? ''
          : plural
            ? feminine
              ? 'unas '
              : 'unos '
            : articleFeminine
              ? 'una '
              : 'un ';
      }
      if (has('a')) prefix = article === 'el ' ? 'al ' : `a ${article}`;
      else if (has('de')) prefix = article === 'el ' ? 'del ' : `de ${article}`;
      else prefix = article;
      if (has('y')) prefix = /^(?:i|hi)(?![aeou])/i.test(initial) ? 'e ' : 'y ';
    }

    text = prefix + text;
    if (has('capitalize')) text = capitalize(text);
    return text;
  }

  /** Templates like "el {NICKNAME} rival" need a capital when they start a sentence. */
  fixLowercase(input: string): string {
    if (this.lowercaseRegExp === undefined) {
      const prefixes = LOWERCASE_TEMPLATES.map((templateId) => {
        const template = this.defaultText(templateId);
        if (template.startsWith(template.charAt(0).toUpperCase())) return '';
        const braceIndex = template.indexOf('{');
        return braceIndex >= 0 ? template.slice(0, braceIndex) : template;
      }).filter((prefix) => prefix);
      this.lowercaseRegExp = prefixes.length
        ? new RegExp(
            `((?:^|\n)(?:  |  \\(|\\[|\\{|¡|  ¡|  \\(¡)?)(${prefixes.map(escapeRegExp).join('|')})`,
            'g',
          )
        : null;
    }
    if (!this.lowercaseRegExp) return input;
    return input.replace(
      this.lowercaseRegExp,
      (_match, p1: string, p2: string) => p1 + p2.charAt(0).toUpperCase() + p2.slice(1),
    );
  }

  // ── Names ────────────────────────────────────────────────────────────────

  /** Nickname of an ident; a nickname equal to a species name is shown localised. */
  pokemonName(pokemon: string): string {
    if (!pokemon) return '';
    if (!pokemon.startsWith('p')) return `???pokemon:${pokemon}???`;
    let name: string;
    if (pokemon.charAt(3) === ':') name = pokemon.slice(4).trim();
    else if (pokemon.charAt(2) === ':') name = pokemon.slice(3).trim();
    else return `???pokemon:${pokemon}???`;
    return getSpecies(toId(name)) ? this.speciesName(name) : name;
  }

  pokemon(pokemon: string | undefined): string {
    if (!pokemon) return '';
    const side = pokemon.slice(0, 2);
    if (!SIDES.includes(side)) return `???pokemon:${pokemon}???`;
    const isNear = side === this.perspective || side === allyOf(side);
    const template = this.defaultText(isNear ? 'pokemon' : 'opposingPokemon');
    return this.render(template, { NICKNAME: this.pokemonName(pokemon) });
  }

  private pokemonFull(pokemon: string, details: string): [side: string, fullName: string] {
    const nickname = this.pokemonName(pokemon);
    const speciesId = toId(details.split(',')[0] ?? '');
    const species = this.speciesName(details.split(',')[0] ?? '');
    // No nickname: Showdown names a Pokémon after its species (the base one for formes).
    const baseSpecies = getSpecies(speciesId)?.baseSpecies;
    const unnamed = baseSpecies !== undefined && nickname === this.speciesName(baseSpecies);
    if (nickname === species || unnamed) return [pokemon.slice(0, 2), `**${nickname}**`];
    const template = this.defaultText('fullName') || '{NICKNAME} ({SPECIES})';
    return [
      pokemon.slice(0, 2),
      this.render(template, { NICKNAME: nickname, SPECIES: `**${species}**` }),
    ];
  }

  /** Player name: a proper noun, so Spanish templates do not put an article before it. */
  private trainer(side: string): RenderValue {
    const id = side.slice(0, 2);
    const value = SIDES.includes(id) ? this[id as Side] : `???side:${side}???`;
    return { value, proper: true };
  }

  private team(side: string, isFar = false): string {
    const id = side.slice(0, 2);
    const near = id === this.perspective || id === allyOf(this.perspective);
    return this.defaultText(near !== isFar ? 'team' : 'opposingTeam');
  }

  private own(side: string): string {
    return side.slice(0, 2) === this.perspective ? 'OWN' : '';
  }

  private party(side: string): string {
    const id = side.slice(0, 2);
    const near = id === this.perspective || id === allyOf(this.perspective);
    return this.defaultText(near ? 'party' : 'opposingParty');
  }

  private effect(effect?: string): RenderValue {
    if (!effect) return '';
    if (effect.startsWith('item:')) return this.itemValue(effect.slice(5));
    if (effect.startsWith('move:')) return this.moveName(effect.slice(5));
    if (effect.startsWith('ability:')) return this.abilityName(effect.slice(8));
    return this.effectName(effect.trim());
  }

  /** Names of bare effects (`Reflect`, `Stealth Rock`, `confusion`…): moves, then conditions. */
  private effectName(name: string): string {
    const id = toId(name);
    const move = this.localName('moves', name);
    if (move !== name) return move;
    return this.textField('default', id, 'weatherName') || name;
  }

  private localName(kind: NameKind, name?: string): string {
    if (!name) return '';
    const trimmed = name.trim();
    const id = toId(trimmed);
    const localised = getName(kind, id, this.namesLocale);
    return localised === id ? trimmed : localised;
  }

  moveName(name?: string): string {
    return this.localName('moves', name);
  }

  itemName(name?: string): string {
    return this.localName('items', name);
  }

  private itemValue(name: string): RenderValue {
    return { value: this.itemName(name), table: 'items', id: toId(name) };
  }

  abilityName(name?: string): string {
    return this.localName('abilities', name);
  }

  speciesName(name?: string): string {
    return this.localName('species', name);
  }

  private typeName(type?: string): string {
    return type ? getName('types', type, this.namesLocale) : '';
  }

  private maybeAbility(effect: string | undefined, holder: string): string {
    if (!effect?.startsWith('ability:')) return '';
    return this.ability(effect.slice(8).trim(), holder);
  }

  private ability(name: string | undefined, holder: string): string {
    if (!name) return '';
    return `${this.render(this.defaultText('abilityActivation'), {
      POKEMON: this.pokemon(holder),
      ABILITY: this.abilityName(name),
    })}\n`;
  }

  private statValue(stat: string): RenderValue {
    const id = stat || 'stats';
    return {
      value: this.text.stats[id] ?? this.english.stats[id] ?? stat,
      category: this.text.grammar.stats[id] || (stat ? 's' : 'p'),
    };
  }

  // ── Sections ─────────────────────────────────────────────────────────────

  lineSection(args: Args, kwArgs: KWArgs): LineSection | '' {
    if (kwArgs.premajor) return 'preMajor';
    if (kwArgs.postmajor) return 'postMajor';
    if (kwArgs.major) return 'major';
    const cmd = args[0];
    switch (cmd) {
      case 'done':
      case 'turn':
        return 'break';
      case 'move':
      case 'cant':
      case 'switch':
      case 'drag':
      case 'upkeep':
      case 'start':
      case '-mega':
      case '-candynamax':
      case '-terastallize':
        return 'major';
      case 'switchout':
      case 'faint':
        return 'preMajor';
      case '-zpower':
        return 'postMajor';
      case '-damage':
        return BattleTextParser.effectId(kwArgs.from) === 'confusion' ? 'major' : 'postMajor';
      case '-curestatus':
        return BattleTextParser.effectId(kwArgs.from) === 'naturalcure' ? 'preMajor' : 'postMajor';
      case '-start':
        return BattleTextParser.effectId(kwArgs.from) === 'protean' ? 'preMajor' : 'postMajor';
      case '-activate': {
        const id = BattleTextParser.effectId(args[2]);
        return id === 'confusion' || id === 'attract' || id === 'pursuit'
          ? 'preMajor'
          : 'postMajor';
      }
    }
    return cmd.startsWith('-') ? 'postMajor' : '';
  }

  /** Whether the line starts a new block of messages (a blank line in the classic log). */
  sectionBreak(args: Args, kwArgs: KWArgs): boolean {
    const prevSection = this.curLineSection;
    const curSection = this.lineSection(args, kwArgs);
    if (!curSection) return false;
    this.curLineSection = curSection;
    switch (curSection) {
      case 'break':
        return prevSection !== 'break';
      case 'preMajor':
      case 'major':
        return prevSection === 'postMajor' || prevSection === 'major';
      case 'postMajor':
        return false;
    }
  }

  /** Messages of one line, `\n`-separated (minor ones indented with two spaces). */
  parseArgs(args: Args, kwArgs: KWArgs, noSectionBreak = false): string {
    const buf = !noSectionBreak && this.sectionBreak(args, kwArgs) ? '\n' : '';
    let text = this.fixLowercase(this.parseArgsInner(args, kwArgs) || '');
    if (this.locale === 'es')
      text = text.replace(/\b([Dd]e|[Aa]) el\b/g, (_m, p: string) =>
        p.toLowerCase() === 'de' ? `${p.charAt(0)}el` : `${p}l`,
      );
    return buf + text;
  }

  private parseArgsInner(args: Args, kwArgs: KWArgs): string | null {
    const cmd = args[0];
    switch (cmd) {
      case 'player': {
        const [, side, name] = args;
        if (name && side && SIDES.includes(side)) this[side as Side] = name;
        return '';
      }
      case 'turn': {
        const [, num = ''] = args;
        this.turn = Number.parseInt(num, 10);
        return `${this.render(this.template('turn'), { NUMBER: num })}\n`;
      }
      case 'start':
        return this.render(this.template('startBattle'), { TRAINER1: this.p1, TRAINER2: this.p2 });
      case 'win':
      case 'tie': {
        const [, name] = args;
        if (cmd === 'tie' || !name) {
          return this.render(this.template('tieBattle'), { TRAINER1: this.p1, TRAINER2: this.p2 });
        }
        return this.render(this.template('winBattle'), { TRAINER: name });
      }
      case 'switch': {
        const [, pokemon = '', details = ''] = args;
        const [side, fullname] = this.pokemonFull(pokemon, details);
        const template = this.template('switchIn', this.own(side));
        return this.render(template, { TRAINER: this.trainer(side), FULLNAME: fullname });
      }
      case 'drag': {
        const [, pokemon = '', details = ''] = args;
        const [side, fullname] = this.pokemonFull(pokemon, details);
        return this.render(this.template('drag'), {
          TRAINER: this.trainer(side),
          FULLNAME: fullname,
        });
      }
      case 'detailschange':
      case '-transform':
      case '-formechange': {
        const [, pokemon = '', arg2 = '', arg3 = ''] = args;
        let newSpecies = '';
        if (cmd === 'detailschange') newSpecies = (arg2.split(',')[0] ?? '').trim();
        else if (cmd === '-transform') newSpecies = arg3;
        else newSpecies = arg2;
        let id = '';
        let templateName = 'transform';
        if (cmd !== '-transform') {
          const change = FORME_CHANGES[toId(newSpecies)];
          if (change) {
            id = change.effect;
            if (change.end) templateName = 'transformEnd';
          }
        } else if (newSpecies) {
          id = 'transform';
        }
        const template = this.template(templateName, id, kwArgs.msg ? '' : 'NODEFAULT');
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        return (
          line1 +
          this.render(template, {
            POKEMON: this.pokemon(pokemon),
            SPECIES: this.speciesName(newSpecies),
          })
        );
      }
      case 'switchout': {
        const [, pokemon = ''] = args;
        const side = pokemon.slice(0, 2);
        const template = this.template('switchOut', kwArgs.from, this.own(side));
        return this.render(template, {
          TRAINER: this.trainer(side),
          NICKNAME: this.pokemonName(pokemon),
          POKEMON: this.pokemon(pokemon),
        });
      }
      case 'faint':
        return this.render(this.template('faint'), { POKEMON: this.pokemon(args[1]) });
      case 'swap': {
        const [, pokemon = '', target] = args;
        if (!target || !Number.isNaN(Number(target))) {
          return this.render(this.template('swapCenter'), { POKEMON: this.pokemon(pokemon) });
        }
        return this.render(this.template('swap'), {
          POKEMON: this.pokemon(pokemon),
          TARGET: this.pokemon(target),
        });
      }
      case 'move': {
        const [, pokemon = '', move] = args;
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        const template = this.template('move', kwArgs.from);
        return (
          line1 +
          this.render(template, { POKEMON: this.pokemon(pokemon), MOVE: this.moveName(move) })
        );
      }
      case 'cant': {
        const [, pokemon = '', effect, move] = args;
        const template =
          this.template('cant', effect, 'NODEFAULT') || this.template(move ? 'cant' : 'cantNoMove');
        const line1 = this.maybeAbility(effect, kwArgs.of || pokemon);
        return (
          line1 +
          this.render(template, { POKEMON: this.pokemon(pokemon), MOVE: this.moveName(move) })
        );
      }
      case 'message':
        return `${args[1] ?? ''}\n`;
      case '-start': {
        const [, pokemon = '', effect, arg3] = args;
        const line1 =
          this.maybeAbility(effect, pokemon) ||
          this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        const id = BattleTextParser.effectId(effect);
        if (id === 'typechange') {
          const template = this.template('typeChange', kwArgs.from);
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(pokemon),
              TYPE: this.typeList(arg3),
              SOURCE: this.pokemon(kwArgs.of),
            })
          );
        }
        if (id === 'typeadd') {
          const template = this.template('typeAdd', kwArgs.from);
          return (
            line1 +
            this.render(template, { POKEMON: this.pokemon(pokemon), TYPE: this.typeName(arg3) })
          );
        }
        if (id.startsWith('stockpile')) {
          const template = this.template('start', 'stockpile');
          return (
            line1 + this.render(template, { POKEMON: this.pokemon(pokemon), NUMBER: id.slice(9) })
          );
        }
        if (id.startsWith('perish')) {
          const template = this.template('activate', 'perishsong');
          return (
            line1 + this.render(template, { POKEMON: this.pokemon(pokemon), NUMBER: id.slice(6) })
          );
        }
        if (id.startsWith('protosynthesis') || id.startsWith('quarkdrive')) {
          const template = this.template('start', id.slice(0, id.length - 3));
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(pokemon),
              STAT: this.statValue(id.slice(-3)),
            })
          );
        }
        let templateId = 'start';
        if (kwArgs.already) templateId = 'alreadyStarted';
        if (kwArgs.fatigue) templateId = 'startFromFatigue';
        if (kwArgs.zeffect) templateId = 'startFromZEffect';
        if (kwArgs.damage) templateId = 'activate';
        if (kwArgs.block) templateId = 'block';
        if (kwArgs.upkeep) templateId = 'upkeep';
        if (templateId === 'start' && kwArgs.from?.startsWith('item:')) templateId += 'FromItem';
        const template = this.template(templateId, kwArgs.from, effect);
        return (
          line1 +
          this.render(template, {
            POKEMON: this.pokemon(pokemon),
            EFFECT: this.effect(effect),
            MOVE: this.moveName(arg3),
            SOURCE: this.pokemon(kwArgs.of),
            ITEM: this.effect(kwArgs.from),
          })
        );
      }
      case '-end': {
        const [, pokemon = '', effect] = args;
        const line1 =
          this.maybeAbility(effect, pokemon) ||
          this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        const id = BattleTextParser.effectId(effect);
        if (id === 'doomdesire' || id === 'futuresight') {
          return (
            line1 +
            this.render(this.template('activate', effect), { TARGET: this.pokemon(pokemon) })
          );
        }
        let template = '';
        if (kwArgs.from?.startsWith('item:')) template = this.template('endFromItem', effect);
        if (!template) template = this.template('end', effect);
        return (
          line1 +
          this.render(template, {
            POKEMON: this.pokemon(pokemon),
            EFFECT: this.effect(effect),
            SOURCE: this.pokemon(kwArgs.of),
            ITEM: this.effect(kwArgs.from),
          })
        );
      }
      case '-ability': {
        const [, pokemon = '', ability, oldAbility] = args;
        let line1 = '';
        if (oldAbility) line1 += this.ability(oldAbility, pokemon);
        line1 += this.ability(ability, pokemon);
        if (kwArgs.fail) return line1 + this.template('block', kwArgs.from);
        if (kwArgs.from) {
          if (!oldAbility) line1 = this.maybeAbility(kwArgs.from, pokemon) + line1;
          const template = this.template('changeAbility', kwArgs.from);
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(pokemon),
              ABILITY: this.abilityName(ability),
              SOURCE: this.pokemon(kwArgs.of),
            })
          );
        }
        const id = BattleTextParser.effectId(ability);
        if (id === 'unnerve') {
          const template = this.template('start', ability);
          return line1 + this.render(template, { TEAM: this.team(pokemon.slice(0, 2), true) });
        }
        const templateId = id === 'anticipation' || id === 'sturdy' ? 'activate' : 'start';
        const template = this.template(templateId, ability, 'NODEFAULT');
        return line1 + this.render(template, { POKEMON: this.pokemon(pokemon) });
      }
      case '-endability': {
        const [, pokemon = '', ability] = args;
        if (ability) return this.ability(ability, pokemon);
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        const template = this.template('start', 'Gastro Acid');
        return line1 + this.render(template, { POKEMON: this.pokemon(pokemon) });
      }
      case '-item': {
        const [, pokemon = '', item = ''] = args;
        const id = BattleTextParser.effectId(kwArgs.from);
        let target = '';
        if (id === 'magician' || id === 'pickpocket') {
          target = kwArgs.of ?? '';
          kwArgs.of = '';
        }
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        if (['thief', 'covet', 'bestow', 'magician', 'pickpocket'].includes(id)) {
          const template = this.template('takeItem', kwArgs.from);
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(pokemon),
              ITEM: this.itemValue(item),
              SOURCE: this.pokemon(target || kwArgs.of),
            })
          );
        }
        if (id === 'frisk') {
          const hasTarget = kwArgs.of && pokemon && kwArgs.of !== pokemon;
          const template = this.template(hasTarget ? 'activate' : 'activateNoTarget', 'Frisk');
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(kwArgs.of),
              ITEM: this.itemValue(item),
              TARGET: this.pokemon(pokemon),
            })
          );
        }
        if (kwArgs.from) {
          const template = this.template('addItem', kwArgs.from);
          return (
            line1 +
            this.render(template, { POKEMON: this.pokemon(pokemon), ITEM: this.itemValue(item) })
          );
        }
        const template = this.template('start', item, 'NODEFAULT');
        return line1 + this.render(template, { POKEMON: this.pokemon(pokemon) });
      }
      case '-enditem': {
        const [, pokemon = '', item = ''] = args;
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        if (kwArgs.eat) {
          const template = this.template('eatItem', kwArgs.from);
          return (
            line1 +
            this.render(template, { POKEMON: this.pokemon(pokemon), ITEM: this.itemValue(item) })
          );
        }
        const id = BattleTextParser.effectId(kwArgs.from);
        if (id === 'gem') {
          const template = this.template('useGem', item);
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(pokemon),
              ITEM: this.itemValue(item),
              MOVE: this.moveName(kwArgs.move),
            })
          );
        }
        if (id === 'stealeat') {
          const template = this.template('removeItem', 'Bug Bite');
          return (
            line1 +
            this.render(template, { SOURCE: this.pokemon(kwArgs.of), ITEM: this.itemValue(item) })
          );
        }
        if (kwArgs.from) {
          const template = this.template('removeItem', kwArgs.from);
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(pokemon),
              ITEM: this.itemValue(item),
              SOURCE: this.pokemon(kwArgs.of),
            })
          );
        }
        if (kwArgs.weaken) {
          const template = this.template('activateWeaken');
          return (
            line1 +
            this.render(template, { POKEMON: this.pokemon(pokemon), ITEM: this.itemValue(item) })
          );
        }
        let template = this.template('end', item, 'NODEFAULT');
        if (!template) template = this.template('activateItem');
        return (
          line1 +
          this.render(template, {
            POKEMON: this.pokemon(pokemon),
            ITEM: this.itemValue(item),
            TARGET: this.pokemon(kwArgs.of),
          })
        );
      }
      case '-status': {
        const [, pokemon = '', status] = args;
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        if (kwArgs.from?.startsWith('item:')) {
          const template = this.template('startFromItem', status);
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(pokemon),
              ITEM: this.effect(kwArgs.from),
            })
          );
        }
        if (BattleTextParser.effectId(kwArgs.from) === 'rest') {
          const template = this.template('startFromRest', status);
          return line1 + this.render(template, { POKEMON: this.pokemon(pokemon) });
        }
        return (
          line1 + this.render(this.template('start', status), { POKEMON: this.pokemon(pokemon) })
        );
      }
      case '-curestatus': {
        const [, pokemon = '', status = ''] = args;
        if (BattleTextParser.effectId(kwArgs.from) === 'naturalcure') {
          return this.render(this.template('activate', kwArgs.from), {
            POKEMON: this.pokemon(pokemon),
          });
        }
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        if (kwArgs.from?.startsWith('item:')) {
          const template = this.template('endFromItem', status);
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(pokemon),
              ITEM: this.effect(kwArgs.from),
            })
          );
        }
        if (kwArgs.thaw) {
          const template = this.template('endFromMove', status);
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(pokemon),
              MOVE: this.effect(kwArgs.from),
            })
          );
        }
        let template = this.template('end', status, 'NODEFAULT');
        if (!template) template = this.template('end');
        return line1 + this.render(template, { POKEMON: this.pokemon(pokemon), EFFECT: status });
      }
      case '-cureteam':
        return this.template('activate', kwArgs.from);
      case '-singleturn':
      case '-singlemove': {
        const [, pokemon = '', effect] = args;
        const line1 =
          this.maybeAbility(effect, kwArgs.of || pokemon) ||
          this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        const id = BattleTextParser.effectId(effect);
        if (id === 'instruct') {
          const template = this.template('activate', effect);
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(kwArgs.of),
              TARGET: this.pokemon(pokemon),
            })
          );
        }
        let template = this.template('start', effect, 'NODEFAULT');
        if (!template) template = this.template('start');
        return (
          line1 +
          this.render(template, {
            EFFECT: this.effect(effect),
            POKEMON: this.pokemon(pokemon),
            SOURCE: this.pokemon(kwArgs.of),
            TEAM: this.team(pokemon.slice(0, 2)),
          })
        );
      }
      case '-sidestart':
      case '-sideend': {
        const [, side = '', effect] = args;
        const field = cmd === '-sidestart' ? 'start' : 'end';
        let template = this.template(field, effect, 'NODEFAULT');
        if (!template) template = this.template(`${field}TeamEffect`);
        return this.render(template, {
          EFFECT: this.effect(effect),
          TEAM: this.team(side),
          PARTY: this.party(side),
        });
      }
      case '-weather': {
        const [, weather] = args;
        if (!weather || weather === 'none') {
          const template = this.template('end', kwArgs.from, 'NODEFAULT');
          if (!template)
            return this.render(this.template('endFieldEffect'), { EFFECT: this.effect(weather) });
          return template;
        }
        if (kwArgs.upkeep) return this.template('upkeep', weather, 'NODEFAULT');
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of ?? '');
        let template = this.template('start', weather, 'NODEFAULT');
        if (!template) template = this.template('startFieldEffect');
        return line1 + this.render(template, { EFFECT: this.effect(weather) });
      }
      case '-fieldstart':
      case '-fieldactivate': {
        const [, effect] = args;
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of ?? '');
        if (BattleTextParser.effectId(kwArgs.from) === 'hadronengine') {
          return (
            line1 +
            this.render(this.template('start', 'hadronengine'), {
              POKEMON: this.pokemon(kwArgs.of),
            })
          );
        }
        let templateId = cmd.slice(6);
        if (BattleTextParser.effectId(effect) === 'perishsong') templateId = 'start';
        let template = this.template(templateId, effect, 'NODEFAULT');
        if (!template) template = this.template('startFieldEffect');
        return (
          line1 +
          this.render(template, { EFFECT: this.effect(effect), POKEMON: this.pokemon(kwArgs.of) })
        );
      }
      case '-fieldend': {
        const [, effect] = args;
        let template = this.template('end', effect, 'NODEFAULT');
        if (!template) template = this.template('endFieldEffect');
        return this.render(template, { EFFECT: this.effect(effect) });
      }
      case '-sethp':
        return this.template('activate', kwArgs.from);
      case '-message':
        return `  ${args[1] ?? ''}\n`;
      case '-hint':
        return `  (${args[1] ?? ''})\n`;
      case '-activate': {
        let [, pokemon = '', effect = '', target = ''] = args;
        const id = BattleTextParser.effectId(effect);
        if (id === 'celebrate') {
          return this.render(this.template('activate', 'celebrate'), {
            TRAINER: this.trainer(pokemon.slice(0, 2)),
          });
        }
        if (!target && TARGETLESS_ACTIVATE.has(id)) {
          [pokemon, target] = [kwArgs.of ?? '', pokemon];
          if (!pokemon) pokemon = target;
        }
        if (!target) target = kwArgs.of || pokemon;
        let line1 = this.maybeAbility(effect, pokemon);
        if (id === 'lockon' || id === 'mindreader') {
          const template = this.template('start', effect);
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(kwArgs.of),
              SOURCE: this.pokemon(pokemon),
            })
          );
        }
        if ((id === 'mummy' || id === 'lingeringaroma') && kwArgs.ability) {
          line1 += this.ability(kwArgs.ability, target);
          line1 += this.ability(id === 'mummy' ? 'Mummy' : 'Lingering Aroma', target);
          const template = this.template('changeAbility', id);
          return line1 + this.render(template, { TARGET: this.pokemon(target) });
        }
        if (id === 'commander') {
          if (target === pokemon) return line1;
          const template = this.template('activate', id);
          return (
            line1 +
            this.render(template, { POKEMON: this.pokemon(pokemon), TARGET: this.pokemon(target) })
          );
        }
        let templateId = 'activate';
        if (id === 'forewarn' && pokemon === target) templateId = 'activateNoTarget';
        if ((id === 'protosynthesis' || id === 'quarkdrive') && kwArgs.fromitem) {
          templateId = 'activateFromItem';
        }
        if (id === 'orichalcumpulse' && kwArgs.source) templateId = 'start';
        let template = this.template(templateId, effect, 'NODEFAULT');
        if (!template) {
          if (line1) return line1; // abilities have no default template
          template = this.template('activate');
          return line1 + this.render(template, { EFFECT: this.effect(effect) });
        }
        if (kwArgs.ability) line1 += this.ability(kwArgs.ability, pokemon);
        if (kwArgs.ability2) line1 += this.ability(kwArgs.ability2, target);
        return (
          line1 +
          this.render(template, {
            TEAM: id === 'brickbreak' ? this.team(target.slice(0, 2)) : undefined,
            MOVE: kwArgs.move ? this.moveName(kwArgs.move) : undefined,
            NUMBER: kwArgs.number,
            ITEM: kwArgs.item ? this.itemValue(kwArgs.item) : undefined,
            NAME: kwArgs.name,
            POKEMON: this.pokemon(pokemon),
            TARGET: this.pokemon(target),
            SOURCE: this.pokemon(kwArgs.of),
          })
        );
      }
      case '-prepare': {
        const [, pokemon = '', effect, target] = args;
        return this.render(this.template('prepare', effect), {
          POKEMON: this.pokemon(pokemon),
          TARGET: this.pokemon(target),
        });
      }
      case '-damage': {
        const [, pokemon = ''] = args;
        let percentage = args[3] ?? '';
        let template = this.template('damage', kwArgs.from, 'NODEFAULT');
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        const id = BattleTextParser.effectId(kwArgs.from);
        if (template) return line1 + this.render(template, { POKEMON: this.pokemon(pokemon) });
        if (!kwArgs.from) {
          template = this.template(percentage ? 'damagePercentage' : 'damage');
          percentage = percentage.replace(/%$/, '');
          return (
            line1 +
            this.render(template, { POKEMON: this.pokemon(pokemon), PERCENTAGE: percentage })
          );
        }
        if (kwArgs.from.startsWith('item:')) {
          template = this.template(kwArgs.of ? 'damageFromPokemon' : 'damageFromItem');
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(pokemon),
              ITEM: this.effect(kwArgs.from),
              SOURCE: this.pokemon(kwArgs.of),
            })
          );
        }
        if (kwArgs.partiallytrapped || id === 'bind' || id === 'wrap') {
          template = this.template('damageFromPartialTrapping');
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(pokemon),
              MOVE: this.effect(kwArgs.from),
            })
          );
        }
        return line1 + this.render(this.template('damage'), { POKEMON: this.pokemon(pokemon) });
      }
      case '-heal': {
        const [, pokemon = ''] = args;
        let template = this.template('heal', kwArgs.from, 'NODEFAULT');
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        if (template) {
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(pokemon),
              SOURCE: this.pokemon(kwArgs.of),
              NICKNAME: kwArgs.wisher,
            })
          );
        }
        if (kwArgs.from && !kwArgs.from.startsWith('ability:')) {
          template = this.template('healFromEffect');
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(pokemon),
              EFFECT: this.effect(kwArgs.from),
            })
          );
        }
        return line1 + this.render(this.template('heal'), { POKEMON: this.pokemon(pokemon) });
      }
      case '-boost':
      case '-unboost': {
        const [, pokemon = '', stat = '', num = ''] = args;
        const amount = Number.parseInt(num, 10);
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        let templateId = cmd.slice(1);
        if (amount >= 3) templateId += '3';
        else if (amount >= 2) templateId += '2';
        else if (amount === 0) templateId += '0';
        if (amount && kwArgs.zeffect) {
          templateId += kwArgs.multiple ? 'MultipleFromZEffect' : 'FromZEffect';
        } else if (amount && kwArgs.from?.startsWith('item:')) {
          const template = this.template(`${templateId}FromItem`, kwArgs.from);
          return (
            line1 +
            this.render(template, {
              POKEMON: this.pokemon(pokemon),
              STAT: this.statValue(stat),
              ITEM: this.effect(kwArgs.from),
            })
          );
        }
        const template = this.template(templateId, kwArgs.from);
        return (
          line1 +
          this.render(template, { POKEMON: this.pokemon(pokemon), STAT: this.statValue(stat) })
        );
      }
      case '-setboost': {
        const [, pokemon = ''] = args;
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        return (
          line1 +
          this.render(this.template('boost', kwArgs.from), { POKEMON: this.pokemon(pokemon) })
        );
      }
      case '-swapboost': {
        const [, pokemon = '', target] = args;
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        const id = BattleTextParser.effectId(kwArgs.from);
        let templateId = 'swapBoost';
        if (id === 'guardswap') templateId = 'swapDefensiveBoost';
        if (id === 'powerswap') templateId = 'swapOffensiveBoost';
        const template = this.template(templateId, kwArgs.from);
        return (
          line1 +
          this.render(template, { POKEMON: this.pokemon(pokemon), TARGET: this.pokemon(target) })
        );
      }
      case '-copyboost': {
        const [, pokemon = '', target] = args;
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        const template = this.template('copyBoost', kwArgs.from);
        return (
          line1 +
          this.render(template, { POKEMON: this.pokemon(pokemon), TARGET: this.pokemon(target) })
        );
      }
      case '-clearboost':
      case '-clearpositiveboost':
      case '-clearnegativeboost': {
        const [, pokemon = '', source] = args;
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        const template = this.template(
          kwArgs.zeffect ? 'clearBoostFromZEffect' : 'clearBoost',
          kwArgs.from,
        );
        return (
          line1 +
          this.render(template, { POKEMON: this.pokemon(pokemon), SOURCE: this.pokemon(source) })
        );
      }
      case '-invertboost': {
        const [, pokemon = ''] = args;
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        return (
          line1 +
          this.render(this.template('invertBoost', kwArgs.from), { POKEMON: this.pokemon(pokemon) })
        );
      }
      case '-clearallboost':
        return this.template('clearAllBoost', kwArgs.from);
      case '-crit':
      case '-supereffective':
      case '-resisted': {
        const [, pokemon, effectiveness] = args;
        let templateId = cmd.slice(1);
        if (templateId === 'supereffective') templateId = 'superEffective';
        if (effectiveness === '2') {
          if (templateId === 'superEffective') templateId = 'extremelyEffective';
          if (templateId === 'resisted') templateId = 'mostlyIneffective';
        }
        if (kwArgs.spread) templateId += 'Spread';
        return this.render(this.template(templateId), { POKEMON: this.pokemon(pokemon) });
      }
      case '-block': {
        const [, pokemon = '', effect, move, attacker] = args;
        const line1 = this.maybeAbility(effect, kwArgs.of || pokemon);
        return (
          line1 +
          this.render(this.template('block', effect), {
            POKEMON: this.pokemon(pokemon),
            SOURCE: this.pokemon(attacker || kwArgs.of),
            MOVE: this.moveName(move),
          })
        );
      }
      case '-fail': {
        const [, pokemon = '', effect, stat = ''] = args;
        const id = BattleTextParser.effectId(effect);
        const blocker = BattleTextParser.effectId(kwArgs.from);
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        let templateId = 'block';
        if (
          ['desolateland', 'primordialsea'].includes(blocker) &&
          !['sunnyday', 'raindance', 'sandstorm', 'hail', 'snowscape', 'chillyreception'].includes(
            id,
          )
        ) {
          templateId = 'blockMove';
        } else if (blocker === 'uproar' && kwArgs.msg) {
          templateId = 'blockSelf';
        }
        let template = this.template(templateId, kwArgs.from);
        if (template) return line1 + this.render(template, { POKEMON: this.pokemon(pokemon) });
        if (id === 'unboost') {
          template = this.template('fail', 'unboost');
          return (
            line1 +
            this.render(template, { POKEMON: this.pokemon(pokemon), STAT: this.statValue(stat) })
          );
        }
        templateId = 'fail';
        if (['brn', 'frz', 'par', 'psn', 'slp', 'substitute', 'shedtail'].includes(id)) {
          templateId = 'alreadyStarted';
        }
        if (kwArgs.heavy) templateId = 'failTooHeavy';
        if (kwArgs.weak) templateId = 'fail';
        if (kwArgs.forme) templateId = 'failWrongForme';
        template = this.template(templateId, id);
        return line1 + this.render(template, { POKEMON: this.pokemon(pokemon) });
      }
      case '-immune': {
        const [, pokemon = ''] = args;
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon);
        let template = this.template('block', kwArgs.from);
        if (!template) {
          const templateId = kwArgs.ohko ? 'immuneOHKO' : 'immune';
          template = this.template(pokemon ? templateId : 'immuneNoPokemon', kwArgs.from);
        }
        return line1 + this.render(template, { POKEMON: this.pokemon(pokemon) });
      }
      case '-miss': {
        const [, source, pokemon] = args;
        const line1 = this.maybeAbility(kwArgs.from, kwArgs.of || pokemon || '');
        if (!pokemon) {
          return (
            line1 + this.render(this.template('missNoPokemon'), { SOURCE: this.pokemon(source) })
          );
        }
        return line1 + this.render(this.template('miss'), { POKEMON: this.pokemon(pokemon) });
      }
      case '-center':
      case '-ohko':
      case '-combine':
        return this.template(cmd.slice(1));
      case '-notarget':
        return this.template('noTarget');
      case '-mega':
      case '-primal': {
        const [, pokemon = '', species, item = ''] = args;
        let id = '';
        let templateId = cmd.slice(1);
        if (species === 'Rayquaza') {
          id = 'dragonascent';
          templateId = 'megaNoItem';
        }
        if (!item && cmd === '-mega') templateId = 'megaNoItem';
        let template = this.template(templateId, id);
        if (cmd === '-mega') {
          // The line names the base species; `[forme]` (added by the narrator) has the Mega.
          const transform = this.template('transformMega');
          template += kwArgs.forme
            ? transform.replace(/Mega[- ]\{SPECIES\}/, '{SPECIES}')
            : transform;
        }
        return this.render(template, {
          POKEMON: this.pokemon(pokemon),
          SPECIES: kwArgs.forme ? this.megaName(kwArgs.forme) : this.speciesName(species),
          ITEM: this.itemValue(item),
          TRAINER: this.trainer(pokemon.slice(0, 2)),
        });
      }
      case '-hitcount': {
        const [, , num = ''] = args;
        return this.render(this.template('hitCount'), {
          NUMBER: { value: num, category: num === '1' ? 's' : 'p' },
        });
      }
      case '-waiting': {
        const [, pokemon, target] = args;
        return this.render(this.template('activate', 'Water Pledge'), {
          POKEMON: this.pokemon(pokemon),
          TARGET: this.pokemon(target),
        });
      }
      case '-anim':
        return '';
      default:
        return null;
    }
  }

  /** Name of a Mega forme: `Mega-Charizard Y` (Spanish data) or `Mega Charizard Y`. */
  private megaName(forme: string): string {
    const name = this.speciesName(forme);
    const english = /^(.+)-Mega(?:-(\w+))?$/.exec(name);
    if (!english) return name;
    return `Mega ${english[1]}${english[2] ? ` ${english[2]}` : ''}`;
  }

  /** `Fire/Flying` → `Fuego/Volador`. */
  private typeList(types?: string): string {
    return (types ?? '')
      .split('/')
      .map((type) => this.typeName(type))
      .join('/');
  }
}

const LOWERCASE_TEMPLATES = [
  'pokemon',
  'opposingPokemon',
  'team',
  'opposingTeam',
  'party',
  'opposingParty',
];

const BLOCK_EFFECTS = new Set([
  'ingrain',
  'quickguard',
  'wideguard',
  'craftyshield',
  'matblock',
  'protect',
  'mist',
  'safeguard',
  'electricterrain',
  'mistyterrain',
  'psychicterrain',
  'telepathy',
  'stickyhold',
  'suctioncups',
  'aromaveil',
  'flowerveil',
  'sweetveil',
  'disguise',
  'safetygoggles',
  'protectivepads',
]);

const PARTIAL_TRAP_EFFECTS = new Set([
  'bind',
  'wrap',
  'clamp',
  'whirlpool',
  'firespin',
  'magmastorm',
  'sandtomb',
  'infestation',
  'snaptrap',
  'thundercage',
  'trapped',
]);

const MOVE_NUMBER_EFFECTS = new Set([
  'eeriespell',
  'gmaxdepletion',
  'spite',
  'grudge',
  'forewarn',
  'sketch',
  'leppaberry',
  'mysteryberry',
]);

const BLOCKING_ABILITIES = new Set([
  'ability: Damp',
  'ability: Dazzling',
  'ability: Queenly Majesty',
  'ability: Armor Tail',
]);

const TARGETLESS_ACTIVATE = new Set([
  'hyperdrill',
  'hyperspacefury',
  'hyperspacehole',
  'phantomforce',
  'shadowforce',
  'feint',
]);

const UNBOOST_STATS: Record<string, string> = {
  Attack: 'atk',
  Defense: 'def',
  'Special Attack': 'spa',
  'Special Defense': 'spd',
  Speed: 'spe',
};

/** Forme changes with their own message, by the effect that causes them. */
const FORME_CHANGES: Record<string, { effect: string; end?: boolean }> = {
  greninjaash: { effect: 'battlebond' },
  mimikyubusted: { effect: 'disguise' },
  zygardecomplete: { effect: 'powerconstruct' },
  necrozmaultra: { effect: 'ultranecroziumz' },
  darmanitanzen: { effect: 'zenmode' },
  darmanitan: { effect: 'zenmode', end: true },
  darmanitangalarzen: { effect: 'zenmode' },
  darmanitangalar: { effect: 'zenmode', end: true },
  aegislashblade: { effect: 'stancechange' },
  aegislash: { effect: 'stancechange', end: true },
  wishiwashischool: { effect: 'schooling' },
  wishiwashi: { effect: 'schooling', end: true },
  miniormeteor: { effect: 'shieldsdown' },
  minior: { effect: 'shieldsdown', end: true },
  eiscuenoice: { effect: 'iceface' },
  eiscue: { effect: 'iceface', end: true },
  terapagosterastal: { effect: 'terashift' },
};

function allyOf(side: string): string {
  switch (side) {
    case 'p1':
      return 'p3';
    case 'p2':
      return 'p4';
    case 'p3':
      return 'p1';
    case 'p4':
      return 'p2';
    default:
      return '';
  }
}

function grammarInitial(value: string): string {
  return value.replace(/\*\*/g, '').replace(/^[^A-Za-zÀ-ɏ0-9]+/, '');
}

function capitalize(value: string): string {
  for (let i = 0; i < value.length; i++) {
    const letter = value.charAt(i);
    if (letter.toUpperCase() === letter.toLowerCase()) continue;
    return value.slice(0, i) + letter.toUpperCase() + value.slice(i + 1);
  }
  return value;
}

function escapeRegExp(input: string): string {
  return input.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}
