/**
 * Minimal Spanish narration of the protocol, from one player's perspective.
 * Covers the common events (moves, damage, faints, switches, status, weather, field, Mega…);
 * the full localised log with Showdown's templates comes with the web UI (phase 5).
 */
import { BattleView, type SideId, sideOf } from '@colleja/core';
import {
  abilityName,
  boostName,
  effectName,
  itemName,
  moveName,
  speciesName,
  weatherName,
} from './names';

const STATUS_START: Record<string, string> = {
  brn: '¡{0} se ha quemado!',
  par: '¡{0} está paralizado! Quizás no se pueda mover.',
  psn: '¡{0} ha sido envenenado!',
  tox: '¡{0} ha sido gravemente envenenado!',
  slp: '¡{0} se ha dormido!',
  frz: '¡{0} se ha congelado!',
};

const CANT: Record<string, string> = {
  slp: '{0} está profundamente dormido.',
  par: '¡{0} está paralizado! No se puede mover.',
  frz: '{0} está congelado.',
  flinch: '¡{0} se amedrentó y no se pudo mover!',
  recharge: '{0} necesita recuperarse.',
};

const WEATHER_START: Record<string, string> = {
  sunnyday: 'El sol pega fuerte.',
  raindance: 'Ha empezado a llover.',
  sandstorm: 'Se ha levantado una tormenta de arena.',
  snowscape: 'Ha empezado a nevar.',
  snow: 'Ha empezado a nevar.',
  hail: 'Ha empezado a granizar.',
};

export class Narrator {
  private view = new BattleView();

  constructor(private readonly me: SideId) {}

  /** State after the lines narrated so far. */
  get state(): BattleView {
    return this.view;
  }

  /** Rebuilds the state from a full log without narrating (after a rewind). */
  reset(lines: readonly string[]): void {
    this.view = BattleView.from(lines);
  }

  /** Narration of one line (or `null` if it is not worth showing). Updates the state. */
  narrate(line: string): string | null {
    let text: string | null = null;
    try {
      text = this.describe(line);
    } finally {
      this.view.apply(line);
    }
    return text;
  }

  private describe(line: string): string | null {
    if (!line.startsWith('|')) return null;
    const [, type = '', ...args] = line.split('|');
    const [a = '', b = '', c = ''] = args;
    const from = args.find((arg) => arg.startsWith('[from]'));

    switch (type) {
      case 'turn':
        return `\n── Turno ${a} ──`;
      case 'move':
        return `${this.name(a)} usó ${moveName(b)}.`;
      case 'switch':
      case 'drag': {
        const side = sideOf(a);
        const pokemon = speciesName(b);
        if (type === 'drag') return `¡${pokemon} fue arrastrado al combate!`;
        if (side === this.me) return `¡Adelante, ${pokemon}!`;
        return `${this.playerName(side)} envió a ${pokemon}.`;
      }
      case 'faint':
        return `¡${this.name(a)} se ha debilitado!`;
      case '-damage':
        return this.hpChange(a, b, from, 'perdió');
      case '-heal':
        return this.hpChange(a, b, from, 'recuperó');
      case '-status':
        return fill(STATUS_START[b] ?? `{0} sufre ${b}.`, this.name(a));
      case '-curestatus':
        return b === 'frz'
          ? `¡${this.name(a)} se ha descongelado!`
          : `${this.name(a)} se ha curado.`;
      case 'cant':
        return fill(CANT[b] ?? '{0} no se puede mover.', this.name(a));
      case '-boost':
      case '-unboost': {
        const amount = Number(c);
        const verb = type === '-boost' ? 'subió' : 'bajó';
        const intensity = amount >= 3 ? ' muchísimo' : amount === 2 ? ' mucho' : '';
        if (amount === 0)
          return `¡${boostName(b)} de ${this.name(a)} no puede ${type === '-boost' ? 'subir' : 'bajar'} más!`;
        return `${boostName(b)} de ${this.name(a)} ${verb}${intensity}.`;
      }
      case '-setboost':
        return `${boostName(b)} de ${this.name(a)} cambió.`;
      case '-clearallboost':
        return 'Se han anulado todos los cambios de características.';
      case '-weather':
        if (args.includes('[upkeep]')) return null;
        if (a === 'none') return 'El tiempo vuelve a la normalidad.';
        return WEATHER_START[a.toLowerCase()] ?? `Clima: ${weatherName(a)}.`;
      case '-fieldstart':
        return `¡${effectName(a)} está activo!`;
      case '-fieldend':
        return `${effectName(a)} ha terminado.`;
      case '-sidestart':
        return `${effectName(b)} afecta al ${this.teamOf(a)}.`;
      case '-sideend':
        return `${effectName(b)} ha dejado de afectar al ${this.teamOf(a)}.`;
      case '-mega': {
        // `|detailschange|` (new species) arrives before `|-mega|`: name the original forme.
        const pokemon = this.view.getPokemon(a);
        if (!pokemon) return null;
        const rival = sideOf(a) === this.me ? '' : ' rival';
        return `¡${speciesName(pokemon.baseSpecies)}${rival} ha megaevolucionado en ${speciesName(pokemon.species)}!`;
      }
      case 'detailschange':
        return null;
      case '-supereffective':
        return '¡Es muy eficaz!';
      case '-resisted':
        return 'No es muy eficaz…';
      case '-immune':
        return `No afecta a ${this.name(a)}…`;
      case '-crit':
        return '¡Un golpe crítico!';
      case '-miss':
        return `¡El ataque de ${this.name(a)} ha fallado!`;
      case '-fail':
        return '¡Pero ha fallado!';
      case '-hitcount':
        return `¡Ha golpeado ${b} veces!`;
      case '-prepare':
        return `${this.name(a)} se está preparando.`;
      case '-singleturn':
      case '-activate':
        return /protect|detect/i.test(b) ? `¡${this.name(a)} se está protegiendo!` : null;
      case '-ability':
        return `[${abilityName(b)} de ${this.name(a)}]`;
      case '-item':
        return `${this.name(a)} lleva ${itemName(b)}.`;
      case '-enditem':
        return args.includes('[eat]')
          ? `${this.name(a)} se comió su ${itemName(b)}.`
          : `${this.name(a)} ya no tiene ${itemName(b)}.`;
      case '-start':
        if (/substitute/i.test(b)) return `${this.name(a)} creó un sustituto.`;
        if (/confusion/i.test(b)) return `¡${this.name(a)} se ha confundido!`;
        return null;
      case 'win':
        return `\n¡${a} ha ganado el combate!`;
      case 'tie':
        return '\n¡Empate!';
      default:
        return null;
    }
  }

  /** `Garchomp` for own Pokémon, `Garchomp rival` for the other side. */
  private name(ident: string): string {
    const pokemon = this.view.getPokemon(ident);
    const name = pokemon
      ? speciesName(pokemon.species)
      : ident.slice(ident.indexOf(':') + 1).trim();
    return sideOf(ident) === this.me ? name : `${name} rival`;
  }

  private playerName(side: SideId | undefined): string {
    return side ? this.view.sides[side].name : 'El rival';
  }

  private teamOf(ident: string): string {
    return sideOf(ident) === this.me ? 'tu equipo' : 'equipo rival';
  }

  private hpChange(
    ident: string,
    condition: string,
    from: string | undefined,
    verb: string,
  ): string | null {
    const pokemon = this.view.getPokemon(ident);
    if (!pokemon) return null;
    const [hpText = '0'] = condition.split(' ');
    const [hp = 0, maxhp = pokemon.maxhp] = hpText.split('/').map(Number);
    const max = maxhp || pokemon.maxhp || 100;
    const delta = Math.abs(pokemon.hp - hp);
    if (delta === 0) return null;
    const amount =
      max === 100 && sideOf(ident) !== this.me
        ? `un ${delta} % de sus PS`
        : `${delta} PS (${hp}/${max})`;
    return `${this.name(ident)} ${verb} ${amount}${describeSource(from)}.`;
  }
}

function describeSource(from: string | undefined): string {
  if (!from) return '';
  const source = from.slice('[from]'.length).trim();
  if (source === 'brn') return ' por la quemadura';
  if (source === 'psn' || source === 'tox') return ' por el veneno';
  if (source === 'Recoil') return ' por el retroceso';
  if (source.startsWith('item:')) return ` por ${itemName(source.slice(5).trim())}`;
  if (source.startsWith('ability:')) return ` por ${abilityName(source.slice(8).trim())}`;
  if (/sandstorm/i.test(source)) return ' por la tormenta de arena';
  if (/hail/i.test(source)) return ' por el granizo';
  return ` (${effectName(source)})`;
}

function fill(template: string, value: string): string {
  return template.replaceAll('{0}', value);
}
