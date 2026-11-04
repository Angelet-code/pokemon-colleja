/**
 * Damage calculator (`/calculadora`): attacker and defender edited with the teambuilder's
 * sheet, their battle state (Mega, HP, status, stat changes) and the field. The damage of
 * every attacker move is computed by the server with the same code the bot uses, and shown
 * right under the sheets' Stat Points (what changes most while calculating).
 */
import type { PokemonSet } from '@colleja/core';
import { getName, type Locale } from '@colleja/data';
import {
  abilityName,
  boostName,
  boostShort,
  moveName,
  statusName,
  weatherName,
} from '@colleja/narration';
import { CALC_SCREENS, CALC_STATUSES, CALC_TERRAINS, CALC_WEATHERS } from '@colleja/protocol';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Combobox } from '../../components/Combobox';
import {
  IconBurn,
  IconDownload,
  IconElectricTerrain,
  IconFrozen,
  IconGrassyTerrain,
  IconHealthy,
  IconHistory,
  IconMistyTerrain,
  IconParalysis,
  IconPoison,
  IconPsychicTerrain,
  IconRain,
  IconSandstorm,
  IconSave,
  IconSleep,
  IconSnow,
  IconSun,
  IconSwap,
  IconToxic,
  IconUpload,
} from '../../components/icons';
import {
  Button,
  Checkbox,
  Field,
  IconChoice,
  PageHeader,
  Panel,
  Segmented,
  TextInput,
  ToneIcon,
} from '../../components/ui';
import { api } from '../../lib/api';
import { TYPE_COLORS } from '../../lib/type-colors';
import { useSettings } from '../../stores/settings';
import { SetEditor } from '../teams/components/SetEditor';
import { ExportDialog, ImportDialog } from '../teams/components/TextDialogs';
import { exportMember, importText, newDraft, replaceMembers } from '../teams/team-draft';
import { CalcHistoryDialog } from './CalcHistoryDialog';
import { ResultsTable } from './CalcResults';
import { type MoveResult, useCalcHistory } from './calc-history';
import {
  CALC_MOVES,
  type CalcBoostStat,
  type CalcSide,
  type CalcStatus,
  type CalcTerrain,
  type CalcWeather,
  calcRequest,
  canMegaEvolve,
  fromSet,
  useCalc,
  withHits,
  withMega,
  withSet,
} from './calc-store';
import { LoadSetDialog } from './LoadSetDialog';

const BOOST_STATS: CalcBoostStat[] = ['atk', 'def', 'spa', 'spd', 'spe'];
const BOOST_VALUES = [6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6];
/** `2` → `+2`, `0` → `0`, `-1` → `-1`. */
function formatStage(stage: number): string {
  return stage > 0 ? `+${stage}` : String(stage);
}
const SCREEN_LABEL: Record<(typeof CALC_SCREENS)[number], string> = {
  reflect: 'Reflejo',
  lightscreen: 'Pantalla de Luz',
  auroraveil: 'Velo Aurora',
};
const TERRAIN_LABEL: Record<(typeof CALC_TERRAINS)[number], string> = {
  electricterrain: 'Campo Eléctrico',
  grassyterrain: 'Campo de Hierba',
  psychicterrain: 'Campo Psíquico',
  mistyterrain: 'Campo de Niebla',
};
/** Terrain names on the buttons, under the «Campo» legend. */
const TERRAIN_SHORT: Record<(typeof CALC_TERRAINS)[number], string> = {
  electricterrain: 'Eléctrico',
  grassyterrain: 'Hierba',
  psychicterrain: 'Psíquico',
  mistyterrain: 'Niebla',
};
/** Icon and colour (the type it powers up) of each weather and terrain button. */
interface FieldLook {
  icon: ReactNode;
  color: string;
}
/** Icon and colour (the type it brings to mind) of each status condition. */
const STATUS_LOOK: Record<CalcStatus, FieldLook> = {
  brn: { icon: <IconBurn size={15} />, color: TYPE_COLORS.Fire },
  par: { icon: <IconParalysis size={15} />, color: TYPE_COLORS.Electric },
  psn: { icon: <IconPoison size={15} />, color: TYPE_COLORS.Poison },
  tox: { icon: <IconToxic size={15} />, color: TYPE_COLORS.Poison },
  slp: { icon: <IconSleep size={15} />, color: TYPE_COLORS.Normal },
  frz: { icon: <IconFrozen size={15} />, color: TYPE_COLORS.Ice },
};
const WEATHER_LOOK: Record<CalcWeather, FieldLook> = {
  sunnyday: { icon: <IconSun size={18} />, color: TYPE_COLORS.Fire },
  raindance: { icon: <IconRain size={18} />, color: TYPE_COLORS.Water },
  sandstorm: { icon: <IconSandstorm size={18} />, color: TYPE_COLORS.Rock },
  snowscape: { icon: <IconSnow size={18} />, color: TYPE_COLORS.Ice },
};
const TERRAIN_LOOK: Record<CalcTerrain, FieldLook> = {
  electricterrain: { icon: <IconElectricTerrain size={18} />, color: TYPE_COLORS.Electric },
  grassyterrain: { icon: <IconGrassyTerrain size={18} />, color: TYPE_COLORS.Grass },
  psychicterrain: { icon: <IconPsychicTerrain size={18} />, color: TYPE_COLORS.Psychic },
  mistyterrain: { icon: <IconMistyTerrain size={18} />, color: TYPE_COLORS.Fairy },
};

export function CalculatorPage() {
  const calc = useCalc();
  const locale = useSettings((state) => state.namesLocale);
  const [loading, setLoading] = useState<'attacker' | 'defender' | null>(null);
  const results = useMoveResults(calc.attacker, calc.defender, calc.field);
  const historyCount = useCalcHistory((state) => state.entries.length);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [textDialog, setTextDialog] = useState<{
    side: 'attacker' | 'defender';
    kind: 'import' | 'export';
  } | null>(null);
  const textSet = textDialog ? calc[textDialog.side].set : null;
  const textName = textSet ? getName('species', textSet.species, locale) : '';

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <PageHeader title="Calculadora">
        <Button onClick={() => setHistoryOpen(true)}>
          <IconHistory size={14} />
          Historial
          {historyCount > 0 && <span className="text-faint tabular-nums">{historyCount}</span>}
        </Button>
        <Button onClick={calc.swap}>
          <IconSwap size={14} />
          Intercambiar
        </Button>
      </PageHeader>

      <FieldControls />

      <div className="grid items-start gap-4 xl:grid-cols-2">
        {(['attacker', 'defender'] as const).map((side) => (
          <section
            key={side}
            className="min-w-0 rounded-md border border-line bg-surface shadow-panel"
          >
            <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2">
              <h2
                className={`eyebrow flex items-center gap-2 ${side === 'attacker' ? 'text-accent-fg' : 'text-rival'}`}
              >
                <span
                  className={`size-2 ${side === 'attacker' ? 'bg-accent' : 'bg-rival'}`}
                  aria-hidden="true"
                />
                {side === 'attacker' ? 'Atacante' : 'Defensor'}
              </h2>
              <div className="flex flex-wrap justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTextDialog({ side, kind: 'import' })}
                >
                  <IconUpload size={14} />
                  Importar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTextDialog({ side, kind: 'export' })}
                >
                  <IconDownload size={14} />
                  Exportar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setLoading(side)}>
                  <IconSave size={14} />
                  Cargar de mis equipos
                </Button>
              </div>
            </header>
            <SideEditor side={side} locale={locale} />
          </section>
        ))}
      </div>

      <Panel
        title="Daño"
        actions={
          <Checkbox
            label="Crítico"
            checked={calc.field.crit}
            onChange={(crit) => calc.updateField({ crit })}
          />
        }
      >
        <ResultsTable
          results={results}
          attacker={calc.attacker}
          defender={calc.defender}
          locale={locale}
          onHits={(move, hits) => calc.updateSide('attacker', withHits(calc.attacker, move, hits))}
        />
      </Panel>

      {textDialog?.kind === 'export' && textSet && (
        <ExportDialog
          title={`Exportar ${textName}`}
          text={exportMember(textSet)}
          onClose={() => setTextDialog(null)}
        />
      )}
      {textDialog?.kind === 'import' && (
        <ImportDialog
          title={`Sustituir a ${textName}`}
          hint="Pokémon en formato de Showdown"
          onClose={() => setTextDialog(null)}
          onImport={(text) => {
            const { members, notes } = importText(text, calc.field.mode);
            const [first] = members;
            if (!first) return notes.length > 0 ? notes : ['No se ha leído ningún Pokémon.'];
            calc.updateSide(textDialog.side, fromSet(first));
            setTextDialog(null);
            return undefined;
          }}
        />
      )}

      {historyOpen && (
        <CalcHistoryDialog
          onClose={() => setHistoryOpen(false)}
          onOpen={(setup) => {
            calc.load(structuredClone(setup));
            setHistoryOpen(false);
          }}
        />
      )}

      {loading && (
        <LoadSetDialog
          title={loading === 'attacker' ? 'Cargar atacante' : 'Cargar defensor'}
          onClose={() => setLoading(null)}
          onPick={(set: PokemonSet) => {
            calc.updateSide(loading, fromSet(set));
            setLoading(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Recomputes the damage of every attacker move when anything changes (debounced), and records
 * each computed comparison in the history.
 */
function useMoveResults(
  attacker: CalcSide,
  defender: CalcSide,
  field: ReturnType<typeof useCalc.getState>['field'],
) {
  const [results, setResults] = useState<MoveResult[]>([]);
  useEffect(() => {
    let cancelled = false;
    const moves = attacker.set.moves.filter(Boolean);
    const timer = setTimeout(() => {
      void Promise.all(
        moves.map(async (move): Promise<MoveResult> => {
          try {
            return { move, result: await api.calc(calcRequest(attacker, defender, field, move)) };
          } catch (cause) {
            return {
              move,
              result: null,
              error: cause instanceof Error ? cause.message : String(cause),
            };
          }
        }),
      ).then((next) => {
        if (cancelled) return;
        setResults(next);
        useCalcHistory.getState().record({ attacker, defender, field }, next);
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [attacker, defender, field]);
  return results;
}

/** Field effects with a switch: the room moves, and in doubles the allies' support. */
type EffectKey = 'gravity' | 'magicRoom' | 'wonderRoom' | 'helpingHand' | 'friendGuard';

function effectLabel(effect: EffectKey, locale: Locale): string {
  switch (effect) {
    case 'gravity':
      return moveName('gravity', locale);
    case 'magicRoom':
      return moveName('magicroom', locale);
    case 'wonderRoom':
      return moveName('wonderroom', locale);
    case 'helpingHand':
      return moveName('helpinghand', locale);
    case 'friendGuard':
      return abilityName('friendguard', locale);
  }
}

const EFFECT_TITLE: Partial<Record<EffectKey, string>> = {
  helpingHand: 'El aliado del atacante usó este movimiento',
  friendGuard: 'El aliado del defensor tiene esta habilidad',
};

function FieldControls() {
  const { field, updateField } = useCalc();
  const locale = useSettings((state) => state.namesLocale);
  const effects: EffectKey[] = [
    'gravity',
    'magicRoom',
    'wonderRoom',
    ...(field.mode === 'doubles' ? (['helpingHand', 'friendGuard'] as const) : []),
  ];
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-md border border-line bg-surface px-4 py-3.5">
      <Segmented
        label="Modo"
        value={field.mode}
        onChange={(mode) => updateField({ mode })}
        options={[
          { value: 'singles', label: 'Individuales' },
          { value: 'doubles', label: 'Dobles', title: 'Los movimientos múltiples hacen el 75 %' },
        ]}
      />
      <IconChoice
        label="Clima"
        value={field.weather}
        onChange={(weather) => updateField({ weather })}
        options={CALC_WEATHERS.map((weather) => ({
          value: weather,
          label: weatherName(weather, locale),
          ...WEATHER_LOOK[weather],
        }))}
      />
      <IconChoice
        label="Campo"
        value={field.terrain}
        onChange={(terrain) => updateField({ terrain })}
        options={CALC_TERRAINS.map((terrain) => ({
          value: terrain,
          label: TERRAIN_SHORT[terrain],
          title: TERRAIN_LABEL[terrain],
          ...TERRAIN_LOOK[terrain],
        }))}
      />
      <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-2">
        <legend className="eyebrow mb-2.5 text-faint">Pantallas del defensor</legend>
        {CALC_SCREENS.map((screen) => (
          <Checkbox
            key={screen}
            label={SCREEN_LABEL[screen]}
            checked={field.screens.includes(screen)}
            onChange={(checked) =>
              updateField({
                screens: checked
                  ? [...field.screens, screen]
                  : field.screens.filter((other) => other !== screen),
              })
            }
          />
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-2">
        <legend className="eyebrow mb-2.5 text-faint">Efectos</legend>
        {effects.map((effect) => (
          <span key={effect} title={EFFECT_TITLE[effect]}>
            <Checkbox
              label={effectLabel(effect, locale)}
              checked={field[effect]}
              onChange={(checked) => updateField({ [effect]: checked })}
            />
          </span>
        ))}
      </fieldset>
    </div>
  );
}

function SideEditor({ side, locale }: { side: 'attacker' | 'defender'; locale: Locale }) {
  const state = useCalc((store) => store[side]);
  const mode = useCalc((store) => store.field.mode);
  const updateSide = useCalc((store) => store.updateSide);
  const draft = useMemo(() => replaceMembers(newDraft(mode), [state.set]), [mode, state.set]);
  const label = side === 'attacker' ? 'atacante' : 'defensor';
  const canMega = canMegaEvolve(state.set);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-line bg-surface-2/50 px-5 py-3.5">
        <div title={canMega ? undefined : 'No tiene Mega Evolución'}>
          <Checkbox
            stacked
            label="Mega"
            checked={state.mega && canMega}
            onChange={(mega) => canMega && updateSide(side, withMega(state, mega))}
            className={canMega ? '' : 'pointer-events-none opacity-40'}
          />
        </div>
        <Field label="PS %" className="w-20">
          <TextInput
            type="number"
            min={1}
            max={100}
            value={state.hpPercent}
            aria-label={`PS del ${label} (%)`}
            onChange={(event) =>
              updateSide(side, {
                hpPercent: Math.min(100, Math.max(1, Number(event.target.value) || 1)),
              })
            }
            className="font-display text-base font-semibold tabular-nums"
          />
        </Field>
        <div className="w-44">
          <Combobox
            label="Estado"
            value={state.status}
            onChange={(status) => updateSide(side, { status: status as CalcStatus | null })}
            clearLabel="Sano"
            clearIcon={<IconHealthy size={15} className="text-good" />}
            options={CALC_STATUSES.map((status) => {
              const look = STATUS_LOOK[status];
              return {
                value: status,
                label: statusName(status, locale),
                icon: <ToneIcon color={look.color}>{look.icon}</ToneIcon>,
              };
            })}
          />
        </div>
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="eyebrow mb-1.5 text-faint">Cambios</legend>
          {BOOST_STATS.map((stat) => {
            const value = state.boosts[stat] ?? 0;
            const name = boostName(stat, locale);
            // The closed control shows the short name and the stage; the invisible select over
            // it opens a list that names the stat («Ataque +2»), wide enough to read.
            return (
              <label
                key={stat}
                className={`relative flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border px-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-fg ${
                  value > 0 ? 'border-good/50' : value < 0 ? 'border-bad/50' : 'border-line'
                }`}
              >
                <span className="eyebrow text-faint">{boostShort(stat, locale)}</span>
                <span
                  aria-hidden="true"
                  className={`font-display text-sm font-semibold tabular-nums ${
                    value > 0 ? 'text-good' : value < 0 ? 'text-bad' : ''
                  }`}
                >
                  {formatStage(value)}
                </span>
                <select
                  value={value}
                  aria-label={`${name} del ${label}`}
                  onChange={(event) =>
                    updateSide(side, {
                      boosts: { ...state.boosts, [stat]: Number(event.target.value) },
                    })
                  }
                  // Sized to the box: with its own width (the longest option) it would push the
                  // row onto two lines although nothing shows.
                  // The list takes its colours from the select and its options: without them it
                  // opens white with the dark theme's pale text.
                  className="absolute inset-0 size-full cursor-pointer appearance-none bg-surface text-text opacity-0"
                >
                  {BOOST_VALUES.map((option) => (
                    <option key={option} value={option} className="bg-surface px-3 py-1 text-text">
                      {name} {formatStage(option)}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </fieldset>
      </div>
      <SetEditor
        draft={draft}
        index={0}
        locale={locale}
        problems={{}}
        megaEvolved={state.mega}
        onChange={(set) => updateSide(side, withSet(state, set))}
        onSpeciesPick={(set, mega) => updateSide(side, { ...withSet(state, set), mega })}
        maxMoves={CALC_MOVES}
        statsLast
        calculator
      />
    </div>
  );
}
