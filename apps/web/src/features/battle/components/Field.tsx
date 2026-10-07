/**
 * The battlefield: the rival's active Pokémon at the top, yours at the bottom, field and side
 * effects, and both teams as icons. Everything comes from `BattleView` (p1 perspective) and,
 * for your own Pokémon, the last request (exact HP, item, ability).
 */
import type { BattleView, RequestPokemon, SideId, ViewPokemon } from '@colleja/core';
import { parseCondition } from '@colleja/core';
import { type Locale, toId } from '@colleja/data';
import { abilityName, itemName, speciesName, statusName, statusShort } from '@colleja/narration';
import { PokemonIcon, PokemonSprite } from '../../../components/PokemonIcon';
import { useSettings } from '../../../stores/settings';
import { boostLabels, fieldEffects, hpPercent, hpTone, sideConditions } from '../format';

/** `own`: your team as in the last request (exact HP, item, ability), in battle order. */
export function Field({ view, own }: { view: BattleView; own: RequestPokemon[] }) {
  const locale = useSettings((state) => state.namesLocale);
  const effects = fieldEffects(view.field, locale);

  return (
    <section
      aria-label="Campo de batalla"
      className="relative overflow-hidden rounded-xl border border-border"
      style={{ background: 'linear-gradient(180deg, var(--stage-top), var(--stage-bottom))' }}
    >
      <div className="flex items-start justify-between gap-2 px-3 pt-3">
        <TeamStrip side="p2" view={view} own={own} locale={locale} />
        <Conditions items={sideConditions(view.sides.p2.conditions, locale)} label="Lado rival" />
      </div>

      <ActiveRow side="p2" view={view} own={own} locale={locale} />

      <div className="flex min-h-7 justify-center px-3">
        {effects.length > 0 && (
          <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Efectos del campo">
            {effects.map((effect) => (
              <li
                key={effect}
                className="rounded-full border border-border bg-panel/80 px-2.5 py-0.5 text-xs font-medium backdrop-blur"
              >
                {effect}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ActiveRow side="p1" view={view} own={own} locale={locale} />

      <div className="flex items-end justify-between gap-2 px-3 pb-3">
        <Conditions items={sideConditions(view.sides.p1.conditions, locale)} label="Tu lado" />
        <TeamStrip side="p1" view={view} own={own} locale={locale} />
      </div>
    </section>
  );
}

function ActiveRow({
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
  const active = view.sides[side].active;
  if (active.length === 0) return <div className="h-28" />;
  const rival = side === 'p2';
  return (
    <div className={`flex gap-4 px-4 py-2 ${rival ? 'justify-end' : 'justify-start'}`}>
      {active.map((pokemon, index) =>
        pokemon ? (
          <ActivePokemon
            // biome-ignore lint/suspicious/noArrayIndexKey: one entry per field position.
            key={index}
            pokemon={pokemon}
            details={rival ? undefined : own.find((entry) => sameIdent(entry.ident, pokemon.ident))}
            rival={rival}
            locale={locale}
          />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: one entry per field position.
          <div key={index} className="w-56" />
        ),
      )}
    </div>
  );
}

function ActivePokemon({
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
  const tone = hpTone(percent);
  const boosts = boostLabels(pokemon, locale);
  const item = details?.item ?? pokemon.item;
  const ability = details?.ability ?? details?.baseAbility ?? pokemon.ability;
  const card = (
    <div className="w-56 rounded-lg border border-border bg-panel/90 px-3 py-2 shadow-sm backdrop-blur">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-semibold" title={pokemon.name}>
          {speciesName(pokemon.species, locale)}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {pokemon.megaEvolved && (
            <span className="rounded bg-accent/15 px-1 text-[10px] font-bold text-accent">
              MEGA
            </span>
          )}
          {pokemon.status && (
            <span
              className="rounded bg-warn/20 px-1 text-[10px] font-bold text-warn"
              title={statusName(pokemon.status)}
            >
              {statusShort(pokemon.status, locale)}
            </span>
          )}
        </span>
      </div>
      <HpBar percent={percent} tone={tone} />
      <div className="mt-0.5 flex justify-between text-xs text-muted tabular-nums">
        <span>{rival ? `${Math.round(percent)} %` : `${pokemon.hp}/${pokemon.maxhp} PS`}</span>
        {!rival && <span>{Math.round(percent)} %</span>}
      </div>
      {boosts.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1" aria-label="Cambios de características">
          {boosts.map((boost) => (
            <li
              key={boost.label}
              className={`rounded px-1 text-[10px] font-semibold ${boost.value > 0 ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'}`}
            >
              {boost.label}
            </li>
          ))}
        </ul>
      )}
      {(item || ability) && (
        <p className="mt-1 truncate text-[11px] text-muted">
          {ability && abilityName(ability, locale)}
          {ability && item ? ' · ' : ''}
          {item && itemName(item, locale)}
        </p>
      )}
    </div>
  );
  return (
    <div className={`flex items-end gap-2 ${rival ? 'flex-row' : 'flex-row-reverse'}`}>
      {card}
      <PokemonSprite
        species={pokemon.species}
        size={112}
        className={`transition-opacity ${pokemon.fainted ? 'opacity-0' : ''} ${rival ? '' : '-scale-x-100'}`}
      />
    </div>
  );
}

export function HpBar({ percent, tone }: { percent: number; tone: 'good' | 'warn' | 'bad' }) {
  const color = { good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad' }[tone];
  return (
    // Decorative: the HP figures are written next to the bar.
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-panel-3" aria-hidden="true">
      <div
        className={`h-full rounded-full ${color} transition-[width] duration-500 ease-out`}
        style={{ width: `${percent}%` }}
      />
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
      className="flex gap-0.5 rounded-lg bg-panel/60 p-1 backdrop-blur"
      aria-label={side === 'p1' ? 'Tu equipo' : 'Equipo rival'}
    >
      {members.map((member, index) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: team order is the identity.
          key={index}
          title={speciesName(member.species, locale)}
          className={member.active ? 'rounded bg-accent/15' : ''}
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
        <li
          key={item}
          className="rounded-full bg-panel/80 px-2 py-0.5 text-[11px] font-medium backdrop-blur"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function sameIdent(requestIdent: string, viewIdent: string): boolean {
  return requestIdent.replace(/^p(\d)[a-z]?:/, 'p$1:') === viewIdent;
}
