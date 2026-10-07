/**
 * Damage calculator (`/calculadora`): attacker and defender edited with the teambuilder's
 * sheet, their battle state (Mega, HP, status, stat changes) and the field. The damage of
 * every attacker move is computed by the server with the same code the bot uses.
 */
import type { PokemonSet } from '@colleja/core';
import { getMove, type Locale } from '@colleja/data';
import { boostShort, moveName, statusName, weatherName } from '@colleja/narration';
import type { CalcResponse } from '@colleja/protocol';
import { CALC_SCREENS, CALC_STATUSES, CALC_TERRAINS, CALC_WEATHERS } from '@colleja/protocol';
import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Panel, Segmented } from '../../components/ui';
import { api } from '../../lib/api';
import { useSettings } from '../../stores/settings';
import { SetEditor } from '../teams/components/SetEditor';
import { megaOf, newDraft, replaceMembers } from '../teams/team-draft';
import {
  type CalcBoostStat,
  type CalcSide,
  type CalcStatus,
  calcRequest,
  fromSet,
  useCalc,
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

interface MoveResult {
  move: string;
  result: CalcResponse | null;
  error?: string;
}

export function CalculatorPage() {
  const calc = useCalc();
  const locale = useSettings((state) => state.namesLocale);
  const [loading, setLoading] = useState<'attacker' | 'defender' | null>(null);
  const results = useMoveResults(calc.attacker, calc.defender, calc.field);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calculadora de daño</h1>
          <p className="text-sm text-muted">
            Reglas de Champions (nivel 50, Stat Points, Megas). Calcula con el mismo código que usa
            el bot.
          </p>
        </div>
        <Button onClick={calc.swap}>⇄ Intercambiar</Button>
      </div>

      <Panel title={`Daño de los movimientos del atacante`}>
        <ResultsTable results={results} defender={calc.defender} locale={locale} />
      </Panel>

      <FieldControls />

      <div className="grid items-start gap-4 xl:grid-cols-2">
        {(['attacker', 'defender'] as const).map((side) => (
          <Panel
            key={side}
            title={side === 'attacker' ? 'Atacante' : 'Defensor'}
            actions={
              <Button variant="ghost" onClick={() => setLoading(side)}>
                Cargar de mis equipos
              </Button>
            }
          >
            <SideEditor side={side} locale={locale} />
          </Panel>
        ))}
      </div>

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

/** Recomputes the damage of every attacker move when anything changes (debounced). */
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
        if (!cancelled) setResults(next);
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [attacker, defender, field]);
  return results;
}

function ResultsTable({
  results,
  defender,
  locale,
}: {
  results: MoveResult[];
  defender: CalcSide;
  locale: Locale;
}) {
  if (results.length === 0) {
    return <p className="p-4 text-sm text-muted">El atacante no tiene movimientos.</p>;
  }
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Daño de cada movimiento</caption>
      <thead className="text-left text-xs text-muted">
        <tr>
          <th className="px-4 py-2 font-medium">Movimiento</th>
          <th className="px-2 py-2 font-medium">Daño</th>
          <th className="px-2 py-2 font-medium">% de PS</th>
          <th className="px-4 py-2 font-medium">Resultado</th>
        </tr>
      </thead>
      <tbody>
        {results.map(({ move, result, error }) => (
          <tr key={move} className="border-t border-border">
            <th scope="row" className="px-4 py-2 text-left font-semibold">
              {moveName(move, locale)}
            </th>
            {result && result.max > 0 ? (
              <>
                <td className="px-2 py-2 font-mono">
                  {result.min}–{result.max}
                </td>
                <td className="px-2 py-2 font-mono">
                  {result.minPercent}–{result.maxPercent} %
                </td>
                <td className="px-4 py-2">{koText(result, defender)}</td>
              </>
            ) : (
              <td colSpan={3} className="px-2 py-2 text-muted">
                {error ??
                  (getMove(move)?.category === 'Status'
                    ? 'Movimiento de estado: no hace daño directo.'
                    : 'No le afecta.')}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "KO seguro", "62,5 % de KO" or "2–3 golpes para KO" (from the defender's current HP). */
export function koText(result: CalcResponse, defender: Pick<CalcSide, 'hpPercent'>): string {
  const hit = result.accuracy < 1 ? ` (si acierta: ${Math.round(result.accuracy * 100)} %)` : '';
  const from = defender.hpPercent < 100 ? ` desde el ${defender.hpPercent} % de PS` : '';
  if (result.koChance >= 1) return `KO seguro${from}${hit}`;
  if (result.koChance > 0) {
    const chance = (result.koChance * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 });
    return `${chance} % de KO de un golpe${from}${hit}`;
  }
  if (!result.hitsToKo) return '—';
  const { best, worst } = result.hitsToKo;
  return `${best === worst ? best : `${best}–${worst}`} golpes para KO${from}`;
}

function FieldControls() {
  const { field, updateField } = useCalc();
  const locale = useSettings((state) => state.namesLocale);
  return (
    <Panel title="Campo">
      <div className="flex flex-wrap items-end gap-4 p-4">
        <Segmented
          label="Modo"
          value={field.mode}
          onChange={(mode) => updateField({ mode })}
          options={[
            { value: 'singles', label: 'Individuales' },
            { value: 'doubles', label: 'Dobles', title: 'Los movimientos múltiples hacen el 75 %' },
          ]}
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted">Clima</span>
          <select
            value={field.weather ?? ''}
            onChange={(event) =>
              updateField({ weather: (event.target.value || null) as typeof field.weather })
            }
            className="rounded-lg border border-border bg-panel-2 px-2 py-1.5"
          >
            <option value="">Ninguno</option>
            {CALC_WEATHERS.map((weather) => (
              <option key={weather} value={weather}>
                {weatherName(weather, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted">Campo</span>
          <select
            value={field.terrain ?? ''}
            onChange={(event) =>
              updateField({ terrain: (event.target.value || null) as typeof field.terrain })
            }
            className="rounded-lg border border-border bg-panel-2 px-2 py-1.5"
          >
            <option value="">Ninguno</option>
            {CALC_TERRAINS.map((terrain) => (
              <option key={terrain} value={terrain}>
                {TERRAIN_LABEL[terrain]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1 text-xs font-medium text-muted">Pantallas del defensor</legend>
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
      </div>
    </Panel>
  );
}

function SideEditor({ side, locale }: { side: 'attacker' | 'defender'; locale: Locale }) {
  const state = useCalc((store) => store[side]);
  const mode = useCalc((store) => store.field.mode);
  const updateSide = useCalc((store) => store.updateSide);
  const draft = useMemo(() => replaceMembers(newDraft(mode), [state.set]), [mode, state.set]);
  const label = side === 'attacker' ? 'atacante' : 'defensor';
  const canMega = megaOf(state.set) !== null;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-end gap-4 border-b border-border p-4">
        <Checkbox
          label="Megaevolucionado"
          checked={state.mega && canMega}
          onChange={(mega) => updateSide(side, { mega })}
          hint={canMega ? undefined : 'Necesita su megapiedra.'}
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted">PS (%)</span>
          <input
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
            className="w-20 rounded-lg border border-border bg-panel-2 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted">Estado</span>
          <select
            value={state.status ?? ''}
            aria-label={`Estado del ${label}`}
            onChange={(event) =>
              updateSide(side, { status: (event.target.value || null) as CalcStatus | null })
            }
            className="rounded-lg border border-border bg-panel-2 px-2 py-1.5"
          >
            <option value="">Sano</option>
            {CALC_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusName(status, locale)}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-xs font-medium text-muted">
            Cambios de características
          </legend>
          {BOOST_STATS.map((stat) => (
            <label key={stat} className="flex items-center gap-1 text-sm">
              <span className="text-xs text-muted">{boostShort(stat, locale)}</span>
              <select
                value={state.boosts[stat] ?? 0}
                aria-label={`${boostShort(stat, locale)} del ${label}`}
                onChange={(event) =>
                  updateSide(side, {
                    boosts: { ...state.boosts, [stat]: Number(event.target.value) },
                  })
                }
                className="rounded-lg border border-border bg-panel-2 px-1 py-1"
              >
                {BOOST_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {value > 0 ? `+${value}` : value}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      </div>
      <SetEditor
        draft={draft}
        index={0}
        locale={locale}
        problems={{}}
        onChange={(set) => updateSide(side, { set, mega: state.mega && megaOf(set) !== null })}
      />
    </div>
  );
}
