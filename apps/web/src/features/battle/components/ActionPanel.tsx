/**
 * Menus for a move or switch request, built from `getSlotOptions` (through `ChoiceDraft`):
 * one active slot at a time, moves with type/PP, Mega, targets in doubles and switches.
 * Keyboard: 1–4 moves, 5–9 switches, Esc goes back.
 */
import {
  type BattleView,
  type Choice,
  type MoveOption,
  type MoveRequest,
  moveAction,
  parseCondition,
  type RequestPokemon,
  type SwitchRequest,
  switchAction,
  validateChoice,
} from '@colleja/core';
import { getDescription, getMove, type Locale, toId } from '@colleja/data';
import { moveName, speciesName } from '@colleja/narration';
import { useEffect, useMemo, useState } from 'react';
import { IconArrowLeft, IconSparkle } from '../../../components/icons';
import { PokemonIcon } from '../../../components/PokemonIcon';
import { TypeBadge } from '../../../components/TypeBadge';
import { Button, Notice, Panel } from '../../../components/ui';
import { CATEGORY_LABEL, moveDetails } from '../../../lib/move-labels';
import { typeColor } from '../../../lib/type-colors';
import { useSettings } from '../../../stores/settings';
import {
  availableSwitches,
  back,
  type ChoiceDraft,
  canGoBack,
  choose,
  createDraft,
  currentSlot,
  megaTaken,
  toChoice,
} from '../choice-draft';
import { hpPercent, hpTone } from '../format';
import { HpBar } from './Field';

export function ActionPanel({
  request,
  view,
  onChoose,
  disabled,
}: {
  request: MoveRequest | SwitchRequest;
  view: BattleView;
  onChoose: (choice: Choice) => void;
  disabled: boolean;
}) {
  const locale = useSettings((state) => state.namesLocale);
  const [draft, setDraft] = useState<ChoiceDraft>(() => createDraft(request));
  const [mega, setMega] = useState(false);
  const [aiming, setAiming] = useState<MoveOption | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  // A new request starts a new decision.
  useEffect(() => {
    setDraft(createDraft(request));
    setMega(false);
    setAiming(null);
    setProblems([]);
  }, [request]);

  const slot = currentSlot(draft);
  const switches = useMemo(() => availableSwitches(draft), [draft]);
  const forced = 'forceSwitch' in request;
  const doubles = draft.slots.length > 1;

  function commit(next: ChoiceDraft) {
    setMega(false);
    setAiming(null);
    const choice = toChoice(next);
    if (!choice) {
      setDraft(next);
      return;
    }
    const errors = validateChoice(request, choice);
    if (errors.length > 0) {
      setProblems(errors);
      setDraft(createDraft(request));
      return;
    }
    setDraft(next);
    onChoose(choice);
  }

  function pickMove(option: MoveOption) {
    if (option.disabled || disabled) return;
    if (option.targets.length > 0) {
      setAiming(option);
      return;
    }
    commit(choose(draft, moveAction(option.slot, mega ? { mega: true } : {})));
  }

  function pickTarget(target: number) {
    if (!aiming) return;
    commit(choose(draft, moveAction(aiming.slot, { target, ...(mega ? { mega: true } : {}) })));
  }

  function pickSwitch(position: number) {
    if (disabled) return;
    commit(choose(draft, switchAction(position)));
  }

  function goBack() {
    if (aiming) setAiming(null);
    else if (canGoBack(draft)) {
      setMega(false);
      setDraft(back(draft));
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target)) return;
      if (event.key === 'Escape') {
        goBack();
        return;
      }
      const number = Number(event.key);
      if (!Number.isInteger(number) || number < 1) return;
      if (aiming) {
        const target = aiming.targets[number - 1];
        if (target !== undefined) pickTarget(target);
      } else if (number <= 4 && slot) {
        const option = slot.moves[number - 1];
        if (option) pickMove(option);
      } else if (number >= 5) {
        const position = switches[number - 5];
        if (position !== undefined) pickSwitch(position);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!slot) {
    return (
      <Panel>
        <p className="p-4 text-sm text-muted">Enviando la elección…</p>
      </Panel>
    );
  }

  const name = speciesName(toId(slot.pokemon.details.split(',')[0] ?? ''), locale);
  const title = forced
    ? `¿Qué Pokémon sale en lugar de ${name}?`
    : aiming
      ? `¿A quién apunta ${moveName(aiming.move.id, locale)}?`
      : `¿Qué hará ${name}?`;

  return (
    <section className="rise rounded-md border border-line bg-surface shadow-panel">
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2">
        <h2 className="display flex items-baseline gap-3 text-xl">
          {title}
          {doubles && <span className="eyebrow text-faint">Posición {slot.index + 1}</span>}
        </h2>
        {aiming || canGoBack(draft) ? (
          <Button size="sm" variant="ghost" onClick={goBack}>
            <IconArrowLeft size={14} />
            Atrás
          </Button>
        ) : (
          <span className="eyebrow text-faint max-sm:hidden">
            {slot.moves.length > 0 ? '1–4 · 5–9 · Esc' : '5–9'}
          </span>
        )}
      </header>
      <div className="flex flex-col gap-3.5 p-4">
        {problems.length > 0 && <Notice items={problems} />}

        {aiming ? (
          <TargetPicker
            targets={aiming.targets}
            view={view}
            slotIndex={slot.index}
            onPick={pickTarget}
            locale={locale}
          />
        ) : (
          slot.moves.length > 0 && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {slot.moves.map((option, index) => (
                  <MoveButton
                    key={option.slot}
                    option={option}
                    hotkey={index + 1}
                    locale={locale}
                    disabled={disabled}
                    onClick={() => pickMove(option)}
                  />
                ))}
              </div>
              {slot.canMega && !megaTaken(draft) && (
                <label
                  className={`flex h-9 w-fit cursor-pointer items-center gap-2 rounded-sm px-3.5 font-display text-sm font-semibold tracking-[0.06em] uppercase transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-fg ${
                    mega
                      ? 'bg-accent text-on-accent'
                      : 'border border-accent-fg/50 text-accent-fg hover:bg-accent/10'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={mega}
                    onChange={(event) => setMega(event.target.checked)}
                    className="sr-only"
                  />
                  <IconSparkle size={15} />
                  Megaevolucionar
                </label>
              )}
            </>
          )
        )}

        {!aiming && (
          <SwitchList
            positions={switches}
            pokemon={request.side.pokemon}
            locale={locale}
            disabled={disabled}
            onPick={pickSwitch}
            trapped={!forced && slot.switches.length === 0 && slot.moves.length > 0}
          />
        )}
      </div>
    </section>
  );
}

function MoveButton({
  option,
  hotkey,
  locale,
  disabled,
  onClick,
}: {
  option: MoveOption;
  hotkey: number;
  locale: Locale;
  disabled: boolean;
  onClick: () => void;
}) {
  const data = getMove(option.move.id);
  const color = typeColor(data?.type);
  const description = getDescription('moves', option.move.id);
  const facts = data
    ? [CATEGORY_LABEL[data.category], data.basePower ? String(data.basePower) : null]
        .filter(Boolean)
        .join(' · ')
    : '';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={option.disabled || disabled}
      title={[moveDetails(option.move.id), description].filter(Boolean).join('\n')}
      className="flex flex-col gap-2 rounded-sm border border-line px-3.5 py-3 text-left transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-text/70 disabled:pointer-events-none disabled:opacity-35"
      style={{
        background: `linear-gradient(100deg, color-mix(in oklab, ${color} 26%, var(--surface-2)), var(--surface-2) 72%)`,
      }}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[17px] font-semibold">
          {moveName(option.move.id, locale)}
        </span>
        <Kbd>{hotkey}</Kbd>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {data ? <TypeBadge type={data.type} locale={locale} /> : null}
          <span className="truncate text-xs text-muted">{facts}</span>
        </span>
        <span className="shrink-0 font-display text-[13px] font-semibold text-muted tabular-nums">
          {option.move.pp !== undefined ? `PP ${option.move.pp}/${option.move.maxpp}` : ''}
        </span>
      </span>
    </button>
  );
}

function TargetPicker({
  targets,
  view,
  slotIndex,
  onPick,
  locale,
}: {
  targets: number[];
  view: BattleView;
  slotIndex: number;
  onPick: (target: number) => void;
  locale: Locale;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {targets.map((target, i) => {
        const rival = target > 0;
        const pokemon = (rival ? view.sides.p2 : view.sides.p1).active[Math.abs(target) - 1];
        const self = !rival && Math.abs(target) - 1 === slotIndex;
        const label = pokemon ? speciesName(pokemon.species, locale) : 'Posición vacía';
        return (
          <button
            key={target}
            type="button"
            onClick={() => onPick(target)}
            className={`flex items-center gap-3 rounded-sm border bg-surface-2 px-3 py-2 text-left transition-colors hover:bg-surface-3 ${
              rival
                ? 'border-rival/40 hover:border-rival'
                : 'border-accent-fg/40 hover:border-accent-fg'
            }`}
          >
            {pokemon && <PokemonIcon species={pokemon.species} size={40} />}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{label}</span>
              <span className={`eyebrow ${rival ? 'text-rival' : 'text-accent-fg'}`}>
                {rival ? 'Rival' : self ? 'Él mismo' : 'Aliado'} · {Math.abs(target)}
              </span>
            </span>
            <Kbd>{i + 1}</Kbd>
          </button>
        );
      })}
    </div>
  );
}

function SwitchList({
  positions,
  pokemon,
  locale,
  disabled,
  onPick,
  trapped,
}: {
  positions: number[];
  pokemon: RequestPokemon[];
  locale: Locale;
  disabled: boolean;
  onPick: (position: number) => void;
  trapped: boolean;
}) {
  if (positions.length === 0) {
    return trapped ? <p className="eyebrow text-faint">No puede cambiar</p> : null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="eyebrow w-16 text-faint">Cambiar</span>
      {positions.map((position, i) => {
        const entry = pokemon[position - 1];
        if (!entry) return null;
        const species = toId(entry.details.split(',')[0] ?? '');
        const condition = parseCondition(entry.condition);
        const percent = hpPercent(condition.hp, condition.maxhp);
        return (
          <button
            key={position}
            type="button"
            onClick={() => onPick(position)}
            disabled={disabled}
            className="flex items-center gap-2.5 rounded-sm border border-line bg-surface-2 py-1 pr-2.5 pl-1 text-left transition-colors hover:border-text/60 hover:bg-surface-3 disabled:opacity-35"
          >
            <PokemonIcon species={species} size={40} />
            <span className="flex min-w-24 flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                {speciesName(species, locale)}
                {condition.status && (
                  <span className="eyebrow text-warn">{condition.status.toUpperCase()}</span>
                )}
              </span>
              <HpBar percent={percent} tone={hpTone(percent)} thin />
            </span>
            {i < 5 && <Kbd>{i + 5}</Kbd>}
          </button>
        );
      })}
    </div>
  );
}

function Kbd({ children }: { children: number }) {
  return (
    <kbd className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-xs border border-text/20 text-muted">
      {children}
    </kbd>
  );
}

/** Shortcuts must not fire while typing (text fields, selects); checkboxes are fine. */
function isTyping(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return (
    target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'radio'
  );
}
