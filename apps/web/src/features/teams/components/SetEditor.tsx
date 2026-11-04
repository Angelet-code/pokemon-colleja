/**
 * The sheet of one member: species, nickname, gender, shiny, ability, item, nature, Stat
 * Points and moves, with each problem next to the field that causes it. The calculator uses it
 * too, without nickname and with the ability as buttons (`calculator`).
 */
import { MAX_MOVES, type PokemonSet, type SetField } from '@colleja/core';
import {
  type GameMode,
  getDescription,
  getMove,
  getName,
  getSpecies,
  getStandardSets,
  type Locale,
  type MoveId,
  type StatId,
} from '@colleja/data';
import { type ReactNode, useMemo, useState } from 'react';
import { Combobox, type ComboOption } from '../../../components/Combobox';
import { IconDownload, IconTrash, IconUpload } from '../../../components/icons';
import { PokemonSprite } from '../../../components/PokemonIcon';
import { TypeBadge } from '../../../components/TypeBadge';
import {
  Checkbox,
  Chip,
  Field,
  IconButton,
  Segmented,
  Select,
  TextInput,
} from '../../../components/ui';
import { CATEGORY_LABEL } from '../../../lib/move-labels';
import { typeColor } from '../../../lib/type-colors';
import {
  abilityOptions,
  itemOptions,
  moveOptions,
  natureOptions,
  ownedSpeciesOptions,
  speciesOptions,
  speciesWithMegaOptions,
  standardSetLabel,
} from '../options';
import {
  applyStandardSet,
  changeSpecies,
  exportMember,
  importText,
  itemChoices,
  megaOf,
  setMoveAt,
  setStatPointOf,
  type TeamDraft,
  withMegaSpecies,
} from '../team-draft';
import { FieldProblems, StatPointsEditor } from './StatPointsEditor';
import { ExportDialog, ImportDialog } from './TextDialogs';

type FieldProblemMap = Partial<Record<SetField, string[]>>;

export function SetEditor({
  draft,
  index,
  locale,
  problems,
  onChange,
  onRemove,
  megaEvolved,
  ownedSpecies,
  statsLast = false,
  onSpeciesPick,
  maxMoves = MAX_MOVES,
  calculator = false,
}: {
  draft: TeamDraft;
  index: number;
  locale: Locale;
  problems: FieldProblemMap;
  onChange: (set: PokemonSet) => void;
  /** Without it there is no "Quitar" button (e.g. in the calculator). */
  onRemove?: () => void;
  /**
   * Whether the sheet shows the Mega form. By default, whenever the set holds its stone (the
   * teambuilder); the calculator passes its Mega switch.
   */
  megaEvolved?: boolean;
  /** When given, the species picker only offers these (the «PC de Bill» filter). */
  ownedSpecies?: readonly string[];
  /**
   * The Stat Points at the bottom, under the moves (the calculator: its damage table goes right
   * below them).
   */
  statsLast?: boolean;
  /**
   * When given, the species picker also offers the Megas (the calculator): picking one equips
   * its stone and calls this with `mega` on; picking a species, with it off.
   */
  onSpeciesPick?: (set: PokemonSet, mega: boolean) => void;
  /** Move slots (the calculator has fewer than a team). */
  maxMoves?: number;
  /**
   * The calculator: no nickname (the suggested set takes its place), the ability is a row of
   * buttons under the species with gender (without «Al azar») and shiny beside it, the types
   * go under the sprite, and import / export live in the calculator's own header.
   */
  calculator?: boolean;
}) {
  const set = draft.members[index];
  const mode: GameMode = draft.mode;
  const [dialog, setDialog] = useState<'export' | 'import' | null>(null);
  const withMegas = Boolean(onSpeciesPick);
  const allSpecies = useMemo(
    () => (withMegas ? speciesWithMegaOptions(locale) : speciesOptions(locale)),
    [locale, withMegas],
  );
  const currentSpecies = draft.members[index]?.species;
  const speciesChoices: ComboOption[] = useMemo(
    () =>
      ownedSpecies ? ownedSpeciesOptions(allSpecies, ownedSpecies, currentSpecies) : allSpecies,
    [allSpecies, ownedSpecies, currentSpecies],
  );
  const natures = useMemo(() => natureOptions(locale), [locale]);
  const species = set ? getSpecies(set.species) : undefined;
  if (!set || !species) return null;

  const mega = megaEvolved === false ? null : megaOf(set);
  const shown = (mega && getSpecies(mega)) || species;
  const standardSets = getStandardSets(set.species, mode);
  const update = (change: Partial<PokemonSet>) => onChange({ ...set, ...change });
  const speciesLabel = getName('species', set.species, locale);
  const types = (
    <span className="flex gap-1">
      {shown.types.map((type) => (
        <TypeBadge key={type} type={type} locale={locale} />
      ))}
    </span>
  );
  const shiny = (
    <Checkbox
      checked={Boolean(set.shiny)}
      onChange={(shiny) => {
        const next: PokemonSet = { ...set, shiny };
        if (!shiny) delete next.shiny;
        onChange(next);
      }}
      label="Shiny"
    />
  );
  const itemDescription = set.item && !problems.item && (
    <p className="mt-1.5 line-clamp-2 text-xs text-faint">
      {getDescription('items', set.item, locale)}
    </p>
  );
  const actions = (
    <div className="flex shrink-0 gap-0.5">
      <IconButton label="Importar" onClick={() => setDialog('import')}>
        <IconUpload />
      </IconButton>
      <IconButton label="Exportar" onClick={() => setDialog('export')}>
        <IconDownload />
      </IconButton>
      {onRemove && (
        <IconButton label="Quitar" onClick={onRemove} className="hover:text-bad">
          <IconTrash />
        </IconButton>
      )}
    </div>
  );
  const suggested = standardSets.length > 0 && (
    <Select
      aria-label="Set sugerido"
      value=""
      onChange={(event) => {
        const standard = standardSets[Number(event.target.value)];
        if (standard) onChange(applyStandardSet(set, standard));
      }}
      className="max-w-64"
    >
      <option value="">Set sugerido…</option>
      {standardSets.map((standard, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static list of the species' sets.
        <option key={i} value={i}>
          {standardSetLabel(standard, locale)}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="@container flex flex-col gap-6 p-5">
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div
            className="flex size-36 items-center justify-center rounded-sm bg-surface-2"
            style={{
              background: `radial-gradient(circle at 50% 62%, color-mix(in oklab, ${typeColor(shown.types[0])} 34%, transparent), transparent 68%), var(--surface-2)`,
            }}
          >
            <PokemonSprite species={mega ?? set.species} shiny={Boolean(set.shiny)} size={128} />
          </div>
          {calculator && types}
        </div>

        <div className="flex min-w-60 flex-1 flex-col gap-3">
          <div className="grid gap-3 @lg:grid-cols-2">
            <div>
              <Combobox
                label="Especie"
                value={onSpeciesPick && mega ? mega : set.species}
                options={speciesChoices}
                onChange={(id) => {
                  if (!id) return;
                  if (!onSpeciesPick) return onChange(changeSpecies(set, id));
                  const isMega = getSpecies(id)?.kind === 'mega';
                  onSpeciesPick(isMega ? withMegaSpecies(set, id) : changeSpecies(set, id), isMega);
                }}
                invalid={Boolean(problems.species)}
              />
              {problems.species && <FieldProblems messages={problems.species} />}
            </div>
            {calculator ? (
              <div className="@lg:self-end">{suggested}</div>
            ) : (
              <Field label="Mote">
                <TextInput
                  value={set.nickname ?? ''}
                  maxLength={18}
                  placeholder={speciesLabel}
                  onChange={(event) => {
                    const nickname = event.target.value;
                    const next: PokemonSet = { ...set, nickname };
                    if (!nickname.trim()) delete next.nickname;
                    onChange(next);
                  }}
                />
              </Field>
            )}
          </div>
          {calculator ? (
            <AbilityButtons set={set} locale={locale} onChange={(ability) => update({ ability })}>
              <GenderField set={set} onChange={onChange} random={false} />
              {shiny}
            </AbilityButtons>
          ) : (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {types}
              <GenderField set={set} onChange={onChange} />
              {shiny}
            </div>
          )}
        </div>

        {!calculator && (
          <div className="flex flex-col items-end gap-2 @max-3xl:w-full @max-3xl:flex-row-reverse @max-3xl:items-center @max-3xl:justify-between">
            {actions}
            {suggested}
          </div>
        )}
      </div>

      <div className={`grid gap-3 ${calculator ? '@lg:grid-cols-2' : '@2xl:grid-cols-3'}`}>
        {!calculator && (
          <div>
            <Combobox
              label="Habilidad"
              value={set.ability}
              options={abilityOptions(set.species, locale)}
              onChange={(ability) => ability && update({ ability })}
              invalid={Boolean(problems.ability)}
            />
            {problems.ability && <FieldProblems messages={problems.ability} />}
          </div>
        )}
        <div>
          <Combobox
            label="Objeto"
            value={set.item ?? null}
            options={itemOptions(itemChoices(draft, index), draft.members, locale)}
            onChange={(item) => {
              const next: PokemonSet = { ...set };
              if (item) next.item = item;
              else delete next.item;
              onChange(next);
            }}
            clearLabel="Sin objeto"
            placeholder="Sin objeto"
            invalid={Boolean(problems.item)}
          />
          {!calculator && itemDescription}
          {problems.item && <FieldProblems messages={problems.item} />}
        </div>
        <div>
          <Combobox
            label="Naturaleza"
            value={set.nature}
            options={natures}
            onChange={(nature) => nature && update({ nature })}
            invalid={Boolean(problems.nature)}
          />
          {problems.nature && <FieldProblems messages={problems.nature} />}
        </div>
        {/* The calculator's nature never has a text: the item's takes the whole row. */}
        {calculator && <div className="-mt-1.5 @lg:col-span-2">{itemDescription}</div>}
      </div>

      <div
        className={`grid gap-x-10 gap-y-7 ${statsLast ? '' : '@4xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]'}`}
      >
        <div className={statsLast ? 'order-last' : ''}>
          <StatPointsEditor
            set={set}
            mode={mode}
            mega={mega}
            locale={locale}
            problems={problems.statPoints}
            onChange={(stat: StatId, value: number) =>
              onChange(setStatPointOf(set, stat, value, mode))
            }
          />
        </div>
        <MoveSlots
          set={set}
          locale={locale}
          problems={problems.moves}
          maxMoves={maxMoves}
          onChange={onChange}
          inlineStats={calculator}
        />
      </div>

      {dialog === 'export' && (
        <ExportDialog
          title={`Exportar ${speciesLabel}`}
          text={exportMember(set)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'import' && (
        <ImportDialog
          title={`Sustituir a ${speciesLabel}`}
          hint="Pokémon en formato de Showdown"
          onClose={() => setDialog(null)}
          onImport={(text) => {
            const { members, notes } = importText(text, mode);
            const [first] = members;
            if (!first) return notes.length > 0 ? notes : ['No se ha leído ningún Pokémon.'];
            onChange(first);
            setDialog(null);
            return undefined;
          }}
        />
      )}
    </div>
  );
}

/**
 * The species' abilities as buttons (the calculator), with the picked one's effect below and
 * `children` (gender and shiny) beside them.
 */
function AbilityButtons({
  set,
  locale,
  onChange,
  children,
}: {
  set: PokemonSet;
  locale: Locale;
  onChange: (ability: string) => void;
  children?: ReactNode;
}) {
  const options = abilityOptions(set.species, locale);
  const description = getDescription('abilities', set.ability, locale);
  // The effect stays right under the buttons: `children` go in their own column, so however
  // many abilities wrap, nothing else lands between the buttons and their text.
  return (
    <div className="flex min-w-0 items-start gap-5">
      <fieldset className="min-w-0 flex-1">
        <legend className="eyebrow mb-1.5 text-faint">Habilidad</legend>
        <div className="flex flex-wrap gap-1">
          {options.map((option) => {
            const selected = option.value === set.ability;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                title={getDescription('abilities', option.value, locale)}
                onClick={() => onChange(option.value)}
                className={`h-9 rounded-sm border px-3 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-accent-fg ${
                  selected
                    ? 'border-text bg-text text-bg'
                    : 'border-line text-muted hover:border-line-strong hover:bg-surface-3 hover:text-text'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {description && <p className="mt-1.5 line-clamp-2 text-xs text-faint">{description}</p>}
      </fieldset>
      {children && (
        <div className="flex shrink-0 flex-col gap-1.5">
          {/* Same height as the legend, so `children` line up with the buttons. */}
          <span aria-hidden="true" className="eyebrow invisible">
            ·
          </span>
          <div className="flex h-9 items-center gap-x-5">{children}</div>
        </div>
      )}
    </div>
  );
}

/**
 * The gender: fixed by the species, or chosen. `random` offers «Al azar» (the teambuilder);
 * the calculator has no such thing (Rivalry needs one), and an unset gender counts as male,
 * as in the damage calc.
 */
function GenderField({
  set,
  onChange,
  random = true,
}: {
  set: PokemonSet;
  onChange: (set: PokemonSet) => void;
  random?: boolean;
}) {
  const fixed = getSpecies(set.species)?.gender ?? null;
  if (fixed !== null) {
    return <Chip>{fixed === 'M' ? '♂ Macho' : fixed === 'F' ? '♀ Hembra' : 'Sin género'}</Chip>;
  }
  return (
    <Segmented
      label="Género"
      size="sm"
      value={set.gender ?? (random ? '-' : 'M')}
      onChange={(gender) => {
        const next: PokemonSet = { ...set };
        if (gender === '-') delete next.gender;
        else next.gender = gender;
        onChange(next);
      }}
      options={[
        ...(random ? [{ value: '-' as const, label: 'Al azar', title: 'Género al azar' }] : []),
        { value: 'M', label: '♂', title: 'Macho' },
        { value: 'F', label: '♀', title: 'Hembra' },
      ]}
    />
  );
}

function MoveSlots({
  set,
  locale,
  problems,
  maxMoves,
  onChange,
  inlineStats = false,
}: {
  set: PokemonSet;
  locale: Locale;
  problems?: string[];
  maxMoves: number;
  onChange: (set: PokemonSet) => void;
  /** Each move's type and figures inside its box, beside the name (the calculator). */
  inlineStats?: boolean;
}) {
  const options = useMemo(
    () => moveOptions(set.species, locale, set.moves),
    [set.species, locale, set.moves],
  );
  // One empty slot after the filled ones (slots stay compact).
  const slots = Math.min(maxMoves, set.moves.length + 1);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <h3 className="eyebrow text-muted">Movimientos</h3>
        <span className="eyebrow text-faint">
          {set.moves.length}/{maxMoves}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: slots }, (_, slot) => {
          const move = set.moves[slot] ?? null;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed move slots.
            <div key={slot} className="flex items-start gap-3">
              <span className="display mt-2 w-4 text-xl text-faint" aria-hidden="true">
                {slot + 1}
              </span>
              <div className="min-w-0 flex-1">
                <Combobox
                  label={`Movimiento ${slot + 1}`}
                  hideLabel
                  value={move}
                  // The move of this slot stays selectable (it is "taken" by itself).
                  options={options.map((option) =>
                    option.value === move ? { ...option, disabled: false } : option,
                  )}
                  onChange={(next) => onChange(setMoveAt(set, slot, next))}
                  clearLabel={move ? 'Quitar movimiento' : undefined}
                  placeholder="Añadir movimiento…"
                  emptyText="No lo aprende en Champions."
                  trailing={
                    inlineStats && move ? (
                      <MoveStats
                        move={move}
                        locale={locale}
                        className="hidden flex-nowrap @md:flex"
                        strong
                      />
                    ) : undefined
                  }
                />
                {move && <MoveSummary move={move} locale={locale} inline={inlineStats} />}
              </div>
            </div>
          );
        })}
      </div>
      {problems && <FieldProblems messages={problems} />}
    </div>
  );
}

/**
 * Effect of a chosen move, and its type and figures (`MoveStats`) unless they are shown inside
 * its box (`inline`: the calculator, wide enough).
 */
function MoveSummary({
  move,
  locale,
  inline = false,
}: {
  move: MoveId;
  locale: Locale;
  inline?: boolean;
}) {
  const description = getDescription('moves', move, locale);
  return (
    <div className="mt-1.5 flex flex-col gap-1 px-1">
      <MoveStats
        move={move}
        locale={locale}
        className={inline ? '@md:hidden' : ''}
        strong={inline}
      />
      {description && (
        <p className="line-clamp-2 text-xs text-faint" title={description}>
          {description}
        </p>
      )}
    </div>
  );
}

/** Type, category, power, accuracy and PP of a move (`strong`: the figures in bold). */
function MoveStats({
  move,
  locale,
  className = '',
  strong = false,
}: {
  move: MoveId;
  locale: Locale;
  className?: string;
  strong?: boolean;
}) {
  const data = getMove(move);
  if (!data) return null;
  const accuracy = typeof data.accuracy === 'number' ? `${data.accuracy} %` : '—';
  const figure = strong ? 'font-semibold text-text' : '';
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs whitespace-nowrap ${className}`}
    >
      <TypeBadge type={data.type} locale={locale} />
      <span className="text-muted">{CATEGORY_LABEL[data.category]}</span>
      <span className="text-muted tabular-nums">
        {data.basePower > 0 && (
          <>
            <span className="text-faint">Pot.</span>{' '}
            <span className={figure}>{data.basePower}</span>
            <span className="text-faint"> · </span>
          </>
        )}
        <span className="text-faint">Prec.</span> <span className={figure}>{accuracy}</span>
        <span className="text-faint"> · PP</span> <span className={figure}>{data.pp}</span>
      </span>
    </div>
  );
}
