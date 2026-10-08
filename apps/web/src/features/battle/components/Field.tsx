/**
 * The battlefield as a stage: the rival's active Pokémon at the top right, yours at the bottom
 * left, each on its platform with its HP card; field and side effects; both teams as icons.
 * Everything comes from `BattleView` (p1 perspective) and, for your own Pokémon, the last
 * request (exact HP, item, ability).
 */
import type { BattleView, RequestPokemon, SideId, ViewPokemon } from '@colleja/core';
import { currentTypes, parseCondition } from '@colleja/core';
import { type Locale, toId } from '@colleja/data';
import { abilityName, itemName, speciesName, statusName, statusShort } from '@colleja/narration';
import type { CSSProperties } from 'react';
import { ItemIcon } from '../../../components/ItemIcon';
import { PokemonIcon, PokemonSprite } from '../../../components/PokemonIcon';
import { TypeBadge } from '../../../components/TypeBadge';
import { Chip } from '../../../components/ui';
import { useSettings } from '../../../stores/settings';
import { boostLabels, fieldEffects, hpPercent, hpTone, sideConditions } from '../format';

const SIDE_COLOR: Record<SideId, string> = { p1: 'var(--accent)', p2: 'var(--rival)' };

/** `own`: your team as in the last request (exact HP, item, ability), in battle order. */
export function Field({ view, own }: { view: BattleView; own: RequestPokemon[] }) {
  const locale = useSettings((state) => state.namesLocale);
  const effects = fieldEffects(view.field, locale);
  const doubles = Math.max(view.sides.p1.active.length, view.sides.p2.active.length) > 1;

  return (
    <section
      aria-label="Campo de batalla"
      className="stage relative isolate flex min-h-[420px] flex-col justify-between overflow-hidden rounded-md border border-line"
    >
      <div className="flex items-start justify-between gap-2 p-3">
        <Conditions items={sideConditions(view.sides.p2.conditions, locale)} label="Lado rival" />
        <TeamStrip side="p2" view={view} own={own} locale={locale} />
      </div>

      <ActiveRow side="p2" view={view} own={own} locale={locale} doubles={doubles} />

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

      <ActiveRow side="p1" view={view} own={own} locale={locale} doubles={doubles} />

      <div className="flex items-end justify-between gap-2 p-3">
        <TeamStrip side="p1" view={view} own={own} locale={locale} />
        <Conditions items={sideConditions(view.sides.p1.conditions, locale)} label="Tu lado" />
      </div>
    </section>
  );
}

function ActiveRow({
  side,
  view,
  own,
  locale,
  doubles,
}: {
  side: SideId;
  view: BattleView;
  own: RequestPokemon[];
  locale: Locale;
  doubles: boolean;
}) {
  const active = view.sides[side].active;
  const rival = side === 'p2';
  if (active.length === 0) return <div className="h-32" />;
  return (
    <div
      className={`flex flex-wrap gap-x-6 gap-y-2 px-4 ${rival ? 'justify-end' : 'justify-start'}`}
    >
      {active.map((pokemon, index) =>
        pokemon ? (
          <Combatant
            // biome-ignore lint/suspicious/noArrayIndexKey: one entry per field position.
            key={index}
            pokemon={pokemon}
            details={rival ? undefined : own.find((entry) => sameIdent(entry.ident, pokemon.ident))}
            side={side}
            locale={locale}
            compact={doubles}
          />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: one entry per field position.
          <div key={index} className={doubles ? 'w-64' : 'w-72'} />
        ),
      )}
    </div>
  );
}

function Combatant({
  pokemon,
  details,
  side,
  locale,
  compact,
}: {
  pokemon: ViewPokemon;
  details: RequestPokemon | undefined;
  side: SideId;
  locale: Locale;
  compact: boolean;
}) {
  const rival = side === 'p2';
  const sprite = compact ? 104 : 136;
  return (
    <div
      className={`flex items-center gap-1 ${rival ? 'flex-row' : 'flex-row-reverse'}`}
      style={{ '--side': SIDE_COLOR[side] } as CSSProperties}
    >
      <HpCard pokemon={pokemon} details={details} rival={rival} locale={locale} />
      <div
        className="relative flex shrink-0 items-end justify-center"
        style={{ width: sprite + 24 }}
      >
        <span
          aria-hidden="true"
          className="platform absolute -bottom-2 left-1/2 h-12 w-[130%] -translate-x-1/2 rounded-[50%]"
        />
        <PokemonSprite
          species={pokemon.species}
          size={sprite}
          className={`relative transition-opacity duration-500 ${pokemon.fainted ? 'opacity-0' : ''} ${rival ? '' : '-scale-x-100'}`}
        />
      </div>
    </div>
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
    <div className="w-56 rounded-sm bg-surface/90 px-3.5 py-3 shadow-[inset_2px_0_0_var(--side)] backdrop-blur-sm sm:w-64">
      <div className="flex items-center justify-between gap-2">
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
      <ul className="mt-1.5 flex gap-1" aria-label="Tipos">
        {currentTypes(pokemon).map((type) => (
          <li key={type}>
            <TypeBadge type={type} locale={locale} />
          </li>
        ))}
      </ul>
      <HpBar percent={percent} tone={hpTone(percent)} />
      <div className="mt-1.5 flex justify-between font-display text-sm font-semibold tabular-nums">
        <span>{rival ? `${Math.round(percent)} %` : `${pokemon.hp} / ${pokemon.maxhp} PS`}</span>
        {!rival && <span className="text-muted">{Math.round(percent)} %</span>}
      </div>
      {boosts.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Cambios de características">
          {boosts.map((boost) => (
            <li key={boost.label}>
              <Chip tone={boost.value > 0 ? 'good' : 'bad'}>{boost.label}</Chip>
            </li>
          ))}
        </ul>
      )}
      {(item || ability) && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-muted">
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
        className="h-full transition-[width,background-color] duration-500 ease-out"
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
          <PokemonIcon species={member.species} size={32} fainted={member.fainted} />
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
  return species.map((id) => {
    const pokemon = seen.get(id) ?? side.pokemon.find((entry) => entry.species === id);
    return {
      species: pokemon?.species ?? id,
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
