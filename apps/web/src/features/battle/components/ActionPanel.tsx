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
import { moveName, speciesName, typeName } from '@colleja/narration';
import { useEffect, useMemo, useState } from 'react';
import { PokemonIcon } from '../../../components/PokemonIcon';
import { Button, Panel } from '../../../components/ui';
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
import { hpPercent } from '../format';

const CATEGORY_LABEL: Record<string, string> = {
  Physical: 'Físico',
  Special: 'Especial',
  Status: 'Estado',
};

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
    <Panel
      title={
        <span className="normal-case tracking-normal">
          {title}
          {doubles && (
            <span className="ml-2 text-xs font-normal text-faint">Posición {slot.index + 1}</span>
          )}
        </span>
      }
      actions={
        (aiming || canGoBack(draft)) && (
          <Button variant="ghost" onClick={goBack}>
            ← Atrás
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3 p-3">
        {problems.length > 0 && (
          <ul
            role="alert"
            className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-xs text-bad"
          >
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

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
              <div className="grid grid-cols-2 gap-2">
                {slot.moves.map((option) => (
                  <MoveButton
                    key={option.slot}
                    option={option}
                    locale={locale}
                    disabled={disabled}
                    onClick={() => pickMove(option)}
                  />
                ))}
              </div>
              {slot.canMega && !megaTaken(draft) && (
                <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={mega}
                    onChange={(event) => setMega(event.target.checked)}
                    className="size-4 accent-[var(--accent)]"
                  />
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
    </Panel>
  );
}

function MoveButton({
  option,
  locale,
  disabled,
  onClick,
}: {
  option: MoveOption;
  locale: Locale;
  disabled: boolean;
  onClick: () => void;
}) {
  const data = getMove(option.move.id);
  const color = typeColor(data?.type);
  const details = [
    data && CATEGORY_LABEL[data.category],
    data?.basePower ? `Potencia ${data.basePower}` : null,
    data && typeof data.accuracy === 'number' ? `Precisión ${data.accuracy} %` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const description = getDescription('moves', option.move.id);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={option.disabled || disabled}
      title={[details, description].filter(Boolean).join('\n')}
      className="group relative overflow-hidden rounded-lg border border-border bg-panel-2 px-3 py-2 text-left transition hover:-translate-y-px hover:bg-panel-3 focus-visible:outline-2 focus-visible:outline-accent disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate font-semibold">{moveName(option.move.id, locale)}</span>
        <span className="shrink-0 text-xs text-faint">{option.slot}</span>
      </span>
      <span className="mt-0.5 flex items-center justify-between gap-2 text-xs">
        <span
          className="rounded px-1.5 py-px font-semibold text-white"
          style={{ background: color }}
        >
          {data ? typeName(data.type, locale) : '—'}
        </span>
        <span className="text-muted tabular-nums">
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
    <div className="grid grid-cols-2 gap-2">
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
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition hover:bg-panel-3 focus-visible:outline-2 focus-visible:outline-accent ${
              rival ? 'border-bad/40' : 'border-good/40'
            }`}
          >
            {pokemon && <PokemonIcon species={pokemon.species} size={32} />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{label}</span>
              <span className="block text-xs text-muted">
                {rival ? 'Rival' : self ? 'Él mismo' : 'Aliado'} · posición {Math.abs(target)}
              </span>
            </span>
            <span className="text-xs text-faint">{i + 1}</span>
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
    return trapped ? <p className="text-xs text-muted">No puede cambiar de Pokémon.</p> : null;
  }
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted uppercase">Cambiar</p>
      <div className="flex flex-wrap gap-2">
        {positions.map((position, i) => {
          const entry = pokemon[position - 1];
          if (!entry) return null;
          const species = toId(entry.details.split(',')[0] ?? '');
          const condition = parseCondition(entry.condition);
          const percent = Math.round(hpPercent(condition.hp, condition.maxhp));
          return (
            <button
              key={position}
              type="button"
              onClick={() => onPick(position)}
              disabled={disabled}
              className="flex items-center gap-2 rounded-lg border border-border bg-panel-2 py-1 pr-3 pl-1 text-left transition hover:bg-panel-3 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
            >
              <PokemonIcon species={species} size={32} />
              <span>
                <span className="block text-sm font-semibold">{speciesName(species, locale)}</span>
                <span className="block text-xs text-muted tabular-nums">
                  {percent} %{condition.status ? ` · ${condition.status.toUpperCase()}` : ''}
                  {i < 5 ? ` · ${i + 5}` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Shortcuts must not fire while typing (text fields, selects); checkboxes are fine. */
function isTyping(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return (
    target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'radio'
  );
}
