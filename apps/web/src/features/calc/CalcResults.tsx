/** The damage of every attacker move against the defender, live or saved in the history. */
import { getMove, type Locale } from '@colleja/data';
import { moveName } from '@colleja/narration';
import type { CalcResponse } from '@colleja/protocol';
import { TypeBadge } from '../../components/TypeBadge';
import type { MoveResult } from './calc-history';
import type { CalcSide } from './calc-store';

export function ResultsTable({
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
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">Daño de cada movimiento</caption>
        <thead className="text-left">
          <tr className="eyebrow text-faint">
            <th className="px-4 py-3 font-semibold">Movimiento</th>
            <th className="px-3 py-3 text-right font-semibold">PS</th>
            <th className="px-3 py-3 font-semibold">% de PS</th>
            <th className="px-4 py-3 font-semibold">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {results.map(({ move, result, error }) => {
            const data = getMove(move);
            return (
              <tr key={move} className="border-t border-line">
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  <span className="flex items-center gap-3">
                    {data && <TypeBadge type={data.type} locale={locale} />}
                    <span className="font-semibold">{moveName(move, locale)}</span>
                  </span>
                </th>
                {result && result.max > 0 ? (
                  <>
                    <td className="px-3 py-3 text-right font-display text-base font-semibold whitespace-nowrap tabular-nums">
                      {result.min}–{result.max}
                    </td>
                    <td className="w-[38%] px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-24 shrink-0 font-display text-base font-semibold whitespace-nowrap tabular-nums">
                          {result.minPercent}–{result.maxPercent} %
                        </span>
                        <DamageBar result={result} hpPercent={defender.hpPercent} />
                      </div>
                    </td>
                    <td
                      className={`px-4 py-3 ${result.koChance >= 1 ? 'font-semibold text-bad' : result.koChance > 0 ? 'text-warn' : 'text-muted'}`}
                    >
                      {koText(result, defender)}
                    </td>
                  </>
                ) : (
                  <td colSpan={3} className="px-3 py-3 text-faint">
                    {error ??
                      (data?.category === 'Status' ? 'Movimiento de estado' : 'No le afecta')}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The damage range over the defender's HP bar; the tick is its current HP. */
function DamageBar({ result, hpPercent }: { result: CalcResponse; hpPercent: number }) {
  const from = Math.min(100, result.minPercent);
  const to = Math.min(100, result.maxPercent);
  const color =
    result.koChance >= 1 ? 'var(--bad)' : result.koChance > 0 ? 'var(--warn)' : 'var(--accent)';
  return (
    <span className="relative h-2 min-w-20 flex-1 bg-surface-3" aria-hidden="true">
      <span
        className="absolute inset-y-0 left-0 opacity-35"
        style={{ width: `${from}%`, background: color }}
      />
      <span
        className="absolute inset-y-0"
        style={{ left: `${from}%`, width: `${Math.max(1, to - from)}%`, background: color }}
      />
      <span
        className="absolute -inset-y-1 w-0.5 bg-text"
        style={{ left: `calc(${Math.min(100, hpPercent)}% - 1px)` }}
      />
    </span>
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
