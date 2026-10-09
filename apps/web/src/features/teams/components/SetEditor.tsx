/**
 * The sheet of one member: species, nickname, gender, shiny, ability, item, nature, Stat
 * Points and moves, with each problem next to the field that causes it.
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
import { useMemo, useState } from 'react';
import { Combobox } from '../../../components/Combobox';
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
  speciesOptions,
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
}: {
  draft: TeamDraft;
  index: number;
  locale: Locale;
  problems: FieldProblemMap;
  onChange: (set: PokemonSet) => void;
  /** Without it there is no "Quitar" button (e.g. in the calculator). */
  onRemove?: () => void;
}) {
  const set = draft.members[index];
  const mode: GameMode = draft.mode;
  const [dialog, setDialog] = useState<'export' | 'import' | null>(null);
  const allSpecies = useMemo(() => speciesOptions(locale), [locale]);
  const natures = useMemo(() => natureOptions(locale), [locale]);
  const species = set ? getSpecies(set.species) : undefined;
  if (!set || !species) return null;

  const mega = megaOf(set);
  const shown = (mega && getSpecies(mega)) || species;
  const standardSets = getStandardSets(set.species, mode);
  const update = (change: Partial<PokemonSet>) => onChange({ ...set, ...change });
  const speciesLabel = getName('species', set.species, locale);

  return (
    <div className="@container flex flex-col gap-6 p-5">
      <div className="flex flex-wrap items-start gap-5">
        <div
          className="flex size-36 shrink-0 items-center justify-center rounded-sm bg-surface-2"
          style={{
            background: `radial-gradient(circle at 50% 62%, color-mix(in oklab, ${typeColor(shown.types[0])} 34%, transparent), transparent 68%), var(--surface-2)`,
          }}
        >
          <PokemonSprite species={mega ?? set.species} size={128} />
        </div>

        <div className="flex min-w-60 flex-1 flex-col gap-3">
          <div className="grid gap-3 @lg:grid-cols-2">
            <div>
              <Combobox
                label="Especie"
                value={set.species}
                options={allSpecies}
                onChange={(id) => id && onChange(changeSpecies(set, id))}
                invalid={Boolean(problems.species)}
              />
              {problems.species && <FieldProblems messages={problems.species} />}
            </div>
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
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex gap-1">
              {shown.types.map((type) => (
                <TypeBadge key={type} type={type} locale={locale} />
              ))}
            </span>
            <GenderField set={set} onChange={onChange} />
            <Checkbox
              checked={Boolean(set.shiny)}
              onChange={(shiny) => {
                const next: PokemonSet = { ...set, shiny };
                if (!shiny) delete next.shiny;
                onChange(next);
              }}
              label="Shiny"
            />
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 @max-3xl:w-full @max-3xl:flex-row-reverse @max-3xl:items-center @max-3xl:justify-between">
          <div className="flex gap-0.5">
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
          {standardSets.length > 0 && (
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
          )}
        </div>
      </div>

      <div className="grid gap-3 @2xl:grid-cols-3">
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
          {set.item && !problems.item && (
            <p className="mt-1.5 line-clamp-2 text-xs text-faint">
              {getDescription('items', set.item, locale)}
            </p>
          )}
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
      </div>

      <div className="grid gap-x-10 gap-y-7 @4xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
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
        <MoveSlots set={set} locale={locale} problems={problems.moves} onChange={onChange} />
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

function GenderField({ set, onChange }: { set: PokemonSet; onChange: (set: PokemonSet) => void }) {
  const fixed = getSpecies(set.species)?.gender ?? null;
  if (fixed !== null) {
    return <Chip>{fixed === 'M' ? '♂ Macho' : fixed === 'F' ? '♀ Hembra' : 'Sin género'}</Chip>;
  }
  return (
    <Segmented
      label="Género"
      size="sm"
      value={set.gender ?? '-'}
      onChange={(gender) => {
        const next: PokemonSet = { ...set };
        if (gender === '-') delete next.gender;
        else next.gender = gender;
        onChange(next);
      }}
      options={[
        { value: '-', label: 'Al azar', title: 'Género al azar' },
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
  onChange,
}: {
  set: PokemonSet;
  locale: Locale;
  problems?: string[];
  onChange: (set: PokemonSet) => void;
}) {
  const options = useMemo(
    () => moveOptions(set.species, locale, set.moves),
    [set.species, locale, set.moves],
  );
  // One empty slot after the filled ones (slots stay compact).
  const slots = Math.min(MAX_MOVES, set.moves.length + 1);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <h3 className="eyebrow text-muted">Movimientos</h3>
        <span className="eyebrow text-faint">
          {set.moves.length}/{MAX_MOVES}
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
                />
                {move && <MoveSummary move={move} locale={locale} />}
              </div>
            </div>
          );
        })}
      </div>
      {problems && <FieldProblems messages={problems} />}
    </div>
  );
}

/** Type, category, power, accuracy, PP and effect of a chosen move. */
function MoveSummary({ move, locale }: { move: MoveId; locale: Locale }) {
  const data = getMove(move);
  if (!data) return null;
  const description = getDescription('moves', move, locale);
  const accuracy = typeof data.accuracy === 'number' ? `${data.accuracy} %` : '—';
  return (
    <div className="mt-1.5 flex flex-col gap-1 px-1">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
        <TypeBadge type={data.type} locale={locale} />
        <span className="text-muted">{CATEGORY_LABEL[data.category]}</span>
        <span className="text-muted tabular-nums">
          {data.basePower > 0 && (
            <>
              <span className="text-faint">Pot.</span> {data.basePower}
              <span className="text-faint"> · </span>
            </>
          )}
          <span className="text-faint">Prec.</span> {accuracy}
          <span className="text-faint"> · PP</span> {data.pp}
        </span>
      </div>
      {description && (
        <p className="line-clamp-2 text-xs text-faint" title={description}>
          {description}
        </p>
      )}
    </div>
  );
}
