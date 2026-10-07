/**
 * The sheet of one member: species, nickname, gender, shiny, ability, item, nature, Stat
 * Points and moves, with each problem next to the field that causes it.
 */
import { MAX_MOVES, type PokemonSet, type SetField } from '@colleja/core';
import {
  type GameMode,
  getDescription,
  getName,
  getSpecies,
  getStandardSets,
  type Locale,
  type StatId,
} from '@colleja/data';
import { useMemo, useState } from 'react';
import { Combobox } from '../../../components/Combobox';
import { PokemonSprite } from '../../../components/PokemonIcon';
import { TypeBadge } from '../../../components/TypeBadge';
import { Button, Checkbox, Segmented } from '../../../components/ui';
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
  onRemove: () => void;
}) {
  const set = draft.members[index];
  const mode: GameMode = draft.mode;
  const [dialog, setDialog] = useState<'export' | 'import' | null>(null);
  const allSpecies = useMemo(() => speciesOptions(locale), [locale]);
  const natures = useMemo(() => natureOptions(locale), [locale]);
  const species = set ? getSpecies(set.species) : undefined;
  if (!set || !species) return null;

  const mega = megaOf(set);
  const standardSets = getStandardSets(set.species, mode);
  const update = (change: Partial<PokemonSet>) => onChange({ ...set, ...change });
  const speciesLabel = getName('species', set.species, locale);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <PokemonSprite species={mega ?? set.species} size={112} className="shrink-0" />
        <div className="flex min-w-56 flex-1 flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Combobox
                label="Especie"
                value={set.species}
                options={allSpecies}
                onChange={(id) => id && onChange(changeSpecies(set, id))}
                invalid={Boolean(problems.species)}
              />
              <div className="mt-1 flex gap-1">
                {species.types.map((type) => (
                  <TypeBadge key={type} type={type} locale={locale} />
                ))}
              </div>
              {problems.species && <FieldProblems messages={problems.species} />}
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Mote</span>
              <input
                value={set.nickname ?? ''}
                maxLength={18}
                placeholder={speciesLabel}
                onChange={(event) => {
                  const nickname = event.target.value;
                  const next: PokemonSet = { ...set, nickname };
                  if (!nickname.trim()) delete next.nickname;
                  onChange(next);
                }}
                className="rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4">
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
        <div className="flex flex-col items-end gap-2">
          {standardSets.length > 0 && (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Set sugerido
              <select
                value=""
                onChange={(event) => {
                  const standard = standardSets[Number(event.target.value)];
                  if (standard) onChange(applyStandardSet(set, standard));
                }}
                className="max-w-64 rounded-lg border border-border bg-panel-2 px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
              >
                <option value="">Cargar set sugerido…</option>
                {standardSets.map((standard, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static list of the species' sets.
                  <option key={i} value={i}>
                    {standardSetLabel(standard, locale)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDialog('import')}>
              Importar
            </Button>
            <Button variant="ghost" onClick={() => setDialog('export')}>
              Exportar
            </Button>
            <Button variant="danger" onClick={onRemove}>
              Quitar
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
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
            <p className="mt-1 line-clamp-2 text-xs text-faint">
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

      <StatPointsEditor
        set={set}
        mode={mode}
        mega={mega}
        locale={locale}
        problems={problems.statPoints}
        onChange={(stat: StatId, value: number) => onChange(setStatPointOf(set, stat, value, mode))}
      />

      <MoveSlots set={set} locale={locale} problems={problems.moves} onChange={onChange} />

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
          hint="Pega un Pokémon en formato de Showdown. Sustituye al actual."
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
    const label = fixed === 'M' ? 'Macho' : fixed === 'F' ? 'Hembra' : 'Sin género';
    return <span className="text-sm text-muted">Género: {label}</span>;
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
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">
        Movimientos <span className="font-normal text-muted">({set.moves.length}/4)</span>
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: slots }, (_, slot) => {
          const move = set.moves[slot] ?? null;
          return (
            <Combobox
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed move slots.
              key={slot}
              label={`Movimiento ${slot + 1}`}
              value={move}
              // The move of this slot stays selectable (it is "taken" by itself).
              options={options.map((option) =>
                option.value === move ? { ...option, disabled: false } : option,
              )}
              onChange={(next) => onChange(setMoveAt(set, slot, next))}
              clearLabel={move ? 'Quitar movimiento' : undefined}
              placeholder="Elige un movimiento…"
              emptyText="No aprende ningún movimiento así en Champions."
            />
          );
        })}
      </div>
      {problems && <FieldProblems messages={problems} />}
    </div>
  );
}
