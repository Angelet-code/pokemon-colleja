/**
 * The battlefield as a stage: the rival's active Pokémon at the top right, yours at the bottom
 * left, each on its platform with its HP card; field and side effects; both teams as icons.
 * Everything comes from `BattleView` (p1 perspective) and, for your own Pokémon, the last
 * request (exact HP, item, ability). With `onAnimator`, it also carries the animation layers
 * (ADR-0020): each active Pokémon is marked with `data-slot` and its sprite with `data-fx`.
 * With `aim`, the Pokémon a move can hit light up and a click on them picks the target.
 */
import type { BattleView, RequestPokemon, SideId, ViewPokemon } from '@colleja/core';
import { currentTypes, detailsShiny, parseCondition } from '@colleja/core';
import { type Locale, toId } from '@colleja/data';
import { abilityName, itemName, speciesName, statusName, statusShort } from '@colleja/narration';
import { type CSSProperties, useRef, useState } from 'react';
import { ItemIcon } from '../../../components/ItemIcon';
import { PokemonIcon, PokemonSprite } from '../../../components/PokemonIcon';
import { TypeBadge } from '../../../components/TypeBadge';
import { Chip } from '../../../components/ui';
import { useSettings } from '../../../stores/settings';
import { FxLayer } from '../animation/FxLayer';
import type { Animator } from '../animation/player';
import { boostLabels, fieldEffects, hpPercent, hpTone, sideConditions } from '../format';
import type { AimTarget, TargetAim } from '../target-aim';

const SIDE_COLOR: Record<SideId, string> = { p1: 'var(--accent)', p2: 'var(--rival)' };

/**
 * `own`: your team as in the last request (exact HP, item, ability), in battle order.
 * `onAnimator`: receives the animator of this stage (and `null` when it goes away).
 * `aim`: a move waiting for its target (doubles).
 */
export function Field({
  view,
  own,
  onAnimator,
  aim = null,
}: {
  view: BattleView;
  own: RequestPokemon[];
  onAnimator?: (animator: Animator | null) => void;
  aim?: TargetAim | null;
}) {
  const locale = useSettings((state) => state.namesLocale);
  const effects = fieldEffects(view.field, locale);
  const doubles = Math.max(view.sides.p1.active.length, view.sides.p2.active.length) > 1;
  const stageRef = useRef<HTMLElement>(null);
  // A spread attack lights up all its targets together when one is hovered.
  const [spreadHover, setSpreadHover] = useState(false);
  const aiming: Aiming | null = aim
    ? { aim, spreadHover: aim.spread && spreadHover, setSpreadHover }
    : null;

  return (
    <section
      ref={stageRef}
      aria-label="Campo de batalla"
      className="stage @container relative isolate overflow-hidden rounded-md border border-line"
    >
      {onAnimator && <FxLayer rootRef={stageRef} onAnimator={onAnimator} />}
      <div data-fx="content" className="relative z-[1] flex min-h-[420px] flex-col justify-between">
        <div className="flex items-start justify-between gap-2 p-3">
          <Conditions items={sideConditions(view.sides.p2.conditions, locale)} label="Lado rival" />
          <TeamStrip side="p2" view={view} own={own} locale={locale} />
        </div>

        <ActiveRow
          side="p2"
          view={view}
          own={own}
          locale={locale}
          doubles={doubles}
          aiming={aiming}
        />

        <div className="flex min-h-6 justify-center px-3">
          {effects.length > 0 && (
            <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Efectos del campo">
              {effects.map((effect) => (
                <li key={effect}>
                  <Chip tone="warn" className="h-6 px-2.5 text-xs">
                    {effect}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </div>

        <ActiveRow
          side="p1"
          view={view}
          own={own}
          locale={locale}
          doubles={doubles}
          aiming={aiming}
        />

        <div className="flex items-end justify-between gap-2 p-3">
          <TeamStrip side="p1" view={view} own={own} locale={locale} />
          <Conditions items={sideConditions(view.sides.p1.conditions, locale)} label="Tu lado" />
        </div>
      </div>
    </section>
  );
}

interface Aiming {
  aim: TargetAim;
  /** A spread attack is hovered: all its targets light up. */
  spreadHover: boolean;
  setSpreadHover: (hover: boolean) => void;
}

function ActiveRow({
  side,
  view,
  own,
  locale,
  doubles,
  aiming,
}: {
  side: SideId;
  view: BattleView;
  own: RequestPokemon[];
  locale: Locale;
  doubles: boolean;
  aiming: Aiming | null;
}) {
  const active = view.sides[side].active;
  const rival = side === 'p2';
  if (active.length === 0) return <div className="h-32" />;
  return (
    <div
      className={`flex flex-wrap gap-x-6 gap-y-2 px-4 ${rival ? 'justify-end' : 'justify-start'}`}
    >
      {active.map((pokemon, index) => {
        if (!pokemon) {
          // biome-ignore lint/suspicious/noArrayIndexKey: one entry per field position.
          return <div key={index} className={doubles ? 'w-64' : 'w-72'} />;
        }
        const location = rival ? index + 1 : -(index + 1);
        const hotkey = aiming ? aiming.aim.targets.findIndex((t) => t.location === location) : -1;
        const target = aiming?.aim.targets[hotkey];
        return (
          <Combatant
            // biome-ignore lint/suspicious/noArrayIndexKey: one entry per field position.
            key={index}
            slot={`${side}${'abc'[index] ?? 'a'}`}
            pokemon={pokemon}
            details={rival ? undefined : own.find((entry) => sameIdent(entry.ident, pokemon.ident))}
            side={side}
            locale={locale}
            compact={doubles}
            target={aiming && target ? { aiming, target, hotkey: hotkey + 1 } : null}
          />
        );
      })}
    </div>
  );
}

function Combatant({
  slot,
  pokemon,
  details,
  side,
  locale,
  compact,
  target,
}: {
  /** Field position (`p2a`), for the animations. */
  slot: string;
  pokemon: ViewPokemon;
  details: RequestPokemon | undefined;
  side: SideId;
  locale: Locale;
  compact: boolean;
  /** The aimed move can hit this Pokémon. */
  target: { aiming: Aiming; target: AimTarget; hotkey: number } | null;
}) {
  const rival = side === 'p2';
  const sprite = compact ? 104 : 136;
  // In doubles, a narrow stage (next to the controls) puts the HP card above or below the sprite.
  const direction = compact
    ? rival
      ? 'flex-col @4xl:flex-row'
      : 'flex-col-reverse @4xl:flex-row-reverse'
    : rival
      ? 'flex-row'
      : 'flex-row-reverse';
  return (
    <div
      data-slot={slot}
      className={`relative flex items-center gap-1 ${direction}`}
      style={{ '--side': SIDE_COLOR[side] } as CSSProperties}
    >
      {target && (
        <AimButton
          {...target}
          name={speciesName(pokemon.species, locale)}
          rival={rival}
          compact={compact}
        />
      )}
      <HpCard pokemon={pokemon} details={details} rival={rival} locale={locale} />
      <div
        className="relative flex shrink-0 items-end justify-center"
        style={{ width: sprite + 24 }}
      >
        <span
          aria-hidden="true"
          className="platform absolute -bottom-2 left-1/2 h-12 w-[130%] -translate-x-1/2 rounded-[50%]"
        />
        <div data-fx="sprite" className="relative">
          <PokemonSprite
            species={pokemon.species}
            shiny={detailsShiny(pokemon.details)}
            size={sprite}
            className={`transition-opacity duration-500 ${pokemon.fainted ? 'opacity-0' : ''} ${rival ? '' : '-scale-x-100'}`}
          />
        </div>
      </div>
    </div>
  );
}

/** Clickable layer over a Pokémon the aimed move can hit, with its hotkey and expected effect. */
function AimButton({
  aiming,
  target,
  hotkey,
  name,
  rival,
  compact,
}: {
  aiming: Aiming;
  target: AimTarget;
  hotkey: number;
  name: string;
  rival: boolean;
  compact: boolean;
}) {
  const { aim, spreadHover, setSpreadHover } = aiming;
  const tone = rival
    ? 'border-rival/70 bg-rival/5 hover:bg-rival/15 data-[lit=true]:bg-rival/15'
    : 'border-accent-fg/70 bg-accent/5 hover:bg-accent/15 data-[lit=true]:bg-accent/15';
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setSpreadHover(false);
        aim.onPick(target.location);
      }}
      onMouseEnter={() => aim.spread && setSpreadHover(true)}
      onMouseLeave={() => aim.spread && setSpreadHover(false)}
      data-lit={spreadHover}
      aria-label={aim.spread ? `Lanzar ${aim.moveName} (${name})` : `Apuntar a ${name}`}
      className={`aim-target absolute -inset-1.5 z-10 flex cursor-crosshair flex-col justify-between rounded-md border-2 p-1.5 transition-colors ${tone} ${
        rival ? 'items-start' : 'items-end'
      }`}
    >
      {!aim.spread && (
        <kbd className="inline-flex size-[18px] items-center justify-center rounded-xs bg-surface/90 font-display text-xs text-text">
          {hotkey}
        </kbd>
      )}
      {target.detail && (
        <span
          className={`mt-auto rounded-xs bg-surface/95 px-1.5 py-0.5 backdrop-blur-sm ${
            compact ? '' : 'text-sm'
          }`}
        >
          {target.detail}
        </span>
      )}
    </button>
  );
}

function HpCard({
  pokemon,
  details,
  rival,
  locale,
}: {
  pokemon: ViewPokemon;
  details: RequestPokemon | undefined;
  rival: boolean;
  locale: Locale;
}) {
  const percent = hpPercent(pokemon.hp, pokemon.maxhp);
  const boosts = boostLabels(pokemon, locale);
  const item = details?.item ?? pokemon.item;
  const ability = details?.ability ?? details?.baseAbility ?? pokemon.ability;
  return (
    <div
      className={`w-56 rounded-sm bg-surface/90 px-3.5 py-3 backdrop-blur-sm sm:w-64 ${
        rival ? 'shadow-[inset_-2px_0_0_var(--side)]' : 'shadow-[inset_2px_0_0_var(--side)]'
      }`}
    >
      <div className={`flex items-center justify-between gap-2 ${rival ? 'flex-row-reverse' : ''}`}>
        <span className="display truncate text-[22px]" title={pokemon.name}>
          {speciesName(pokemon.species, locale)}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {pokemon.megaEvolved && <Chip tone="accent">Mega</Chip>}
          {pokemon.status && (
            <Chip tone="warn" title={statusName(pokemon.status)}>
              {statusShort(pokemon.status, locale)}
            </Chip>
          )}
        </span>
      </div>
      <ul className={`mt-1.5 flex gap-1 ${rival ? 'justify-end' : ''}`} aria-label="Tipos">
        {currentTypes(pokemon).map((type) => (
          <li key={type}>
            <TypeBadge type={type} locale={locale} />
          </li>
        ))}
      </ul>
      <HpBar percent={percent} tone={hpTone(percent)} />
      <div
        className={`mt-1.5 flex font-display text-sm font-semibold tabular-nums ${
          rival ? 'justify-end' : 'justify-between'
        }`}
      >
        <span>{rival ? `${Math.round(percent)} %` : `${pokemon.hp} / ${pokemon.maxhp} PS`}</span>
        {!rival && <span className="text-muted">{Math.round(percent)} %</span>}
      </div>
      {boosts.length > 0 && (
        <ul
          className={`mt-1.5 flex flex-wrap gap-1 ${rival ? 'justify-end' : ''}`}
          aria-label="Cambios de características"
        >
          {boosts.map((boost) => (
            <li key={boost.label}>
              <Chip tone={boost.value > 0 ? 'good' : 'bad'}>{boost.label}</Chip>
            </li>
          ))}
        </ul>
      )}
      {(item || ability) && (
        <p
          className={`mt-1.5 flex items-center gap-1 text-xs text-muted ${rival ? 'justify-end' : ''}`}
        >
          <span className="truncate">
            {ability && abilityName(ability, locale)}
            {ability && item ? ' · ' : ''}
            {item && itemName(item, locale)}
          </span>
          {item && <ItemIcon item={toId(item)} size={20} className="-my-1" />}
        </p>
      )}
    </div>
  );
}

const HP_COLOR = { good: 'var(--hp-good)', warn: 'var(--hp-warn)', bad: 'var(--hp-bad)' };

export function HpBar({
  percent,
  tone,
  thin = false,
}: {
  percent: number;
  tone: 'good' | 'warn' | 'bad';
  thin?: boolean;
}) {
  return (
    // Decorative: the HP figures are written next to the bar.
    <div
      className={`relative overflow-hidden rounded-[1px] bg-surface-3 ${thin ? 'h-1' : 'mt-2.5 h-2'}`}
      aria-hidden="true"
    >
      <div
        className="h-full transition-[width,background-color] duration-(--fx-hp-ms,500ms) ease-out"
        style={{ width: `${percent}%`, background: HP_COLOR[tone] }}
      />
      {!thin && (
        <span className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_calc(10%-1px),var(--surface)_calc(10%-1px)_10%)] opacity-80" />
      )}
    </div>
  );
}

/** Your team (from the request) or the rival's (preview, plus what has been seen). */
function TeamStrip({
  side,
  view,
  own,
  locale,
}: {
  side: SideId;
  view: BattleView;
  own: RequestPokemon[];
  locale: Locale;
}) {
  const members =
    side === 'p1'
      ? own.map((entry) => {
          const condition = parseCondition(entry.condition);
          return {
            species: toId(entry.details.split(',')[0] ?? ''),
            shiny: detailsShiny(entry.details),
            fainted: condition.fainted,
            active: entry.active,
          };
        })
      : rivalMembers(view);
  if (members.length === 0) return <div />;
  return (
    <ul
      className="flex gap-0.5 rounded-sm bg-surface/70 p-1 backdrop-blur-sm"
      aria-label={side === 'p1' ? 'Tu equipo' : 'Equipo rival'}
    >
      {members.map((member, index) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: team order is the identity.
          key={index}
          title={speciesName(member.species, locale)}
          className={
            member.active
              ? side === 'p1'
                ? 'shadow-[inset_0_-2px_0_var(--accent)]'
                : 'shadow-[inset_0_-2px_0_var(--rival)]'
              : ''
          }
        >
          <PokemonIcon
            species={member.species}
            shiny={member.shiny}
            size={32}
            fainted={member.fainted}
          />
        </li>
      ))}
    </ul>
  );
}

function rivalMembers(view: BattleView) {
  const side = view.sides.p2;
  const seen = new Map(side.pokemon.map((pokemon) => [pokemon.baseSpecies, pokemon]));
  const species =
    side.preview.length > 0 ? side.preview : side.pokemon.map((pokemon) => pokemon.baseSpecies);
  return species.map((id, index) => {
    const pokemon = seen.get(id) ?? side.pokemon.find((entry) => entry.species === id);
    return {
      species: pokemon?.species ?? id,
      shiny: pokemon ? detailsShiny(pokemon.details) : (side.previewShiny[index] ?? false),
      fainted: pokemon?.fainted ?? false,
      active: pokemon?.position !== null && pokemon?.position !== undefined,
    };
  });
}

function Conditions({ items, label }: { items: string[]; label: string }) {
  if (items.length === 0) return <div />;
  return (
    <ul className="flex flex-wrap gap-1" aria-label={label}>
      {items.map((item) => (
        <li key={item}>
          <span className="inline-flex h-5 items-center rounded-xs bg-surface/80 px-1.5 font-display text-[11px] font-semibold tracking-[0.08em] uppercase backdrop-blur-sm">
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

function sameIdent(requestIdent: string, viewIdent: string): boolean {
  return requestIdent.replace(/^p(\d)[a-z]?:/, 'p$1:') === viewIdent;
}
