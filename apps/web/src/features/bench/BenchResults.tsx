/**
 * The table of a bench: the total and one row per rival (and mode) with its win rate, its
 * 95 % interval and, in an A/B comparison, the difference B − A. Weakest rivals first.
 */
import type {
  BenchSetup,
  BenchSummaryValue,
  EstimateValue,
  StratumSummaryValue,
  TallySummaryValue,
} from '@colleja/protocol';
import { IconPlay } from '../../components/icons';
import { Chip, IconButton, Notice } from '../../components/ui';

const percent = (value: number) => `${(value * 100).toFixed(1).replace('.', ',')} %`;
const signed = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value * 100)
    .toFixed(1)
    .replace('.', ',')}`;
const margin = ({ interval }: EstimateValue) =>
  `± ${(((interval[1] - interval[0]) / 2) * 100).toFixed(1).replace('.', ',')}`;
const MODE: Record<string, string> = { singles: 'Indiv.', doubles: 'Dobles' };

export const STOP_LABEL: Record<NonNullable<BenchSummaryValue['stopReason']>, string> = {
  fixed: 'Combates fijos jugados',
  margin: 'Margen alcanzado',
  'clear-difference': 'Diferencia clara',
  cap: 'Tope de combates',
  cancelled: 'Cancelado',
  'nothing-to-play': 'Nada que jugar',
};

/** Rows in the order that helps most: where the team (or version B) does worst first. */
function sortRows(rows: StratumSummaryValue[], paired: boolean): StratumSummaryValue[] {
  const key = (row: StratumSummaryValue) =>
    paired ? (row.difference?.mean ?? 0) : (row.team.winRate ?? 1);
  return [...rows].sort((a, b) => key(a) - key(b));
}

export function BenchResults({
  setup,
  summary,
  onPlay,
}: {
  setup: BenchSetup;
  summary: BenchSummaryValue;
  onPlay: (row: StratumSummaryValue) => void;
}) {
  const paired = setup.versus !== undefined;
  const showMode = setup.modes.length > 1;
  const { total } = summary;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-4 sm:grid-cols-3">
        <TotalFigure label={setup.team.name} estimate={total.team} kind="rate" />
        {paired && (
          <>
            <TotalFigure
              label={setup.versus?.name ?? 'Versión B'}
              estimate={total.versus ?? null}
              kind="rate"
            />
            <TotalFigure label="B − A" estimate={total.difference ?? null} kind="difference" />
          </>
        )}
      </dl>

      <table className="w-full text-sm" aria-label="Resultado por rival">
        <thead>
          <tr className="eyebrow border-b border-line text-left text-faint">
            <th className="py-2 pr-3 font-normal">Rival</th>
            <th className="py-2 pr-3 font-normal">{paired ? 'A' : 'Victorias'}</th>
            {paired && <th className="py-2 pr-3 font-normal">B</th>}
            {paired && <th className="py-2 pr-3 text-right font-normal">B − A</th>}
            <th className="w-10 py-2">
              <span className="sr-only">Jugar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortRows(summary.strata, paired).map((row) => (
            <tr
              key={`${row.opponentId}:${row.mode}`}
              className="border-b border-line last:border-b-0"
            >
              <th scope="row" className="max-w-0 py-2 pr-3 text-left font-semibold">
                <span className="flex items-center gap-2">
                  <span className="truncate">{row.opponentName}</span>
                  {showMode && <Chip>{MODE[row.mode]}</Chip>}
                </span>
              </th>
              <td className={`${paired ? 'w-[24%]' : 'w-[45%]'} py-2 pr-3`}>
                <RateBar tally={row.team} compact={paired} />
              </td>
              {paired && row.versus && (
                <td className="w-[24%] py-2 pr-3">
                  <RateBar tally={row.versus} outlined compact />
                </td>
              )}
              {paired && (
                <td className="py-2 pr-3 text-right font-display text-base whitespace-nowrap tabular-nums">
                  {row.difference && row.difference.pairs > 0 ? (
                    <DifferenceValue estimate={row.difference} />
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
              )}
              <td className="py-2 text-right">
                <IconButton label={`Jugar contra ${row.opponentName}`} onClick={() => onPlay(row)}>
                  <IconPlay size={14} />
                </IconButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {summary.battles.errors > 0 && (
        <Notice
          tone="warn"
          title={`${summary.battles.errors} combates no se pudieron terminar (fallo del bot): no cuentan en el %.`}
          items={[
            ...new Set(
              summary.failures.map((failure) => `${failure.opponentName}: ${failure.error}`),
            ),
          ].slice(0, 3)}
        />
      )}
      {summary.skipped.length > 0 && (
        <Notice
          tone="warn"
          title="Equipos saltados por no ser legales en el modo"
          items={[
            ...new Set(
              summary.skipped.map(
                (skipped) =>
                  `${skipped.name} (${MODE[skipped.mode]}): ${skipped.problems[0] ?? ''}`,
              ),
            ),
          ]}
        />
      )}
    </div>
  );
}

function TotalFigure({
  label,
  estimate,
  kind,
}: {
  label: string;
  estimate: EstimateValue | null;
  kind: 'rate' | 'difference';
}) {
  return (
    <div className="min-w-0 rounded-sm border border-line bg-surface-2 px-4 py-3">
      <dt className="eyebrow truncate text-faint">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-2">
        {estimate ? (
          <>
            <span className="display text-4xl tabular-nums">
              {kind === 'rate' ? percent(estimate.mean) : <DifferenceValue estimate={estimate} />}
            </span>
            <span className="text-sm text-muted tabular-nums">{margin(estimate)}</span>
          </>
        ) : (
          <span className="display text-4xl text-faint">—</span>
        )}
      </dd>
    </div>
  );
}

/** A difference in points, coloured only when its interval leaves out 0. */
function DifferenceValue({ estimate }: { estimate: EstimateValue }) {
  const clear = estimate.interval[0] > 0 || estimate.interval[1] < 0;
  const tone = !clear ? 'text-text' : estimate.mean > 0 ? 'text-good' : 'text-bad';
  return (
    <span
      className={tone}
      title={`IC 95 %: ${signed(estimate.interval[0])} a ${signed(estimate.interval[1])}`}
    >
      {signed(estimate.mean)}
    </span>
  );
}

/** Win rate as a bar with its interval, and the record. */
function RateBar({
  tally,
  outlined = false,
  compact = false,
}: {
  tally: TallySummaryValue;
  outlined?: boolean;
  /** Without the record (it stays in the tooltip): A/B tables have two bars per row. */
  compact?: boolean;
}) {
  const rate = tally.winRate;
  const [low, high] = tally.interval;
  const record = `${tally.wins}-${tally.losses}${tally.ties ? `-${tally.ties}` : ''}`;
  return (
    <div
      className="flex items-center gap-3"
      title={`${record}${tally.errors ? ` · ${tally.errors} con error` : ''} · IC 95 %: ${percent(low)} – ${percent(high)}`}
    >
      <div
        className="relative h-2.5 flex-1 overflow-hidden rounded-xs bg-surface-3"
        aria-hidden="true"
      >
        {rate !== null && (
          <>
            <div
              className={`absolute inset-y-0 left-0 ${outlined ? 'border-2 border-accent-fg' : 'bg-accent'}`}
              style={{ width: `${rate * 100}%` }}
            />
            {/* The 95 % interval, as a thin line over the bar. */}
            <div
              className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-text/60"
              style={{ left: `${low * 100}%`, width: `${(high - low) * 100}%` }}
            />
          </>
        )}
      </div>
      <span className="w-14 text-right font-display text-base tabular-nums">
        {rate === null ? '—' : percent(rate)}
      </span>
      {!compact && (
        <span className="hidden w-12 text-right text-xs text-muted tabular-nums md:inline">
          {record}
        </span>
      )}
    </div>
  );
}
