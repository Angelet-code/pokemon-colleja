/**
 * Damage calculator (`/calculadora`): attacker and defender edited with the teambuilder's
 * sheet, their battle state (Mega, HP, status, stat changes) and the field. The damage of
 * every attacker move is computed by the server with the same code the bot uses.
 */
import type { PokemonSet } from '@colleja/core';
import type { Locale } from '@colleja/data';
import { abilityName, boostShort, moveName, statusName, weatherName } from '@colleja/narration';
import { CALC_SCREENS, CALC_STATUSES, CALC_TERRAINS, CALC_WEATHERS } from '@colleja/protocol';
import { useEffect, useMemo, useState } from 'react';
import { IconHistory, IconSwap, IconUpload } from '../../components/icons';
import {
  Button,
  Checkbox,
  Field,
  PageHeader,
  Panel,
  Segmented,
  Select,
  TextInput,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useSettings } from '../../stores/settings';
import { SetEditor } from '../teams/components/SetEditor';
import { newDraft, replaceMembers } from '../teams/team-draft';
import { CalcHistoryDialog } from './CalcHistoryDialog';
import { ResultsTable } from './CalcResults';
import { type MoveResult, useCalcHistory } from './calc-history';
import {
  type CalcBoostStat,
  type CalcSide,
  type CalcStatus,
  calcRequest,
  canMegaEvolve,
  fromSet,
  useCalc,
  withMega,
  withSet,
} from './calc-store';
import { LoadSetDialog } from './LoadSetDialog';

const BOOST_STATS: CalcBoostStat[] = ['atk', 'def', 'spa', 'spd', 'spe'];
const BOOST_VALUES = [6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6];
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

export function CalculatorPage() {
  const calc = useCalc();
  const locale = useSettings((state) => state.namesLocale);
  const [loading, setLoading] = useState<'attacker' | 'defender' | null>(null);
  const results = useMoveResults(calc.attacker, calc.defender, calc.field);
  const historyCount = useCalcHistory((state) => state.entries.length);
  const [historyOpen, setHistoryOpen] = useState(false);

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
        <ResultsTable results={results} defender={calc.defender} locale={locale} />
      </Panel>

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
              <Button size="sm" variant="ghost" onClick={() => setLoading(side)}>
                <IconUpload size={14} />
                Cargar de mis equipos
              </Button>
            </header>
            <SideEditor side={side} locale={locale} />
          </section>
        ))}
      </div>

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
      <Field label="Clima" className="w-40">
        <Select
          value={field.weather ?? ''}
          onChange={(event) =>
            updateField({ weather: (event.target.value || null) as typeof field.weather })
          }
        >
          <option value="">Ninguno</option>
          {CALC_WEATHERS.map((weather) => (
            <option key={weather} value={weather}>
              {weatherName(weather, locale)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Campo" className="w-44">
        <Select
          value={field.terrain ?? ''}
          onChange={(event) =>
            updateField({ terrain: (event.target.value || null) as typeof field.terrain })
          }
        >
          <option value="">Ninguno</option>
          {CALC_TERRAINS.map((terrain) => (
            <option key={terrain} value={terrain}>
              {TERRAIN_LABEL[terrain]}
            </option>
          ))}
        </Select>
      </Field>
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
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-line bg-surface-2/50 px-5 py-3.5">
        <div className="pb-2" title={canMega ? undefined : 'No tiene Mega Evolución'}>
          <Checkbox
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
        <Field label="Estado" className="w-36">
          <Select
            value={state.status ?? ''}
            aria-label={`Estado del ${label}`}
            onChange={(event) =>
              updateSide(side, { status: (event.target.value || null) as CalcStatus | null })
            }
          >
            <option value="">Sano</option>
            {CALC_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusName(status, locale)}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="eyebrow mb-1.5 text-faint">Cambios</legend>
          {BOOST_STATS.map((stat) => {
            const value = state.boosts[stat] ?? 0;
            return (
              <label
                key={stat}
                className={`flex h-9 items-center gap-1.5 rounded-sm border pl-2 ${
                  value > 0 ? 'border-good/50' : value < 0 ? 'border-bad/50' : 'border-line'
                }`}
              >
                <span className="eyebrow text-faint">{boostShort(stat, locale)}</span>
                <select
                  value={value}
                  aria-label={`${boostShort(stat, locale)} del ${label}`}
                  onChange={(event) =>
                    updateSide(side, {
                      boosts: { ...state.boosts, [stat]: Number(event.target.value) },
                    })
                  }
                  className={`h-full cursor-pointer appearance-none bg-transparent pr-2 font-display text-sm font-semibold tabular-nums focus:outline-none ${
                    value > 0 ? 'text-good' : value < 0 ? 'text-bad' : ''
                  }`}
                >
                  {BOOST_VALUES.map((option) => (
                    <option key={option} value={option}>
                      {option > 0 ? `+${option}` : option}
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
      />
    </div>
  );
}
